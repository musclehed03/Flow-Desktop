import { useDjSession, rememberPlayed } from "../lib/djSession";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VideoSummary } from "../types/video";

vi.mock("../lib/streamResolution", () => ({
  prefetchStreamInfo: vi.fn(),
}));

import { usePlayerStore } from "./usePlayerStore";
import { useUiStore } from "./useUiStore";

const video = (id: string): VideoSummary => ({
  id,
  title: `Video ${id}`,
  channelName: "Flow",
});

afterEach(() => {
  useDjSession.setState({ played: [] });
  useUiStore.getState().dismissToast();
  usePlayerStore.getState().clearQueue();
  usePlayerStore.getState().setRepeatMode("none");
  usePlayerStore.getState().setAutoplayCandidates([]);
});

describe("video fullscreen", () => {
  it("resets fullscreen when the player is dismissed", () => {
    usePlayerStore.getState().setCurrentVideo(video("fullscreen"));
    usePlayerStore.getState().setIsVideoFullscreen(true);

    usePlayerStore.getState().dismissVideoPlayer();

    expect(usePlayerStore.getState().isVideoFullscreen).toBe(false);
  });
});

describe("video queue", () => {
  it("restores a saved queue and exact position without autoplay by default", () => {
    const items = [video("one"), video("two")];
    usePlayerStore.getState().restoreSession(items, 1, 87, false);
    const state = usePlayerStore.getState();
    expect(state.queue).toEqual(items);
    expect(state.currentVideo).toEqual(items[1]);
    expect(state.currentIndex).toBe(1);
    expect(state.currentTime).toBe(87);
    expect(state.isPlaying).toBe(false);
    expect(state.pipHandoff).toEqual({ videoId: "two", positionSeconds: 87, playing: false });
  });

  it("starts the first queued video when add to queue is used while idle", () => {
    const queued = video("queued");
    usePlayerStore.setState({
      queue: [],
      currentVideo: null,
      currentIndex: -1,
      isPlaying: false,
    });

    expect(usePlayerStore.getState().addToQueue(queued)).toBe("added");

    expect(usePlayerStore.getState().queue).toEqual([queued]);
    expect(usePlayerStore.getState().currentVideo).toEqual(queued);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(useUiStore.getState().toast?.message).toBe("Added to queue");
  });

  it("exposes a play-next action for an idle video queue", () => {
    const head = video("head");
    const requested = video("requested");
    usePlayerStore.setState({
      queue: [head],
      currentVideo: null,
      currentIndex: -1,
      isPlaying: false,
    });
    const action = (usePlayerStore.getState() as ReturnType<typeof usePlayerStore.getState> & {
      playNextInQueue?: (item: VideoSummary) => unknown;
    }).playNextInQueue;

    expect(action).toBeTypeOf("function");
    if (!action) return;
    expect(action(requested)).toBe("added");
    expect(usePlayerStore.getState().queue).toEqual([head, requested]);
    expect(usePlayerStore.getState().currentVideo).toEqual(head);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(useUiStore.getState().toast?.message).toBe("Added to queue");
  });

  it("plays now immediately from an idle queue", () => {
    const now = video("now");

    usePlayerStore.getState().setQueue([now], 0);

    expect(usePlayerStore.getState().queue).toEqual([now]);
    expect(usePlayerStore.getState().currentVideo).toEqual(now);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it("keeps the current video when the first upcoming item is added", () => {
    const current = video("current");
    const next = video("next");
    usePlayerStore.getState().setCurrentVideo(current);

    expect(usePlayerStore.getState().addToQueue(next)).toBe("added");
    expect(usePlayerStore.getState().queue).toEqual([current, next]);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().addToQueue(next)).toBe("duplicate");
  });

  it("advances in order and wraps only when repeat queue is enabled", () => {
    const items = [video("one"), video("two")];
    usePlayerStore.getState().setQueue(items, 0);

    expect(usePlayerStore.getState().playNext()).toEqual(items[1]);
    expect(usePlayerStore.getState().playNext()).toBeNull();
    expect(usePlayerStore.getState().currentIndex).toBe(1);

    usePlayerStore.getState().setRepeatMode("all");
    expect(usePlayerStore.getState().playNext()).toEqual(items[0]);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it("appends a related candidate when autoplay reaches the end", () => {
    const current = video("current");
    const candidate = video("recommended");
    usePlayerStore.getState().setQueue([current], 0);
    usePlayerStore.getState().setAutoplayCandidates([candidate]);

    expect(usePlayerStore.getState().playNext(true)).toEqual(candidate);
    expect(usePlayerStore.getState().queue).toEqual([current, candidate]);
    expect(usePlayerStore.getState().currentIndex).toBe(1);
  });

  it("preserves the active item while reordering around it", () => {
    const items = [video("one"), video("two"), video("three")];
    usePlayerStore.getState().setQueue(items, 1);

    usePlayerStore.getState().moveQueueItem(0, 2);

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual(["two", "three", "one"]);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("two");
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });
});

describe("pop-out mini player handoff", () => {
  it("stops rendering here once the pop-out window owns playback", () => {
    usePlayerStore.getState().setQueue([video("popped")], 0);

    usePlayerStore.getState().enterVideoWindowPip();

    expect(usePlayerStore.getState().videoPlayerMode).toBe("window");
    expect(usePlayerStore.getState().isVideoFullscreen).toBe(false);
  });

  it("hands playback back only to the video it belongs to", () => {
    usePlayerStore.getState().setQueue([video("handoff")], 0);
    usePlayerStore.getState().setPipHandoff("handoff", 128, true);

    expect(usePlayerStore.getState().consumePipHandoff("other")).toBeNull();
    expect(usePlayerStore.getState().consumePipHandoff("handoff")).toEqual({
      positionSeconds: 128,
      playing: true,
    });
    // Consumed once: a retry must not silently rewind to a stale position.
    expect(usePlayerStore.getState().consumePipHandoff("handoff")).toBeNull();
  });

  it("carries a paused handoff across even from the very start of a video", () => {
    usePlayerStore.getState().setPipHandoff("cold", 0, false);

    expect(usePlayerStore.getState().consumePipHandoff("cold")).toEqual({
      positionSeconds: 0,
      playing: false,
    });
  });

  it("mirrors a pop-out advance into a video this window never queued", () => {
    const first = video("first");
    usePlayerStore.getState().setQueue([first], 0);
    usePlayerStore.getState().enterVideoWindowPip();

    const autoplayed = video("autoplayed");
    usePlayerStore.getState().applyPipRemoteState({ video: autoplayed });

    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual([
      "first",
      "autoplayed",
    ]);
    expect(usePlayerStore.getState().currentIndex).toBe(1);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("autoplayed");
    // Mirroring must never take playback back from the pop-out.
    expect(usePlayerStore.getState().videoPlayerMode).toBe("window");
  });

  it("mirrors progress without disturbing the queue", () => {
    usePlayerStore.getState().setQueue([video("mirrored")], 0);
    usePlayerStore.getState().enterVideoWindowPip();

    usePlayerStore.getState().applyPipRemoteState({
      currentTime: 42,
      duration: 600,
      isPlaying: false,
    });

    expect(usePlayerStore.getState().currentTime).toBe(42);
    expect(usePlayerStore.getState().duration).toBe(600);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it("lifts the warm-up silence when playback is dismissed", () => {
    usePlayerStore.getState().setQueue([video("silent")], 0);
    usePlayerStore.getState().setHandoffSilent(true);

    usePlayerStore.getState().dismissVideoPlayer();

    // A stuck silent flag would leave the next video playing with no sound.
    expect(usePlayerStore.getState().isHandoffSilent).toBe(false);
  });

  it("clears the pending handoff when playback is dismissed", () => {
    usePlayerStore.getState().setQueue([video("dismissed")], 0);
    usePlayerStore.getState().setPipHandoff("dismissed", 90, true);

    usePlayerStore.getState().dismissVideoPlayer();

    expect(usePlayerStore.getState().pipHandoff).toBeNull();
    expect(usePlayerStore.getState().videoPlayerMode).toBe("watch");
  });
});

// The setting changes only automatic PiP recovery; manual view controls retain ownership.
import { useAppSettingsStore } from "./useAppSettingsStore";
import { SETTINGS } from "../lib/settings/schema";

describe("watching view on advance", () => {
  it.each(["true", "false"])("keeps fullscreen and theater with keep-watching=%s", (enabled) => {
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: enabled } });
    usePlayerStore.getState().setQueue([video("one"), video("two")]);
    usePlayerStore.setState({ isVideoFullscreen: true, isTheaterMode: true });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState()).toMatchObject({ videoPlayerMode: "watch", isVideoFullscreen: true, isTheaterMode: true });
  });
  it.each(["auto", "manual"] as const)("recovers only automatic PiP (%s)", (intent) => {
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: "true" } });
    usePlayerStore.getState().setQueue([video("one"), video("two")]);
    usePlayerStore.getState().enterVideoPip(intent);
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().videoPlayerMode).toBe(intent === "auto" ? "watch" : "pip");
    expect(usePlayerStore.getState().videoPipIntent).toBe(intent === "auto" ? null : "manual");
  });
  it("retains stock auto-PiP behavior when disabled and respects the pop-out", () => {
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: "false" } });
    usePlayerStore.getState().setQueue([video("one"), video("two")]);
    usePlayerStore.getState().enterVideoPip("auto");
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().videoPlayerMode).toBe("pip");
    usePlayerStore.getState().enterVideoWindowPip();
    usePlayerStore.getState().playQueueItem(0);
    expect(usePlayerStore.getState().videoPlayerMode).toBe("window");
  });
});

