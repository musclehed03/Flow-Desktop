import { useDjSession } from "../lib/djSession";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MusicStreamInfo, SongItem } from "../types/music";

const song = (id: string): SongItem => ({
  id,
  title: `Song ${id}`,
  artists: [],
  album: null,
  duration: 200,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
  thumbnail: "",
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const calls: string[] = [];
const { engine, resolveMusicStream, getMusicWatchQueue } = vi.hoisted(() => ({
  engine: {
    activatePreloaded: vi.fn(() => false),
    clearPreload: vi.fn(() => null),
    getActiveLoudness: vi.fn(() => -3),
    setLoudness: vi.fn(),
    load: vi.fn(async () => {}),
    seekWhenReady: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    getContextState: vi.fn(() => "running"),
    getBufferedEnd: vi.fn(() => 10),
  },
  resolveMusicStream: vi.fn(),
  getMusicWatchQueue: vi.fn(),
}));

vi.mock("../lib/audio/musicAudioEngine", () => ({ musicAudioEngine: engine }));
vi.mock("../lib/musicStreamResolution", () => ({
  resolveMusicStream,
  prefetchMusicStream: vi.fn(),
  invalidateMusicStream: vi.fn(),
}));
vi.mock("../lib/musicPreload", () => ({ preloadTrack: vi.fn() }));
vi.mock("../lib/useDownloads", () => ({ findDownloadedRecord: () => undefined }));
vi.mock("./useDownloadsLibraryStore", () => ({
  useDownloadsLibraryStore: { getState: () => ({ loaded: true, ensureLoaded: async () => {} }) },
}));
vi.mock("../lib/api/music", () => ({
  getMusicWatchQueue,
  getMusicQueueContinuation: vi.fn(),
  rankMusicCandidates: (items: SongItem[]) => Promise.resolve(items),
}));

import { useMusicPlayerStore } from "./useMusicPlayerStore";

const stream = (id: string) =>
  ({ videoId: id, audioUrl: `http://127.0.0.1/stream/${id}`, loudnessDb: -2 }) as MusicStreamInfo;

beforeEach(() => {
  useDjSession.setState({ played: [] });
  calls.length = 0;
  engine.play.mockImplementation(async () => {
    calls.push("play");
  });
  getMusicWatchQueue.mockImplementation(async () => {
    calls.push("radio");
    return { items: [], continuation: null, radioPlaylistId: null };
  });
  resolveMusicStream.mockImplementation(async (id: string) => stream(id));
  useMusicPlayerStore.setState({ radioEnabled: true, isShuffle: false, repeatMode: "none" });
});

afterEach(() => {
  vi.clearAllMocks();
  engine.activatePreloaded.mockReturnValue(false);
});

describe("starting a track", () => {
  it("plays a preloaded track without looking it up again", async () => {
    engine.activatePreloaded.mockReturnValue(true);
    await useMusicPlayerStore.getState().playTrack(song("next"));

    expect(resolveMusicStream).not.toHaveBeenCalled();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(useMusicPlayerStore.getState().loudnessDb).toBe(-3);
  });

  it("fetches the radio only once the track is playing", async () => {
    await useMusicPlayerStore.getState().playTrack(song("first"));
    await Promise.resolve();

    expect(calls[0]).toBe("play");
    expect(calls).toContain("radio");
  });

  it("retries a failed lookup once before showing an error", async () => {
    resolveMusicStream.mockRejectedValueOnce({ kind: "streaming", message: "timed out" });
    await useMusicPlayerStore.getState().playTrack(song("flaky"));

    expect(resolveMusicStream).toHaveBeenCalledTimes(2);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(useMusicPlayerStore.getState().streamError).toBeNull();
  });
});

describe("recovering from a playback error", () => {
  it("looks the track up again once and resumes where it stopped", async () => {
    await useMusicPlayerStore.getState().playTrack(song("expiring"));
    useMusicPlayerStore.setState({ progress: 42 });

    useMusicPlayerStore.getState()._onPlaybackError();
    await vi.waitFor(() => expect(engine.seekWhenReady).toHaveBeenLastCalledWith(42));
    expect(useMusicPlayerStore.getState().streamError).toBeNull();

    useMusicPlayerStore.getState()._onPlaybackError();
    expect(useMusicPlayerStore.getState().streamError).not.toBeNull();
  });
});

describe("watching for a stalled connection", () => {
  afterEach(() => vi.useRealTimers());

  it("recovers when no data arrives for fifteen seconds", async () => {
    await useMusicPlayerStore.getState().playTrack(song("stalls"));
    vi.useFakeTimers();
    useMusicPlayerStore.setState({ progress: 30 });
    engine.getBufferedEnd.mockReturnValue(10);

    useMusicPlayerStore.getState()._setBuffering(true);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(resolveMusicStream).toHaveBeenCalledTimes(2);
    expect(engine.seekWhenReady).toHaveBeenLastCalledWith(30);
  });

  it("leaves a slow connection alone while bytes keep arriving", async () => {
    await useMusicPlayerStore.getState().playTrack(song("slow"));
    vi.useFakeTimers();
    let buffered = 10;
    engine.getBufferedEnd.mockImplementation(() => (buffered += 1));

    useMusicPlayerStore.getState()._setBuffering(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
    useMusicPlayerStore.getState()._setBuffering(false);
  });
});

import { usePlayerStore } from "./usePlayerStore";
import { useAppSettingsStore } from "./useAppSettingsStore";
import { SETTINGS } from "../lib/settings/schema";
import { prefetchMusicStream } from "../lib/musicStreamResolution";
import { preloadTrack } from "../lib/musicPreload";
vi.mock("../lib/streamResolution", () => ({ prefetchStreamInfo: vi.fn() }));

describe("watching and music view preservation", () => {
  afterEach(() => {
    useMusicPlayerStore.getState().dismiss();
    usePlayerStore.getState().clearQueue();
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.MUSIC_VIDEO_FIRST_ENABLED]: "true" } });
  });
  it.each(["dock", "full", "queue", "lyrics"] as const)("preserves %s through load, next, and ended", async (viewState) => {
    useMusicPlayerStore.setState({ viewState, radioEnabled: false });
    await useMusicPlayerStore.getState().playQueue([song("a"), song("b"), song("c")]);
    expect(useMusicPlayerStore.getState().viewState).toBe(viewState);
    useMusicPlayerStore.getState().next();
    await vi.waitFor(() => expect(useMusicPlayerStore.getState().loadingStreamId).toBeNull());
    expect(useMusicPlayerStore.getState().viewState).toBe(viewState);
    useMusicPlayerStore.getState().handleEnded();
    await vi.waitFor(() => expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("c"));
    expect(useMusicPlayerStore.getState().viewState).toBe(viewState);
  });
  it("hands a collection video to Watch with its ordered queue and requests navigation", async () => {
    const request = vi.fn();
    window.addEventListener("flow-video-expand-request", request);
    const video = { ...song("omv"), musicVideoType: "MUSIC_VIDEO_TYPE_OMV" };
    await useMusicPlayerStore.getState().playQueue([song("before"), video, song("after")], 1, "Collection");
    expect(usePlayerStore.getState().queue.map((v) => v.id)).toEqual(["before", "omv", "after"]);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("omv");
    expect(usePlayerStore.getState().videoPlayerMode).toBe("watch");
    expect(useMusicPlayerStore.getState().currentTrack).toBeNull();
    expect(resolveMusicStream).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    window.removeEventListener("flow-video-expand-request", request);
  });
  it("does not resolve or preload a video before the music queue reaches it", async () => {
    useMusicPlayerStore.setState({ radioEnabled: false });
    const video = { ...song("omv"), musicVideoType: "MUSIC_VIDEO_TYPE_OMV" };
    await useMusicPlayerStore.getState().playQueue([song("audio"), video]);
    useMusicPlayerStore.getState()._prefetchUpcoming();
    useMusicPlayerStore.getState()._preloadUpcoming();
    expect(prefetchMusicStream).not.toHaveBeenCalled();
    expect(preloadTrack).not.toHaveBeenCalled();
    useMusicPlayerStore.getState().handleEnded();
    expect(usePlayerStore.getState().currentVideo?.id).toBe("omv");
    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
  });
  it("retains radio video candidates and hands them to Watch on advance", async () => {
    getMusicWatchQueue.mockResolvedValue({ items: [{ ...song("radio-video"), musicVideoType: "MUSIC_VIDEO_TYPE_UGC" }], continuation: null, radioPlaylistId: null });
    await useMusicPlayerStore.getState().startRadio(song("seed"));
    await useMusicPlayerStore.getState()._ensureRadio();
    expect(useMusicPlayerStore.getState().queue.map((t) => t.id)).toEqual(["seed", "radio-video"]);
    useMusicPlayerStore.getState().handleEnded();
    expect(usePlayerStore.getState().currentVideo?.id).toBe("radio-video");
    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
  });
  it("keeps stock audio loading when video-first is disabled", async () => {
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.MUSIC_VIDEO_FIRST_ENABLED]: "false" } });
    await useMusicPlayerStore.getState().playTrack({ ...song("video-off"), musicVideoType: "MUSIC_VIDEO_TYPE_UGC" });
    expect(resolveMusicStream).toHaveBeenCalledWith("video-off", "Auto");
    expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("video-off");
  });
});
