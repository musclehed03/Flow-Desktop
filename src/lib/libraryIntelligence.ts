import type { StoredPlaylist } from "./playlistLibrary";
import type { WatchHistoryRecord } from "../types/db";
import type { VideoSummary } from "../types/video";

export interface LocalLibraryStats {
  plays: number;
  listeningSeconds: number;
  skips: number;
  topTracks: Array<{ id: string; title: string; plays: number }>;
  topArtists: Array<{ name: string; plays: number }>;
}

export interface LibraryDiagnosis {
  emptyEntries: Array<{ playlist: string; index: number }>;
  exactDuplicates: Array<{ id: string; playlists: string[] }>;
  nearDuplicates: Array<{ key: string; titles: string[] }>;
}

export interface SmartPlaylistRule {
  artistContains?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  minPlayCount?: number;
  notPlayedSinceDays?: number;
  likedOnly?: boolean;
  limit: number;
  random: boolean;
}

const titleKey = (track: VideoSummary) => `${track.title} ${track.channelName}`.toLowerCase().replace(/\b(official|video|audio|lyrics?|hd|4k)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function buildLocalLibraryStats(history: readonly WatchHistoryRecord[]): LocalLibraryStats {
  const tracks = new Map<string, { title: string; plays: number }>();
  const artists = new Map<string, number>();
  let listeningSeconds = 0;
  let skips = 0;
  history.forEach((entry) => {
    listeningSeconds += Math.max(0, entry.watchDurationSeconds);
    if ((entry.totalDurationSeconds ?? 0) > 30 && entry.watchDurationSeconds / (entry.totalDurationSeconds ?? 1) < .15) skips++;
    const prior = tracks.get(entry.videoId);
    tracks.set(entry.videoId, { title: entry.title, plays: (prior?.plays ?? 0) + 1 });
    const artist = entry.channelName?.trim();
    if (artist) artists.set(artist, (artists.get(artist) ?? 0) + 1);
  });
  return {
    plays: history.length,
    listeningSeconds,
    skips,
    topTracks: [...tracks].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.plays - a.plays).slice(0, 10),
    topArtists: [...artists].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays).slice(0, 10),
  };
}

export function diagnoseLibrary(playlists: readonly StoredPlaylist[]): LibraryDiagnosis {
  const ids = new Map<string, Set<string>>();
  const near = new Map<string, Set<string>>();
  const emptyEntries: LibraryDiagnosis["emptyEntries"] = [];
  playlists.forEach((playlist) => playlist.tracks.forEach((track, index) => {
    if (!track.id.trim() || !track.title.trim()) emptyEntries.push({ playlist: playlist.name, index });
    if (track.id.trim()) {
      const names = ids.get(track.id) ?? new Set<string>(); names.add(playlist.name); ids.set(track.id, names);
    }
    const key = titleKey(track);
    if (key) { const titles = near.get(key) ?? new Set<string>(); titles.add(track.title); near.set(key, titles); }
  }));
  return {
    emptyEntries,
    exactDuplicates: [...ids].filter(([, names]) => names.size > 1).map(([id, names]) => ({ id, playlists: [...names] })),
    nearDuplicates: [...near].filter(([, titles]) => titles.size > 1).map(([key, titles]) => ({ key, titles: [...titles] })),
  };
}

export function evaluateSmartPlaylist(tracks: readonly VideoSummary[], history: readonly WatchHistoryRecord[], likedIds: ReadonlySet<string>, rule: SmartPlaylistRule, now = Date.now()): VideoSummary[] {
  const plays = new Map<string, number>();
  const last = new Map<string, number>();
  history.forEach((entry) => { plays.set(entry.videoId, (plays.get(entry.videoId) ?? 0) + 1); last.set(entry.videoId, Math.max(last.get(entry.videoId) ?? 0, Date.parse(entry.watchDate) || 0)); });
  const artist = rule.artistContains?.trim().toLowerCase();
  const genre = rule.genre?.trim().toLowerCase();
  const candidates = [...new Map(tracks.map((track) => [track.id, track])).values()].filter((track) => {
    const year = track.publicationYear ?? Number(track.publishedText?.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0);
    const storedGenre = String(track.genre ?? "").toLowerCase();
    if (artist && !(track.artistName ?? track.channelName).toLowerCase().includes(artist)) return false;
    if (genre && !storedGenre.includes(genre)) return false;
    if (rule.yearFrom && (!year || year < rule.yearFrom)) return false;
    if (rule.yearTo && (!year || year > rule.yearTo)) return false;
    if ((track.playCount ?? plays.get(track.id) ?? 0) < (rule.minPlayCount ?? 0)) return false;
    if (rule.notPlayedSinceDays && (track.lastPlayedAt ?? last.get(track.id) ?? 0) > now - rule.notPlayedSinceDays * 86400000) return false;
    return !rule.likedOnly || track.liked === true || likedIds.has(track.id);
  });
  if (rule.random) candidates.sort(() => Math.random() - .5);
  return candidates.slice(0, Math.max(1, Math.min(10000, rule.limit)));
}
