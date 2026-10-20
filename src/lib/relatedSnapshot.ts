import { songToVideoSummary } from './musicVideoRouting';
import { create } from 'zustand';
import { loadStoredPlaylists } from './playlistLibrary';
import { relatedSongs, ranked } from './musicRecall';
import { getMusicWatchQueue } from './api/music';
import { getRelatedVideos } from './api/youtube';
import { useMusicPlayerStore } from '../store/useMusicPlayerStore';
import { usePlayerStore } from '../store/usePlayerStore';
import type { SongItem } from '../types/music';
import type { VideoSummary } from '../types/video';

export type RelatedRow = { id: string; title: string; artist: string; song?: SongItem; video?: VideoSummary };
export type RelatedSeed = { kind: 'music'; song: SongItem } | { kind: 'video'; video: VideoSummary };
export function filterRelatedSnapshot(rows: RelatedRow[], libraryIds: Iterable<string>, queueIds: Iterable<string>, currentId: string): RelatedRow[] {
  const excluded = new Set([...libraryIds, ...queueIds, currentId]);
  return rows.filter((row) => { if (!row.id || excluded.has(row.id)) return false; excluded.add(row.id); return true; });
}

export async function buildRelatedSnapshot(seed: RelatedSeed, queueIds: string[]): Promise<RelatedRow[]> {
  const library = await loadStoredPlaylists();
  let rows: RelatedRow[];
  const id = seed.kind === 'music' ? seed.song.videoId ?? seed.song.id : seed.video.id;
  if (seed.kind === 'music') {
    let songs = await relatedSongs(id);
    if (!songs.length) songs = (await getMusicWatchQueue(id, `RDAMVM${id}`)).items;
    songs = await ranked(songs, 'radio');
    rows = songs.map((song) => ({ id: song.videoId ?? song.id, title: song.title, artist: song.artists.map((a) => a.name).join(', '), song }));
  } else {
    const candidates = await getRelatedVideos(id);
    rows = candidates.filter((item) => item.itemType === 'video' && !item.isLive).map((item) => {
      const video: VideoSummary = { id: item.videoId ?? item.id, title: item.title, channelName: item.channelName,
        channelId: item.channelId, thumbnailUrl: item.thumbnailUrl, durationSeconds: item.durationSeconds };
      return { id: video.id, title: video.title, artist: video.channelName, video };
    });
  }
  return filterRelatedSnapshot(rows, library.flatMap((playlist) => playlist.tracks.map((track) => track.id)), queueIds, id);
}

interface SnapshotState {
  open: boolean;
  seed: RelatedSeed | null;
  rows: readonly RelatedRow[];
  added: string[];
  loading: boolean;
  error: boolean;
  opener: HTMLElement | null;
  show: (seed: RelatedSeed, queueIds: string[], opener?: HTMLElement | null) => Promise<void>;
  close: () => void;
  add: (row: RelatedRow, next: boolean) => void;
}
let generation = 0;
/** No player subscription: only show/close can replace the snapshot. Added is separate. */
export const useRelatedSnapshot = create<SnapshotState>((set, get) => ({
  open: false, seed: null, rows: [], added: [], loading: false, error: false, opener: null,
  show: async (seed, queueIds, opener = null) => {
    const request = ++generation;
    const frozenSeed = structuredClone(seed);
    set({ open: true, seed: frozenSeed, rows: [], added: [], loading: true, error: false, opener });
    try {
      const rows = await buildRelatedSnapshot(frozenSeed, [...queueIds]);
      if (request === generation) set({ rows: Object.freeze(rows.map((row) => Object.freeze(row))), loading: false });
    } catch { if (request === generation) set({ error: true, loading: false }); }
  },
  close: () => {
    generation++;
    const opener = get().opener;
    set({ open: false, seed: null, rows: [], added: [], loading: false, error: false, opener: null });
    if (opener?.isConnected) opener.focus();
    else document.querySelector<HTMLElement>('[data-related-toggle]')?.focus();
  },
  add: (row, next) => {
    if (get().added.includes(row.id)) return;
    if (row.song) {
      const player = useMusicPlayerStore.getState();
      if (usePlayerStore.getState().currentVideo && !player.currentTrack) {
        const video = songToVideoSummary(row.song);
        const target = usePlayerStore.getState();
        target.addToQueue(video);
        if (next) { const index = usePlayerStore.getState().queue.map((item) => item.id).lastIndexOf(row.id); target.moveQueueItem(index, target.currentIndex + 1); }
      } else if (next) player.playNextInQueue(row.song); else player.addToQueue(row.song);
    } else if (row.video) {
      const player = usePlayerStore.getState();
      player.addToQueue(row.video);
      if (next) { const index = usePlayerStore.getState().queue.map((item) => item.id).lastIndexOf(row.id); player.moveQueueItem(index, player.currentIndex + 1); }
    }
    set({ added: [...get().added, row.id] });
  },
}));
