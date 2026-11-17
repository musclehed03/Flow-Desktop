import { beforeEach, describe, expect, it } from "vitest";

import type { SongItem } from "../../types/music";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { useMusicActionsStore } from "../../store/useMusicActionsStore";
import { SETTINGS } from "../settings/schema";
import { loadQueue } from "./queue";
import { LastfmSession, type LastfmSessionEnv } from "./session";

const song = (overrides: Partial<SongItem> = {}): SongItem => ({
  id: "v1",
  videoId: "v1",
  title: "Song",
  artists: [{ id: "a1", name: "Artist" }],
  album: null,
  duration: 200,
  musicVideoType: null,
  thumbnail: "",
  explicit: false,
  playlistId: null,
  params: null,
  ...overrides,
});

interface Harness {
  session: LastfmSession;
  queued: Array<{ track: SongItem; startedAtMs: number }>;
  announced: Array<{ track: SongItem; startedAtMs: number }>;
  setNow: (now: number) => void;
  setOn: (on: boolean) => void;
  setNowPlaying: (on: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  setDeepFlow: (allows: boolean) => void;
}

function harness(): Harness {
  const queued: Harness["queued"] = [];
  const announced: Harness["announced"] = [];
  let now = 1_000_000;
  let on = true;
  let nowPlaying = true;
  let blocked = false;
  let deepFlow = true;
  const env: LastfmSessionEnv = {
    nowMs: () => now,
    scrobblingOn: () => on,
    nowPlayingOn: () => nowPlaying,
    blocked: () => blocked,
    deepFlowAllows: () => deepFlow,
    queue: (track, startedAtMs) => queued.push({ track, startedAtMs }),
    announce: (track, startedAtMs) => announced.push({ track, startedAtMs }),
  };
  return {
    session: new LastfmSession(env),
    queued,
    announced,
    setNow: (value) => {
      now = value;
    },
    setOn: (value) => {
      on = value;
    },
    setNowPlaying: (value) => {
      nowPlaying = value;
    },
    setBlocked: (value) => {
      blocked = value;
    },
    setDeepFlow: (value) => {
      deepFlow = value;
    },
  };
}

describe("LastfmSession", () => {
  it("scrobbles once when the listen first counts as played", () => {
    const h = harness();
    h.session.note(song(), 99, 200);
    expect(h.queued).toHaveLength(0);
    h.setNow(1_060_000);
    h.session.note(song(), 100, 200);
    expect(h.queued).toHaveLength(1);
    h.session.note(song(), 150, 200);
    expect(h.queued).toHaveLength(1);
  });

  it("scrobbles a long track at four minutes", () => {
    const h = harness();
    h.session.note(song({ duration: 1200 }), 239, 1200);
    expect(h.queued).toHaveLength(0);
    h.session.note(song({ duration: 1200 }), 240, 1200);
    expect(h.queued).toHaveLength(1);
  });

  it("never scrobbles a track too short to count", () => {
    const h = harness();
    h.session.note(song({ duration: 25 }), 25, 25);
    expect(h.queued).toHaveLength(0);
  });

  it("starts the timestamp when the listen began", () => {
    const h = harness();
    h.session.note(song(), 5, 200);
    h.setNow(1_100_000);
    h.session.note(song(), 100, 200);
    expect(h.queued[0]?.startedAtMs).toBe(995_000);
  });

  it("scrobbles each track of a change once", () => {
    const h = harness();
    const a = song({ videoId: "a", id: "a" });
    const b = song({ videoId: "b", id: "b", title: "Other" });
    h.session.note(a, 100, 200);
    h.session.note(b, 5, 200);
    h.session.note(b, 100, 200);
    expect(h.queued.map((entry) => entry.track.videoId)).toEqual(["a", "b"]);
  });

  it("scrobbles a replay as a new listen", () => {
    const h = harness();
    h.session.note(song(), 100, 200);
    h.session.note(song(), 3, 200);
    h.session.note(song(), 100, 200);
    expect(h.queued).toHaveLength(2);
  });

  it("scrobbles nothing while the owner has it off, and never twice for it", () => {
    const h = harness();
    h.setOn(false);
    h.session.note(song(), 150, 200);
    expect(h.queued).toHaveLength(0);
    h.setOn(true);
    h.session.note(song(), 160, 200);
    expect(h.queued).toHaveLength(1);
    h.setOn(false);
    h.session.note(song(), 170, 200);
    h.setOn(true);
    h.session.note(song(), 180, 200);
    expect(h.queued).toHaveLength(1);
  });

  it("scrobbles nothing blocked or Deep Flow private", () => {
    const blocked = harness();
    blocked.setBlocked(true);
    blocked.session.note(song(), 150, 200);
    expect(blocked.queued).toHaveLength(0);

    const deepFlow = harness();
    deepFlow.setDeepFlow(false);
    deepFlow.session.note(song(), 150, 200);
    expect(deepFlow.queued).toHaveLength(0);
  });

  it("announces each listen once, and never while gated", () => {
    const h = harness();
    h.session.note(song(), 5, 200);
    h.session.note(song(), 6, 200);
    expect(h.announced).toHaveLength(1);

    const quiet = harness();
    quiet.setNowPlaying(false);
    quiet.session.note(song(), 5, 200);
    expect(quiet.announced).toHaveLength(0);

    const off = harness();
    off.setOn(false);
    off.session.note(song(), 5, 200);
    expect(off.announced).toHaveLength(0);
  });

  it("leaves library files on the device", () => {
    const h = harness();
    h.session.note(song({ videoId: "local_0123456789abcdef", id: "local_0123456789abcdef" }), 150, 200);
    expect(h.queued).toHaveLength(0);
    expect(h.announced).toHaveLength(0);
  });
});

describe("LastfmSession live wiring", () => {
  const API_KEY = "test-only-api-key-AAAA";
  const SECRET = "test-only-secret-BBBB";
  const SESSION = "test-only-session-CCCC";

  beforeEach(() => {
    localStorage.clear();
    useAppSettingsStore.setState({
      values: {
        [SETTINGS.LASTFM_ENABLED]: "true",
        [SETTINGS.LASTFM_API_KEY]: API_KEY,
        [SETTINGS.LASTFM_SECRET]: SECRET,
        [SETTINGS.LASTFM_SESSION_KEY]: SESSION,
      },
    });
    useMusicActionsStore.setState({
      dismissedTrackIds: new Set(),
      blockedTracks: new Map(),
      blockedArtists: new Map(),
      suppressedArtistKeys: new Map(),
      loaded: true,
    });
  });

  it("queues a counted listen into storage without its keys", () => {
    const session = new LastfmSession();
    session.note(song(), 5, 200);
    session.note(song(), 100, 200);
    const stored = loadQueue();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ artist: "Artist", title: "Song" });
    const dump = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.getItem(localStorage.key(index) ?? "") ?? "",
    ).join("\n");
    expect(dump).not.toContain(API_KEY);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain(SESSION);
  });

  it("queues nothing for a blocked track", () => {
    useMusicActionsStore.setState({ blockedTracks: new Map([["v1", "Song"]]) });
    const session = new LastfmSession();
    session.note(song(), 150, 200);
    expect(loadQueue()).toHaveLength(0);
  });

  it("queues nothing for a blocked artist", () => {
    useMusicActionsStore.setState({ blockedArtists: new Map([["a1", "Artist"]]) });
    const session = new LastfmSession();
    session.note(song(), 150, 200);
    expect(loadQueue()).toHaveLength(0);
  });
});