vi.mock('../lib/videoAutoplay', () => ({ refillVideoCandidates: vi.fn() }));
import { refillVideoCandidates } from '../lib/videoAutoplay';

describe('Genius DJ video session', () => {
  it('filters loopbacks from automatic candidates but permits an explicit replay', () => {
    usePlayerStore.getState().setQueue([video('a'), video('b')]);
    usePlayerStore.getState().playNext();
    usePlayerStore.getState().setAutoplayCandidates([video('a'), video('new')]);
    expect(usePlayerStore.getState().autoplayCandidates.map((v) => v.id)).toEqual(['new']);
    expect(usePlayerStore.getState().addToQueue(video('a'))).toBe('added');
    expect(usePlayerStore.getState().playNext()?.id).toBe('a');
  });
  it('refills an exhausted queue and advances once', async () => {
    usePlayerStore.getState().setQueue([video('seed')]);
    vi.mocked(refillVideoCandidates).mockResolvedValue({ videos: [video('seed'), video('new')], station: null });
    await usePlayerStore.getState().refillAutoplay();
    expect(usePlayerStore.getState().currentVideo?.id).toBe('new');
  });
  it('does not resume a paused or dismissed player after an in-flight refill', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof refillVideoCandidates>>) => void;
    vi.mocked(refillVideoCandidates).mockReturnValue(new Promise((done) => { resolve = done; }));
    usePlayerStore.getState().setQueue([video('seed')]);
    const pending = usePlayerStore.getState().refillAutoplay();
    usePlayerStore.getState().setIsPlaying(false);
    resolve({ videos: [video('new')], station: null });
    await pending;
    expect(usePlayerStore.getState().currentVideo?.id).toBe('seed');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

it("does not automatically replay an ID already heard in the music transport", () => {
  const items = [video("cross-current"), video("heard-in-music"), video("fresh-video")];
  rememberPlayed("heard-in-music");
  usePlayerStore.getState().setQueue(items, 0);
  usePlayerStore.getState().playNext(true);
  expect(usePlayerStore.getState().currentVideo?.id).toBe("fresh-video");
  usePlayerStore.getState().playQueueItem(1);
  expect(usePlayerStore.getState().currentVideo?.id).toBe("heard-in-music");
});
