import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LastfmScrobble } from "./rules";
import {
  MAX_QUEUED_SCROBBLES,
  dueScrobbles,
  enqueueScrobble,
  flushQueue,
  loadQueue,
  nextDueAtMs,
  pokeQueue,
  queuedCount,
  retryDelayMs,
  scrobbleId,
} from "./queue";

const NOW = 5_000_000;

const scrobble = (overrides: Partial<LastfmScrobble> = {}): LastfmScrobble => ({
  artist: "Artist",
  title: "Song",
  album: "",
  durationSec: 200,
  timestampSec: 4_995,
  ...overrides,
});

describe("enqueueScrobble", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the scrobble for the next start", () => {
    const entry = enqueueScrobble(scrobble(), NOW);
    expect(entry).toMatchObject({ attempts: 0, nextTryAtMs: NOW });
    expect(entry.id).toBe(scrobbleId(scrobble()));
    expect(loadQueue()).toHaveLength(1);
  });

  it("queues the same listen once, however often it is noted", () => {
    const first = enqueueScrobble(scrobble(), NOW);
    const second = enqueueScrobble(scrobble(), NOW + 1_000);
    expect(second).toEqual(first);
    expect(loadQueue()).toHaveLength(1);
  });

  it("tells two listens apart by their start", () => {
    enqueueScrobble(scrobble({ timestampSec: 100 }), NOW);
    enqueueScrobble(scrobble({ timestampSec: 200 }), NOW);
    expect(loadQueue()).toHaveLength(2);
  });

  it("keeps the newest two thousand, as the backend queue does", () => {
    for (let n = 0; n < MAX_QUEUED_SCROBBLES + 5; n++) {
      enqueueScrobble(scrobble({ title: `Song ${n}`, timestampSec: n }), NOW);
    }
    const stored = loadQueue();
    expect(stored).toHaveLength(MAX_QUEUED_SCROBBLES);
    expect(stored[0]?.title).toBe("Song 5");
  });

  it("reads a corrupt store as empty and queues over it", () => {
    localStorage.setItem("lastfm_scrobble_queue_v1", "not json{");
    expect(loadQueue()).toEqual([]);
    enqueueScrobble(scrobble(), NOW);
    expect(loadQueue()).toHaveLength(1);
  });

  it("never stores key material with the scrobbles", () => {
    enqueueScrobble(scrobble({ artist: "Artist", title: "Song" }), NOW);
    const dump = localStorage.getItem("lastfm_scrobble_queue_v1") ?? "";
    expect(dump).not.toMatch(/apiKey|api_key|secret|sessionKey|"sk"/);
  });
});

describe("dueScrobbles", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sends oldest first, only what is due, at most a batch", () => {
    enqueueScrobble(scrobble({ title: "old", timestampSec: 1 }), NOW - 1_000);
    enqueueScrobble(scrobble({ title: "new", timestampSec: 2 }), NOW - 1_000);
    const due = dueScrobbles(NOW, 1);
    expect(due.map((entry) => entry.title)).toEqual(["old"]);
    expect(dueScrobbles(NOW - 2_000)).toEqual([]);
  });
});

describe("retryDelayMs", () => {
  it("backs off from thirty seconds to two hours", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(99)).toBe(2 * 60 * 60_000);
  });
});

describe("flushQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes only what Last.fm took", async () => {
    enqueueScrobble(scrobble({ title: "one", timestampSec: 1 }), NOW);
    enqueueScrobble(scrobble({ title: "two", timestampSec: 2 }), NOW);
    const seen: string[][] = [];
    const flush = await flushQueue(async (batch) => {
      seen.push(batch.map((entry) => entry.title));
      return "sent";
    }, NOW);
    expect(seen).toEqual([["one", "two"]]);
    expect(flush).toEqual({ sent: 2, waiting: 0, signedOut: false });
    expect(queuedCount()).toBe(0);
  });

  it("sends nothing when nothing is due", async () => {
    const send = vi.fn(async () => "sent" as const);
    const flush = await flushQueue(send, NOW);
    expect(send).not.toHaveBeenCalled();
    expect(flush).toEqual({ sent: 0, waiting: 0, signedOut: false });
  });

  it("keeps a failed batch with a longer wait", async () => {
    enqueueScrobble(scrobble(), NOW);
    const flush = await flushQueue(async () => "retry", NOW);
    expect(flush).toEqual({ sent: 0, waiting: 1, signedOut: false });
    const [entry] = loadQueue();
    expect(entry?.attempts).toBe(1);
    expect(entry?.nextTryAtMs).toBe(NOW + 30_000);
    expect(dueScrobbles(NOW + 29_999)).toHaveLength(0);
    expect(dueScrobbles(NOW + 30_000)).toHaveLength(1);
  });

  it("keeps a batch the credentials reject, and says so", async () => {
    enqueueScrobble(scrobble(), NOW);
    const flush = await flushQueue(async () => "signedOut", NOW);
    expect(flush.signedOut).toBe(true);
    expect(queuedCount()).toBe(1);
  });

  it("retries a send that threw, without losing the batch", async () => {
    enqueueScrobble(scrobble(), NOW);
    const flush = await flushQueue(async () => {
      throw new Error("down");
    }, NOW);
    expect(flush).toEqual({ sent: 0, waiting: 1, signedOut: false });
    expect(loadQueue()[0]?.attempts).toBe(1);
  });

  it("shares one in-flight batch, so a retry never double-sends it", async () => {
    enqueueScrobble(scrobble(), NOW);
    let sends = 0;
    const send = async () => {
      sends += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "sent" as const;
    };
    const [first, second] = await Promise.all([flushQueue(send, NOW), flushQueue(send, NOW)]);
    expect(sends).toBe(1);
    expect(first.sent + second.sent).toBe(1);
    expect(queuedCount()).toBe(0);
  });
});

describe("pokeQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("makes everything due at once", async () => {
    enqueueScrobble(scrobble(), NOW);
    await flushQueue(async () => "retry", NOW);
    expect(dueScrobbles(NOW)).toHaveLength(0);
    pokeQueue(NOW);
    expect(dueScrobbles(NOW)).toHaveLength(1);
  });
});

describe("nextDueAtMs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is null with nothing waiting, now when something is due", async () => {
    expect(nextDueAtMs(NOW)).toBeNull();
    enqueueScrobble(scrobble(), NOW);
    expect(nextDueAtMs(NOW)).toBe(NOW);
    await flushQueue(async () => "retry", NOW);
    expect(nextDueAtMs(NOW)).toBe(NOW + 30_000);
  });
});
