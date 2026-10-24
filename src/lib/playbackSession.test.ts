import { describe, expect, it } from "vitest";
import { parsePlaybackPosition, parsePlaybackSession, resolveLaunchRestoreMode, serializePlaybackSession } from "./playbackSession";

describe("playback session persistence", () => {
  it("defaults to restoring the queue paused and keeps resume modes exclusive", () => {
    expect(resolveLaunchRestoreMode(false, true)).toBe("paused");
    expect(resolveLaunchRestoreMode(true, true)).toBe("playing");
    expect(resolveLaunchRestoreMode(false, false)).toBe("off");
  });

  it("round-trips a queue, current index, and finite position", () => {
    const raw = serializePlaybackSession({ queue: [{ id: "one" }], currentIndex: 0, position: 42.5, playing: true });
    expect(parsePlaybackSession<{ id: string }>(raw)).toEqual({
      queue: [{ id: "one" }],
      currentIndex: 0,
      position: 42.5,
      playing: true,
    });
  });

  it("rejects malformed sessions and clamps invalid indices and positions", () => {
    expect(parsePlaybackSession("bad-json")).toBeNull();
    expect(parsePlaybackSession(JSON.stringify({ queue: [], currentIndex: 0, position: 12 }))).toBeNull();
    expect(parsePlaybackSession(JSON.stringify({ queue: [{ id: "one" }], currentIndex: 8, position: -5 }))).toEqual({
      queue: [{ id: "one" }],
      currentIndex: 0,
      position: 0,
    });
  });

  it("restores a separately throttled position with a session fallback", () => {
    expect(parsePlaybackPosition("81.25", 5)).toBe(81.25);
    expect(parsePlaybackPosition("null", 5)).toBe(5);
    expect(parsePlaybackPosition("bad", -2)).toBe(0);
  });
});
