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

describe("enrichCurrentVideo", () => {
  it("keeps the same video object when the patch changes nothing", () => {
    usePlayerStore.getState().setQueue([{ id: "stub", title: "", channelName: "" }], 0);
    const before = usePlayerStore.getState().currentVideo;

    usePlayerStore.getState().enrichCurrentVideo("stub", { title: "", channelName: "" });

    expect(usePlayerStore.getState().currentVideo).toBe(before);
  });

  it("fills in the fields that arrived", () => {
    usePlayerStore.getState().setQueue([{ id: "stub", title: "", channelName: "" }], 0);

    usePlayerStore.getState().enrichCurrentVideo("stub", { title: "Me at the zoo" });

    expect(usePlayerStore.getState().currentVideo?.title).toBe("Me at the zoo");
    expect(usePlayerStore.getState().queue[0]?.title).toBe("Me at the zoo");
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

  it("replaces the queue around the video playing, which carries on", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b")], 1);
    usePlayerStore.setState({ currentTime: 42 });
    usePlayerStore.getState().replaceQueue([video("x"), video("b"), video("y")]);
    let state = usePlayerStore.getState();
    expect(state.queue.map((item) => item.id)).toEqual(["x", "b", "y"]);
    expect([state.currentIndex, state.currentVideo?.id, state.currentTime]).toEqual([1, "b", 42]);

    usePlayerStore.getState().replaceQueue([video("z")]);
    state = usePlayerStore.getState();
    expect(state.queue.map((item) => item.id)).toEqual(["b", "z"]);
    expect(state.currentIndex).toBe(0);
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

describe("shuffle", () => {
  const ids = () => usePlayerStore.getState().queue.map((item) => item.id);

  it("restores the original order when shuffle is turned off", () => {
    const items = [video("a"), video("b"), video("c"), video("d"), video("e")];
    usePlayerStore.getState().setQueue(items, 0);

    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().isShuffle).toBe(true);
    expect(usePlayerStore.getState().unshuffledQueue).toEqual(items);
    // A random shuffle can land on the original order; swap two upcoming videos when it does.
    if (ids().join() === "a,b,c,d,e") usePlayerStore.getState().moveQueueItem(1, 2);
    expect(ids()).not.toEqual(["a", "b", "c", "d", "e"]);

    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().isShuffle).toBe(false);
    expect(usePlayerStore.getState().unshuffledQueue).toBeNull();
    expect(ids()).toEqual(["a", "b", "c", "d", "e"]);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it("drops items removed while shuffled and keeps the rest in original order", () => {
    const items = [video("a"), video("b"), video("c"), video("d")];
    usePlayerStore.getState().setQueue(items, 0);
    usePlayerStore.getState().toggleShuffle();

    // "c" is somewhere in the shuffled tail behind the current "a".
    const cIndex = usePlayerStore.getState().queue.findIndex((v) => v.id === "c");
    usePlayerStore.getState().removeFromQueue(cIndex);

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["a", "b", "d"]);
  });

  it("appends items added while shuffled to the end on restore", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b"), video("c")], 0);
    usePlayerStore.getState().toggleShuffle();

    usePlayerStore.getState().addToQueue(video("late"));

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["a", "b", "c", "late"]);
  });

  it("treats a queue launched shuffled as restorable to its ordered form", () => {
    const ordered = [video("a"), video("b"), video("c")];
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!];
    usePlayerStore.getState().setQueue(shuffled, 0, null, ordered);

    expect(usePlayerStore.getState().isShuffle).toBe(true);
    expect(usePlayerStore.getState().unshuffledQueue).toEqual(ordered);

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("c");
    expect(usePlayerStore.getState().currentIndex).toBe(2);
  });

  it("clears shuffle state when a fresh queue is set", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b")], 0);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().isShuffle).toBe(true);

    usePlayerStore.getState().setQueue([video("x")], 0);
    expect(usePlayerStore.getState().isShuffle).toBe(false);
    expect(usePlayerStore.getState().unshuffledQueue).toBeNull();
  });

  it("keeps hand-added play-next items right after the current video in both directions", () => {
    const playlist = { id: "wl", title: "Watch Later", editable: true, reorderable: true };
    usePlayerStore
      .getState()
      .setQueue([video("w0"), video("w1"), video("w2"), video("w3")], 0, playlist);
    usePlayerStore.getState().addToQueue(video("x"));
    usePlayerStore.getState().addToQueue(video("y"));

    usePlayerStore.getState().toggleShuffle();
    expect(ids().slice(0, 3)).toEqual(["w0", "x", "y"]);
    expect([...ids().slice(3)].sort()).toEqual(["w1", "w2", "w3"]);

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["w0", "x", "y", "w1", "w2", "w3"]);
  });

  it("pins an item hand-added while shuffled after the current video on restore", () => {
    const playlist = { id: "wl", title: "Watch Later", editable: true, reorderable: true };
    usePlayerStore.getState().setQueue([video("a"), video("b"), video("c")], 0, playlist);
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().addToQueue(video("x"));

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["a", "x", "b", "c"]);
  });

  it("keeps a video added while shuffled as the current one, with the unplayed ones after it", () => {
    const playlist = { id: "wl", title: "Watch Later", editable: true, reorderable: true };
    usePlayerStore.getState().setQueue([video("a"), video("b"), video("c"), video("d")], 0, playlist);
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().addToQueue(video("x"));
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentVideo?.id).toBe("x");

    usePlayerStore.getState().toggleShuffle();
    expect(ids()).toEqual(["a", "x", "b", "c", "d"]);
    expect(usePlayerStore.getState().currentIndex).toBe(1);
  });
});

