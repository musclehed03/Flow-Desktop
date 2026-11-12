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
    cancelCrossfade: vi.fn(),
    armCrossfade: vi.fn(),
    setProcessingConfig: vi.fn(),
    getActiveFormat: vi.fn((): { mimeType: string; bitrate: number | null; sampleRate: number | null } | null => null),
    setSourceSampleRate: vi.fn(),
    isDirect: vi.fn(() => false),
    preload: vi.fn(),
    isCrossfading: vi.fn(() => false),
    getCurrentTime: vi.fn(() => 0),
    crossfadeToPreloaded: vi.fn(async () => false),
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
    getErrorCode: vi.fn((): number | null => null),
    wantsAac: vi.fn(() => false),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
  },
  resolveMusicStream: vi.fn(),
  getMusicWatchQueue: vi.fn(),
}));

vi.mock("../lib/audio/musicAudioEngine", () => ({ musicAudioEngine: engine }));
vi.mock("../lib/musicStreamResolution", () => ({
  resolveMusicStream,
  prefetchMusicStream: vi.fn(),
  invalidateMusicStream: vi.fn(),
  isResolveTimeout: (error: { timedOut?: boolean }) => error?.timedOut === true,
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

  it("starts a handed-over queue at its position in one load, paused when asked", async () => {
    await useMusicPlayerStore.getState().playQueue([song("a"), song("b")], 1, null, { at: 42, autoplay: false });

    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
    expect(engine.seekWhenReady).toHaveBeenCalledWith(42);
    expect(engine.play).not.toHaveBeenCalled();
    expect(useMusicPlayerStore.getState()).toMatchObject({ isPlaying: false, progress: 42 });
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
  const MEDIA_ERR_NETWORK = 2;
  const MEDIA_ERR_DECODE = 3;
  const store = () => useMusicPlayerStore.getState();
  const fail = async (code: number | null) => {
    engine.getErrorCode.mockReturnValue(code);
    const loads = engine.load.mock.calls.length;
    store()._onPlaybackError();
    // A recovery reloads the element; a refusal to recover does not.
    await Promise.resolve();
    await vi.waitFor(() => expect(engine.load.mock.calls.length).toBeGreaterThanOrEqual(loads));
  };

  afterEach(() => {
    vi.useRealTimers();
    engine.getErrorCode.mockReturnValue(null);
  });

  it("looks the track up again and resumes where it stopped", async () => {
    await store().playTrack(song("expiring"));
    useMusicPlayerStore.setState({ progress: 42 });

    store()._onPlaybackError();
    await vi.waitFor(() => expect(engine.seekWhenReady).toHaveBeenLastCalledWith(42));
    expect(store().streamError).toBeNull();
    expect(store().isPlaying).toBe(true);
  });

  it("recovers each expired link up to the limit, then names the failure", async () => {
    await store().playTrack(song("dying"));
    for (let i = 0; i < 3; i++) {
      await fail(MEDIA_ERR_NETWORK);
      await vi.waitFor(() => expect(store().loadingStreamId).toBeNull());
      expect(store().streamError).toBeNull();
    }
    await fail(MEDIA_ERR_NETWORK);
    expect(store().streamErrorKind).toBe("streamExpired");
    expect(store().streamError).not.toContain("Playback failed");
  });

  it("forgives earlier failures after two minutes of clean playback", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await store().playTrack(song("long-pauses"));
    for (let i = 0; i < 3; i++) {
      await fail(MEDIA_ERR_NETWORK);
      await vi.waitFor(() => expect(store().loadingStreamId).toBeNull());
    }
    useMusicPlayerStore.setState({ isBuffering: false, isPlaying: true });
    vi.setSystemTime(Date.now() + 2 * 60_000 + 1);
    store()._syncTime(100, 200);

    await fail(MEDIA_ERR_NETWORK);
    await vi.waitFor(() => expect(store().loadingStreamId).toBeNull());
    expect(store().streamError).toBeNull();
  });

  it("asks for AAC after a decode failure, and stops when AAC fails to decode too", async () => {
    await store().playTrack(song("odd-codec"));
    await fail(MEDIA_ERR_DECODE);
    await vi.waitFor(() =>
      expect(resolveMusicStream).toHaveBeenLastCalledWith("odd-codec", expect.anything(), { preferAac: true }),
    );
    await vi.waitFor(() => expect(store().loadingStreamId).toBeNull());

    await fail(MEDIA_ERR_DECODE);
    expect(store().streamErrorKind).toBe("mediaDecode");
  });

  it("keeps a paused song paused while it recovers", async () => {
    await store().playTrack(song("paused-expiry"));
    store().pause();
    engine.play.mockClear();
    await fail(MEDIA_ERR_NETWORK);
    await vi.waitFor(() => expect(store().loadingStreamId).toBeNull());

    expect(engine.play).not.toHaveBeenCalled();
    expect(store().isPlaying).toBe(false);
  });

  it("waits for the connection to come back, then carries on", async () => {
    await store().playTrack(song("offline"));
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await fail(MEDIA_ERR_NETWORK);
    expect(store().streamErrorKind).toBe("network");
    const lookups = resolveMusicStream.mock.calls.length;

    online.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(resolveMusicStream.mock.calls.length).toBe(lookups + 1));
    await vi.waitFor(() => expect(store().streamError).toBeNull());
    online.mockRestore();
  });
});

describe("a lookup that times out", () => {
  it("joins the backend walk instead of starting a new one", async () => {
    const { invalidateMusicStream } = await import("../lib/musicStreamResolution");
    resolveMusicStream.mockRejectedValueOnce({ kind: "streaming", message: "timed out", timedOut: true });
    await useMusicPlayerStore.getState().playTrack(song("slow-ladder"));

    expect(resolveMusicStream).toHaveBeenCalledTimes(2);
    expect(invalidateMusicStream).not.toHaveBeenCalledWith("slow-ladder");
  });
});

describe("watching for a stalled connection", () => {
  afterEach(() => vi.useRealTimers());

  it("leaves a song paused during buffering alone", async () => {
    await useMusicPlayerStore.getState().playTrack(song("paused-buffering"));
    vi.useFakeTimers();
    engine.getBufferedEnd.mockReturnValue(10);
    useMusicPlayerStore.getState()._setBuffering(true);
    useMusicPlayerStore.getState().pause();
    engine.play.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
    expect(engine.play).not.toHaveBeenCalled();

    // A waiting event after the pause starts no watch either.
    useMusicPlayerStore.getState()._setBuffering(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveMusicStream).toHaveBeenCalledTimes(1);
  });

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
    expect(resolveMusicStream).toHaveBeenCalledWith("video-off", "Auto", expect.anything());
    expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("video-off");
  });
});


