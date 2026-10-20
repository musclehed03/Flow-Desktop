import type { ArtistItem, SongItem } from "../types/music";
import { getMusicMoodGenre, getMusicQueueContinuation, getMusicWatchQueue, getMusicRelatedTyped, rankMusicCandidates } from "./api/music";
import { audioMusicOnly, recallArtist, relatedSongs } from "./musicRecall";
import { getMusicHistory } from "./api/db";
import { buildQuickPicks } from "./musicQuickPicksBuilder";
import { getSettingValue } from "../store/useAppSettingsStore";
import { SETTINGS } from "./settings/schema";

export type DiscoveryLevel = "less" | "moderate" | "more";
export interface MusicStation {
  type: "track" | "artist" | "genre";
  seed: SongItem;
  title?: string;
  artist?: ArtistItem;
  browseId?: string;
  params?: string | null;
  genreContinuation?: string | null;
  genreTurn?: boolean;
  continuation: string | null;
  playlistId: string | null;
  catalog?: SongItem[];
}
export const geniusEnabled = () => getSettingValue(SETTINGS.GENIUS_DJ_ENABLED) === "true";
export const discoveryLevel = (): DiscoveryLevel => getSettingValue(SETTINGS.RADIO_DISCOVERY_LEVEL) as DiscoveryLevel;
export const targetNovelty = () => !geniusEnabled() || discoveryLevel() === "moderate" ? undefined : discoveryLevel() === "less" ? 0.10 : 0.65;
export const trackStation = (seed: SongItem): MusicStation => ({ type: "track", seed, continuation: null, playlistId: null });
export const songId = (song: SongItem) => song.videoId ?? song.id;
export function belongsToSeedArtist(song: SongItem, station: MusicStation): boolean {
  const id = station.artist?.id ?? station.seed.artists[0]?.id;
  const name = station.artist?.title ?? station.seed.artists[0]?.name;
  return song.artists.some((artist) => id && artist.id ? artist.id === id : !!name && artist.name.toLowerCase() === name.toLowerCase());
}

export async function fetchStationPage(station: MusicStation, last: SongItem): Promise<{ songs: SongItem[]; station: MusicStation }> {
  if (station.type === "genre" && station.browseId && station.genreTurn !== false) {
    const page = await getMusicMoodGenre(station.browseId, station.params ?? undefined, station.genreContinuation ?? undefined);
    return { songs: page.items.filter((item): item is SongItem & { type: "song" } => item.type === "song"),
      station: { ...station, genreContinuation: page.continuation, genreTurn: false } };
  }
  const page = station.continuation ? await getMusicQueueContinuation(station.continuation)
    : await getMusicWatchQueue(songId(last), station.playlistId ?? `RDAMVM${songId(last)}`);
  return { songs: page.items, station: { ...station, continuation: page.continuation,
    playlistId: page.radioPlaylistId ?? station.playlistId, genreTurn: true } };
}

/** Artist graph expansion remains in MusicBrain's adjacency-gated ranking pipeline. */
export async function expandStationCandidates(station: MusicStation, songs: SongItem[]): Promise<{ songs: SongItem[]; station: MusicStation }> {
  const level = discoveryLevel();
  if (!geniusEnabled() || level === "moderate") return { songs, station };
  const artistId = station.artist?.id ?? station.seed.artists[0]?.id;
  const anchor = artistId ? await recallArtist(artistId) : null;
  const catalog = station.catalog ?? anchor?.topSongs ?? [];
  if (level === "less") return { songs: [...catalog, ...songs], station: { ...station, catalog } };
  const related = await getMusicRelatedTyped(songId(station.seed)).catch(() => null);
  const ids = [...new Set([...(anchor?.related ?? []), ...(related?.artists ?? [])].map((artist) => artist.id))].slice(0, 4);
  const neighbors = await Promise.all(ids.map(recallArtist));
  return { songs: [...songs, ...neighbors.flatMap((page) => page?.topSongs.slice(0, 10) ?? [])], station: { ...station, catalog } };
}

export async function rankStationBatch(songs: SongItem[], station: MusicStation, limit = 10): Promise<SongItem[]> {
  const ordered = await rankMusicCandidates(songs, "radio", targetNovelty()).catch(() => songs);
  if (!geniusEnabled() || discoveryLevel() !== "less") return ordered.slice(0, limit);
  const own = ordered.filter((song) => belongsToSeedArtist(song, station));
  const other = ordered.filter((song) => !belongsToSeedArtist(song, station));
  const quota = own.slice(0, Math.min(limit, 7));
  return [...quota, ...other, ...own.slice(quota.length)].slice(0, limit);
}

export async function stationFallback(last: SongItem, unavailable: Set<string> = new Set()): Promise<SongItem[]> {
  const related = (await relatedSongs(songId(last))).filter((song) => !unavailable.has(songId(song)));
  if (related.length) return related;
  const history = await getMusicHistory(200, 0).catch(() => []);
  return buildQuickPicks(history, last, unavailable, null).catch(() => []);
}
export const filterStationSongs = (songs: SongItem[]) => audioMusicOnly(songs);
