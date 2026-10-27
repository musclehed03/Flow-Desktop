import { afterEach, describe, expect, it, vi } from "vitest";

import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";
import { dispatchMixedMediaEnded, MIXED_MEDIA_ENDED_EVENT } from "./mixedMediaEvents";
import {
  mixedPlaylistTrackToSong,
  songToMixedPlaylistTrack,
  toMixedMediaQueue,
  useMixedMediaQueueStore,
} from "./mixedMediaQueue";

const song = (id: string): SongItem => ({
  id,
  videoId: id,
  title: `Song ${id}`,
  artists: [{ id: `artist-${id}`, name: `Artist ${id}` }],
  album: { id: `album-${id}`, name: `Album ${id}` },
  duration: 180,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
  thumbnail: `${id}.jpg`,
  explicit: false,
  playlistId: null,
  params: null,
});

const video = (id: string): VideoSummary => ({ id, title: `Video ${id}`, channelName: "Channel" });

afterEach(() => {
  useMixedMediaQueueStore.getState().stop();
  vi.restoreAllMocks();
});

describe("mixed playlist metadata", () => {
  it("round-trips complete music metadata through the stored playlist row", () => {
    const original = song("one");
    const stored = songToMixedPlaylistTrack(original);
    expect(stored).toMatchObject({ id: "one", mediaKind: "music", title: "Song one" });
    expect(mixedPlaylistTrackToSong(stored)).toEqual(original);
  });

  it("keeps playlist order and routes unmarked legacy rows to Watch", () => {
    const music = songToMixedPlaylistTrack(song("music"));
    expect(toMixedMediaQueue([video("first"), music, video("last")]).map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: "video", id: "first" },
      { kind: "music", id: "music" },
      { kind: "video", id: "last" },
    ]);
  });
});

describe("mixed queue router", () => {
  it("hands consecutive runs to their native engines and cuts cleanly at a boundary", () => {
    const playQueue = vi.fn().mockResolvedValue(undefined);
    const dismissMusic = vi.fn();
    const dismissVideo = vi.fn();
    const setVideoQueue = vi.fn();
    useMusicPlayerStore.setState({ playQueue, dismiss: dismissMusic });
    usePlayerStore.setState({ dismissVideoPlayer: dismissVideo, setQueue: setVideoQueue });

    const tracks = [songToMixedPlaylistTrack(song("m1")), songToMixedPlaylistTrack(song("m2")), video("v1")];
    useMixedMediaQueueStore.getState().start(tracks);
    expect(playQueue).toHaveBeenCalledWith([song("m1"), song("m2")], 0, "Mixed playlist");
    expect(dismissVideo).toHaveBeenCalledOnce();

    useMixedMediaQueueStore.getState().syncEngineItem("music", "m2");
    useMixedMediaQueueStore.getState().advance();
    expect(dismissMusic).toHaveBeenCalledOnce();
    expect(setVideoQueue).toHaveBeenCalledWith([video("v1")], 0);
    expect(useMixedMediaQueueStore.getState().currentIndex).toBe(2);
  });

  it("lets the mounted controller claim an engine-ended event", () => {
    const claim = (event: Event) => event.preventDefault();
    window.addEventListener(MIXED_MEDIA_ENDED_EVENT, claim);
    expect(dispatchMixedMediaEnded("music")).toBe(true);
    window.removeEventListener(MIXED_MEDIA_ENDED_EVENT, claim);
    expect(dispatchMixedMediaEnded("music")).toBe(false);
  });
});