it("never starts an automatic crossfade merely because a seek lands near the end", async () => {
  const original = useAppSettingsStore.getState().values;
  useAppSettingsStore.setState({ values: { ...original, [SETTINGS.CROSSFADE_ENABLED]: "true" } });
  useMusicPlayerStore.setState({ currentTrack: song("seek-current"), queue: [song("seek-current"),song("seek-next")], currentIndex: 0, isPlaying: true, loadingStreamId: null });
  const next = vi.spyOn(useMusicPlayerStore.getState(), "next").mockImplementation(() => {});
  try {
    useMusicPlayerStore.getState().seek(196);
    useMusicPlayerStore.getState()._syncTime(196,200);
    expect(next).not.toHaveBeenCalled();
    expect(engine.crossfadeToPreloaded).not.toHaveBeenCalled();
    expect(engine.armCrossfade).not.toHaveBeenCalled();
  } finally { next.mockRestore(); useAppSettingsStore.setState({ values: original }); }
});

describe("a queue restored at launch", () => {
  const saved = (ids: string[], currentIndex: number, resumeAt: number) => ({
    queue: ids.map(song),
    currentIndex,
    resumeAt,
    queueSource: null,
    unshuffledQueue: null,
    radioQueuedIds: [],
    radioStationActive: false,
  });

  it("shows the song paused, and the first play loads it at the saved position", async () => {
    useMusicPlayerStore.getState().dismiss();
    useMusicPlayerStore.getState().restoreSavedQueue(saved(["restored-a", "restored-b"], 1, 73));

    let state = useMusicPlayerStore.getState();
    expect(state.currentTrack?.id).toBe("restored-b");
    expect(state.isPlaying).toBe(false);
    expect(state.progress).toBe(73);
    const { prefetchMusicStream } = await import("../lib/musicStreamResolution");
    expect(resolveMusicStream).not.toHaveBeenCalled();
    expect(prefetchMusicStream).not.toHaveBeenCalled();

    state.play();
    await vi.waitFor(() => expect(engine.seekWhenReady).toHaveBeenLastCalledWith(73));
    state = useMusicPlayerStore.getState();
    expect(state.isPlaying).toBe(true);
    expect(resolveMusicStream).toHaveBeenCalledWith("restored-b", expect.anything(), expect.anything());
  });

  it("never replaces a song the user already started", async () => {
    await useMusicPlayerStore.getState().playTrack(song("chosen"));
    useMusicPlayerStore.getState().restoreSavedQueue(saved(["old"], 0, 0));
    expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("chosen");
  });
});

