import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LastfmScrobble } from "./rules";
import type { LastfmCredentials } from "./settings";

let inTauri = true;
let credentials: LastfmCredentials | null = null;
const posted: Array<Array<[string, string]>> = [];
let nextReply = { status: 200, body: "{}" };
let failSend = false;

vi.mock("../api/env", () => ({ isTauriEnv: async () => inTauri }));
vi.mock("../api/errors", () => ({ invokeBackend: vi.fn() }));
vi.mock("./settings", () => ({ lastfmCredentials: () => credentials }));

const { postLastfmForm, sendNowPlaying, sendScrobbleBatch } = await import("./api");
const { invokeBackend } = await import("../api/errors");

const entry = (overrides: Partial<LastfmScrobble> = {}): LastfmScrobble => ({
  artist: "Artist",
  title: "Song",
  album: "",
  durationSec: 200,
  timestampSec: 4_995,
  ...overrides,
});

describe("sendScrobbleBatch", () => {
  beforeEach(() => {
    vi.mocked(invokeBackend).mockClear();
    posted.length = 0;
    vi.mocked(invokeBackend).mockImplementation(async (_command: string, args?: Record<string, unknown>) => {
      posted.push(args?.["form"] as Array<[string, string]>);
      if (failSend) throw new Error("down");
      return nextReply;
    });
    inTauri = true;
    credentials = { apiKey: "api-key", secret: "api-secret", sessionKey: "session-key" };
    nextReply = { status: 200, body: "{}" };
    failSend = false;
    localStorage.clear();
  });

  it("posts one signed form for the batch", async () => {
    expect(await sendScrobbleBatch([entry(), entry({ title: "Other", timestampSec: 5_000 })])).toBe("sent");
    expect(posted).toHaveLength(1);
    const fields = new Map(posted[0]);
    expect(fields.get("method")).toBe("track.scrobble");
    expect(fields.get("sk")).toBe("session-key");
    expect(fields.get("api_key")).toBe("api-key");
    expect(fields.get("api_sig")).toMatch(/^[0-9a-f]{32}$/);
    expect(fields.get("format")).toBe("json");
    expect(fields.get("track[1]")).toBe("Other");
  });

  it("treats missing keys as signed out, without calling", async () => {
    credentials = null;
    expect(await sendScrobbleBatch([entry()])).toBe("signedOut");
    expect(posted).toHaveLength(0);
  });

  it("retries outside Tauri, on failure and on outage replies", async () => {
    inTauri = false;
    expect(await sendScrobbleBatch([entry()])).toBe("retry");
    inTauri = true;
    failSend = true;
    expect(await sendScrobbleBatch([entry()])).toBe("retry");
    failSend = false;
    nextReply = { status: 200, body: JSON.stringify({ error: 8 }) };
    expect(await sendScrobbleBatch([entry()])).toBe("retry");
    nextReply = { status: 429, body: "{}" };
    expect(await sendScrobbleBatch([entry()])).toBe("retry");
  });

  it("passes the reply's verdict through", async () => {
    nextReply = { status: 200, body: JSON.stringify({ error: 9 }) };
    expect(await sendScrobbleBatch([entry()])).toBe("signedOut");
    nextReply = { status: 200, body: JSON.stringify({ error: 6 }) };
    expect(await sendScrobbleBatch([entry()])).toBe("sent");
  });

  it("leaves no key material in web storage", async () => {
    await sendScrobbleBatch([entry()]);
    const dump = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.getItem(localStorage.key(index) ?? "") ?? "",
    ).join("\n");
    expect(dump).not.toContain("api-key");
    expect(dump).not.toContain("api-secret");
    expect(dump).not.toContain("session-key");
  });
});

describe("sendNowPlaying", () => {
  beforeEach(() => {
    posted.length = 0;
    inTauri = true;
    credentials = { apiKey: "api-key", secret: "api-secret", sessionKey: "session-key" };
    failSend = false;
  });

  it("announces without queueing and never throws", async () => {
    await sendNowPlaying(entry());
    expect(new Map(posted[0]).get("method")).toBe("track.updateNowPlaying");
    failSend = true;
    await expect(sendNowPlaying(entry())).resolves.toBeUndefined();
    credentials = null;
    inTauri = false;
    await expect(sendNowPlaying(entry())).resolves.toBeUndefined();
  });
});

describe("postLastfmForm", () => {
  it("calls the embedded pipe command", async () => {
    failSend = false;
    vi.mocked(invokeBackend).mockClear();
    await postLastfmForm([["method", "track.scrobble"]]);
    expect(vi.mocked(invokeBackend).mock.calls[0]?.[0]).toBe("lastfm_embedded_post");
  });
});
