import { create } from "zustand";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";
import { MIXED_MEDIA_ROUTE_EVENT, type MixedMediaKind } from "./mixedMediaEvents";
import { getString } from "./i18n/index";

export interface MixedMediaQueueItem {
  kind: MixedMediaKind;
  id: string;
  summary: VideoSummary;
}

interface MixedMediaQueueState {
  queue: MixedMediaQueueItem[];
  currentIndex: number;
  active: boolean;
  start: (tracks: VideoSummary[], startIndex?: number) => void;
  playAt: (index: number) => void;
  advance: () => void;
  retreat: () => void;
  syncEngineItem: (kind: MixedMediaKind, id: string) => void;
  stop: () => void;
}

export function songToMixedPlaylistTrack(song: SongItem): VideoSummary {
  return {
    id: song.videoId ?? song.id,
    title: song.title,
    channelName: song.artists.map((artist) => artist.name).join(", "),
    channelId: song.artists.find((artist) => artist.id)?.id ?? null,
    thumbnailUrl: song.thumbnail,
    durationSeconds: song.duration,
    mediaKind: "music",
    musicTrack: structuredClone(song),
  };
}

export function mixedPlaylistTrackToSong(track: VideoSummary): SongItem {
  if (track.musicTrack) return { ...structuredClone(track.musicTrack), musicVideoType: "MUSIC_VIDEO_TYPE_ATV", videoId: track.id };
  return {
    id: track.id,
    videoId: track.id,
    title: track.title,
    artists: [{ id: track.channelId ?? null, name: track.channelName }],
    album: null,
    duration: track.durationSeconds ?? null,
    musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
    thumbnail: track.thumbnailUrl ?? "",
    explicit: false,
    playlistId: null,
    params: null,
  };
}

export const toMixedMediaQueue = (tracks: readonly VideoSummary[]): MixedMediaQueueItem[] => tracks.map((summary) => ({ kind: summary.mediaKind === "music" ? "music" : "video", id: summary.id, summary }));
const route = (kind: MixedMediaKind, id: string) => window.dispatchEvent(new CustomEvent(MIXED_MEDIA_ROUTE_EVENT, { detail: { kind, id } }));

export const useMixedMediaQueueStore = create<MixedMediaQueueState>((set, get) => ({
  queue: [], currentIndex: -1, active: false,
  start: (tracks, startIndex = 0) => {
    const queue = toMixedMediaQueue(tracks);
    if (!queue.length) return;
    const currentIndex = Math.max(0, Math.min(startIndex, queue.length - 1));
    set({ queue, currentIndex, active: true });
    get().playAt(currentIndex);
  },
  playAt: (index) => {
    const { queue } = get();
    const item = queue[index];
    if (!item) { set({ active: false, currentIndex: -1 }); return; }
    set({ currentIndex: index, active: true });
    if (item.kind === "music") {
      const songs: SongItem[] = [];
      for (let cursor = index; cursor < queue.length && queue[cursor]?.kind === "music"; cursor++) songs.push(mixedPlaylistTrackToSong(queue[cursor]!.summary));
      usePlayerStore.getState().dismissVideoPlayer();
      void useMusicPlayerStore.getState().playQueue(songs, 0, getString("mixed_playlist_source"));
    } else {
      const videos: VideoSummary[] = [];
      for (let cursor = index; cursor < queue.length && queue[cursor]?.kind === "video"; cursor++) videos.push(queue[cursor]!.summary);
      useMusicPlayerStore.getState().dismiss();
      usePlayerStore.getState().setQueue(videos, 0);
      window.dispatchEvent(new Event("flow-video-expand-request"));
    }
    route(item.kind, item.id);
  },
  advance: () => {
    const next = get().currentIndex + 1;
    if (next >= get().queue.length) {
      set({ active: false });
      useMusicPlayerStore.setState({ isPlaying: false });
      usePlayerStore.setState({ isPlaying: false });
      return;
    }
    get().playAt(next);
  },
  retreat: () => {
    const previous = get().currentIndex - 1;
    if (previous < 0) return;
    get().playAt(previous);
  },
  syncEngineItem: (kind, id) => {
    const state = get();
    if (!state.active) return;
    const next = state.queue.findIndex((item, index) => index >= state.currentIndex && item.kind === kind && item.id === id);
    if (next >= 0) set({ currentIndex: next });
  },
  stop: () => set({ queue: [], currentIndex: -1, active: false }),
}));