describe("setVolume while muted", () => {
  it("unmutes the engine along with the store when the volume is raised", async () => {
    const { useMusicPlayerStore } = await import("./useMusicPlayerStore");
    useMusicPlayerStore.setState({ isMuted: true, volume: 0.5 });
    engine.setMuted.mockClear();

    useMusicPlayerStore.getState().setVolume(0.6);

    expect(engine.setMuted).toHaveBeenCalledWith(false);
    expect(useMusicPlayerStore.getState().isMuted).toBe(false);
  });

  it("stays muted at zero", async () => {
    const { useMusicPlayerStore } = await import("./useMusicPlayerStore");
    useMusicPlayerStore.setState({ isMuted: true, volume: 0.5 });
    engine.setMuted.mockClear();

    useMusicPlayerStore.getState().setVolume(0);

    expect(engine.setMuted).not.toHaveBeenCalled();
    expect(useMusicPlayerStore.getState().isMuted).toBe(true);
  });
});

describe("Direct mode (fixes batch #8)", () => {
  it("marks an Opus 48 kHz track Direct and an AAC track Standard", async () => {
    resolveMusicStream.mockImplementation(async (id: string) => ({
      ...stream(id),
      mimeType: 'audio/webm; codecs="opus"',
      bitrate: 160_000,
      sampleRate: 48_000,
    }));
    engine.isDirect.mockReturnValueOnce(true);
    await useMusicPlayerStore.getState().playTrack(song("opus"));
    expect(useMusicPlayerStore.getState().directActive).toBe(true);
    expect(useMusicPlayerStore.getState().streamFormat).toMatchObject({ sampleRate: 48_000 });
    expect(engine.setSourceSampleRate).toHaveBeenCalledWith(48_000, 'audio/webm; codecs="opus"');

    resolveMusicStream.mockImplementation(async (id: string) => ({
      ...stream(id),
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 128_000,
      sampleRate: 44_100,
    }));
    await useMusicPlayerStore.getState().playTrack(song("aac"));
    expect(useMusicPlayerStore.getState().directActive).toBe(false);
    expect(engine.setSourceSampleRate).toHaveBeenCalledWith(44_100, 'audio/mp4; codecs="mp4a.40.2"');
  });

  it("marks a preloaded Opus track Direct on the swap", async () => {
    engine.activatePreloaded.mockReturnValue(true);
    engine.getActiveFormat.mockReturnValue({ mimeType: 'audio/webm; codecs="opus"', bitrate: 160_000, sampleRate: 48_000 });
    engine.isDirect.mockReturnValueOnce(true);
    await useMusicPlayerStore.getState().playTrack(song("next"));
    expect(useMusicPlayerStore.getState().directActive).toBe(true);
  });
});
