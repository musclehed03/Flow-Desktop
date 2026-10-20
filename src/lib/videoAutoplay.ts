import { libraryRadioCandidates } from './libraryRadio';
import { trackStation } from './musicStation';
import { getRelatedVideos } from './api/youtube';
import type { VideoSummary } from '../types/video';
import { fetchStationPage, expandStationCandidates, rankStationBatch, stationFallback, type MusicStation } from './musicStation';
import { songToVideoSummary } from './musicVideoRouting';

export async function refillVideoCandidates(lastId: string, station: MusicStation | null, playedIds: readonly string[] = []): Promise<{ videos: VideoSummary[]; station: MusicStation | null }> {
  if (station) {
    const last = { ...station.seed, videoId: lastId, id: lastId };
    let next = station;
    let pool: import('../types/music').SongItem[] = [];
    for (let attempt = 0; attempt < 2 && !pool.length; attempt++) {
      try {
        const page = await fetchStationPage(next, last);
        const expanded = await expandStationCandidates(page.station, page.songs);
        next = expanded.station;
        pool = expanded.songs.filter((song) => !playedIds.includes(song.videoId ?? song.id));
      } catch { /* Exhaust online lanes before personal/library recall. */ }
    }
    if (!pool.length) pool = await stationFallback(last, new Set(playedIds));
    const songs = await rankStationBatch(pool, next);
    return { videos: songs.map(songToVideoSummary), station: next };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const related = await getRelatedVideos(lastId);
      const videos = related.filter((item) => item.itemType === 'video' && !item.isLive && !playedIds.includes(item.videoId ?? item.id)).map((item) => ({
        id: item.videoId ?? item.id, title: item.title, channelName: item.channelName,
        channelId: item.channelId, thumbnailUrl: item.thumbnailUrl, durationSeconds: item.durationSeconds,
        publishedText: item.publishedText, viewCountText: item.viewCountText,
      }));
      if (videos.length) return { videos, station: null };
    } catch { /* A visible retry state is owned by the player store. */ }
  }
  // Seed library fallback from a library item, never from non-music video history.
  const library = await libraryRadioCandidates(new Set(playedIds));
  const seed = library[0];
  if (!seed) return { videos: [], station: null };
  const personalStation = trackStation(seed);
  return { videos: (await rankStationBatch(library, personalStation)).map(songToVideoSummary), station: personalStation };
}
