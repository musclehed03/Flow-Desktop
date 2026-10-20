import { getWatchHistory } from './api/db';
import { getDailyMixes } from './api/music';
import { useLikesStore, type LikedItem } from '../store/useLikesStore';
import { libraryRadioCandidates } from './libraryRadio';
import type { WatchHistoryRecord } from '../types/db';
import type { DailyMixSeed, SongItem } from '../types/music';

/** Current means a rolling month; listening time decays with a seven-day half-life. */
export function planDailyStations(history: WatchHistoryRecord[], likes: LikedItem[], clusters: DailyMixSeed[], library: SongItem[], now = Date.now()): DailyMixSeed[] {
  const likedIds = new Set(likes.map((item) => item.id));
  const artists = new Map<string, { name: string; score: number; seeds: string[] }>();
  for (const record of history) {
    const age = Math.max(0, now - Date.parse(record.watchDate));
    if (!Number.isFinite(age) || age > 30 * 86400000 || !record.channelName) continue;
    // Video history is used only when its id is known music in likes/library/clusters.
    if (!record.isMusic && !library.some((song) => song.id === record.videoId)
      && !likedIds.has(record.videoId) && !clusters.some((mix) => mix.seedTrackIds.includes(record.videoId))) continue;
    const key = record.channelId || record.channelName.toLowerCase();
    const artist = artists.get(key) ?? { name: record.channelName, score: 0, seeds: [] };
    artist.score += Math.max(1, record.watchDurationSeconds) * Math.pow(0.5, age / (7 * 86400000)) * (likedIds.has(record.videoId) ? 1.25 : 1);
    if (!artist.seeds.includes(record.videoId)) artist.seeds.push(record.videoId);
    artists.set(key, artist);
  }
  const anchors = [...artists.values()].sort((a, b) => b.score - a.score);
  const comfort = [0, 1].map((index): DailyMixSeed => {
    const artist = anchors[index];
    const cluster = artist && clusters.find((mix) => mix.seedTrackIds.some((id) => artist.seeds.includes(id)));
    return { label: artist?.name ?? '', seedTrackIds: artist ? [...new Set([...artist.seeds.slice(0, 1),
      ...library.filter((song) => song.artists.some((a) => a.name.toLowerCase() === artist.name.toLowerCase()))
        .sort((a, b) => Number(likedIds.has(b.id)) - Number(likedIds.has(a.id))).map((song) => song.id),
      ...(cluster?.seedTrackIds ?? []), ...artist.seeds])].slice(0, 3) : [] };
  });
  const comfortIds = new Set(comfort.flatMap((mix) => mix.seedTrackIds));
  // Use one co-listen cluster as a compatibility boundary, not unrelated global genres.
  const fringe = [...clusters].reverse().find((mix) => mix.seedTrackIds.some((id) => !comfortIds.has(id))) ?? clusters[0];
  return [...comfort, { label: fringe?.label ?? '', seedTrackIds: fringe?.seedTrackIds.slice(0, 3) ?? [], fringe: true }];
}

export async function currentDailyStations(): Promise<DailyMixSeed[]> {
  await useLikesStore.getState().load();
  const [history, clusters, library] = await Promise.all([
    getWatchHistory(1000, 0).catch(() => []), getDailyMixes(3).catch(() => []), libraryRadioCandidates(new Set()),
  ]);
  return planDailyStations(history, useLikesStore.getState().items, clusters, library);
}
