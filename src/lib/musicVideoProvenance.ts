import type { SongItem } from '../types/music';

// Ephemeral UI metadata must not change StoredPlaylist/VideoSummary wire shapes.
const musicVideos = new Set<string>();
const reasons = new Map<string, SongItem['radioReason']>();
export function rememberMusicVideo(id: string, reason?: SongItem['radioReason']) {
  musicVideos.add(id);
  if (reason) reasons.set(id, reason);
}
export const isKnownMusicVideo = (id: string) => musicVideos.has(id);
export const videoTrackReason = (id: string) => reasons.get(id);