describe("set queue", () => {
  const ids = () => usePlayerStore.getState().queue.map((item) => item.id);

  it("drops duplicate ids and still starts on the requested video", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b"), video("a"), video("c")], 3);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(usePlayerStore.getState().currentIndex).toBe(2);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("c");
  });
});

describe("autoplay", () => {
  it("drops the playlist context once autoplay extends the queue", () => {
    const playlist = { id: "wl", title: "Watch Later", editable: true, reorderable: true };
    usePlayerStore.getState().setQueue([video("a")], 0, playlist);
    usePlayerStore.getState().setAutoplayCandidates([video("auto")]);

    expect(usePlayerStore.getState().playNext(true)?.id).toBe("auto");
    expect(usePlayerStore.getState().playlistContext).toBeNull();
  });
});

describe("add to queue", () => {
  const ids = () => usePlayerStore.getState().queue.map((item) => item.id);
  const playlist = { id: "wl", title: "Watch Later", editable: true, reorderable: true };

  it("plays hand-added videos right after the current one, in add order", () => {
    usePlayerStore.getState().setQueue([video("w0"), video("w1"), video("w2")], 0, playlist);

    usePlayerStore.getState().addToQueue(video("x"));
    expect(ids()).toEqual(["w0", "x", "w1", "w2"]);

    usePlayerStore.getState().addToQueue(video("y"));
    expect(ids()).toEqual(["w0", "x", "y", "w1", "w2"]);

    const manual = usePlayerStore.getState().manualQueueIds;
    expect(manual.has("x")).toBe(true);
    expect(manual.has("y")).toBe(true);
    expect(manual.has("w1")).toBe(false);
  });

  it("starts playback in the mini player when nothing is playing", () => {
    expect(usePlayerStore.getState().currentVideo).toBeNull();

    usePlayerStore.getState().addToQueue(video("solo"));

    const state = usePlayerStore.getState();
    expect(state.currentVideo?.id).toBe("solo");
    expect(state.currentIndex).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(state.videoPlayerMode).toBe("pip");
    expect(ids()).toEqual(["solo"]);
  });

  it("starts a clean queue when nothing is playing after a playlist ran out", () => {
    usePlayerStore.getState().setQueue([video("w0")], 0, playlist);
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().removeFromQueue(0);
    expect(usePlayerStore.getState().currentVideo).toBeNull();

    usePlayerStore.getState().addToQueue(video("solo"));

    const state = usePlayerStore.getState();
    expect(state.playlistContext).toBeNull();
    expect(state.isShuffle).toBe(false);
    expect(state.videoPlayerMode).toBe("pip");
  });

  it("closes the chapters panel when it opens the queue panel", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b")], 0);
    usePlayerStore.getState().setIsChaptersPanelOpen(true);

    usePlayerStore.getState().addToQueue(video("c"));

    expect(usePlayerStore.getState().isQueuePanelOpen).toBe(true);
    expect(usePlayerStore.getState().isChaptersPanelOpen).toBe(false);
  });

  it("still appends to the end for a plain (non-playlist) queue", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b")], 0);

    usePlayerStore.getState().addToQueue(video("c"));
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(usePlayerStore.getState().manualQueueIds.size).toBe(0);
  });

  it("forgets a hand-added video once it is removed", () => {
    usePlayerStore.getState().setQueue([video("w0"), video("w1")], 0, playlist);
    usePlayerStore.getState().addToQueue(video("x"));

    const index = usePlayerStore.getState().queue.findIndex((v) => v.id === "x");
    usePlayerStore.getState().removeFromQueue(index);

    expect(ids()).toEqual(["w0", "w1"]);
    expect(usePlayerStore.getState().manualQueueIds.has("x")).toBe(false);
  });
});

describe("restore queue item", () => {
  const ids = () => usePlayerStore.getState().queue.map((item) => item.id);

  it("puts a removed video back at its old place and keeps the current video", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b"), video("c")], 1);
    usePlayerStore.getState().removeFromQueue(0);

    usePlayerStore.getState().restoreQueueItem(video("a"), 0);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(usePlayerStore.getState().currentIndex).toBe(1);
    expect(usePlayerStore.getState().currentVideo?.id).toBe("b");
  });

  it("does not add a video that is already queued", () => {
    usePlayerStore.getState().setQueue([video("a"), video("b")], 0);

    usePlayerStore.getState().restoreQueueItem(video("b"), 0);
    expect(ids()).toEqual(["a", "b"]);
  });
});

describe("fullscreen side panel", () => {
  it("opens the matching sidebar panel too, so it is still open after fullscreen", () => {
    usePlayerStore.getState().setFullscreenPanel("queue");
    expect(usePlayerStore.getState()).toMatchObject({ fullscreenPanel: "queue", isQueuePanelOpen: true, isChaptersPanelOpen: false });

    usePlayerStore.getState().setFullscreenPanel("chapters");
    expect(usePlayerStore.getState()).toMatchObject({ fullscreenPanel: "chapters", isQueuePanelOpen: false, isChaptersPanelOpen: true });
  });

  it("closes when its panel is closed from inside it", () => {
    usePlayerStore.getState().setFullscreenPanel("chapters");
    usePlayerStore.getState().setIsChaptersPanelOpen(false);
    expect(usePlayerStore.getState().fullscreenPanel).toBeNull();
  });

  it("shows chat without touching the sidebar panels", () => {
    usePlayerStore.getState().setIsQueuePanelOpen(true);
    usePlayerStore.getState().setFullscreenPanel("chat");
    expect(usePlayerStore.getState()).toMatchObject({ fullscreenPanel: "chat", isQueuePanelOpen: true });
    usePlayerStore.getState().setFullscreenPanel(null);
    usePlayerStore.getState().setIsQueuePanelOpen(false);
  });
});
