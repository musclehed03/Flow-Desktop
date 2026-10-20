import { loadStoredPlaylists } from './playlistLibrary';
import { listDownloads } from './api/downloads';
import type { SongItem } from '../types/music';
import type { VideoSummary } from '../types/video';

export function librarySong(video: VideoSummary, isVideo = true): SongItem {
  return { id: video.id, videoId: video.id, title: video.title,
    artists: [{ name: video.channelName ?? '', id: video.channelId ?? null }], album: null,
    thumbnail: video.thumbnailUrl ?? '', duration: video.durationSeconds ?? null,
    musicVideoType: null, explicit: false, playlistId: null, params: null,
    libraryVideo: isVideo ? video : undefined, radioReason: { kind: 'library' } };
}

/** Interleave playlists, so a large first import cannot monopolize recall. */
export async function libraryRadioCandidates(unavailable: Set<string>): Promise<SongItem[]> {
  const [playlists, downloads] = await Promise.all([
    loadStoredPlaylists().catch(() => []), listDownloads().catch(() => []),
  ]);
  const seen = new Set(unavailable);
  const songs: SongItem[] = [];
  const add = (song: SongItem) => {
    if (!song.id || seen.has(song.id)) return;
    seen.add(song.id); songs.push(song);
  };
  downloads.forEach((record) => {
    if (record.videoId) add(librarySong({ id: record.videoId, title: record.title,
      channelName: record.author ?? '', thumbnailUrl: record.thumbnailUrl,
      durationSeconds: record.durationSeconds }, record.mediaKind === 'video'));
  });
  const owned = playlists.filter((playlist) => playlist.source === 'Owned' && !playlist.isProtected);
  for (let index = 0; songs.length < 400 && owned.some((playlist) => index < playlist.tracks.length); index++) {
    for (const playlist of owned) {
      const track = playlist.tracks[index];
      if (track) add(librarySong(track));
      if (songs.length >= 400) break;
    }
  }
  return songs.slice(0, 400);
}
