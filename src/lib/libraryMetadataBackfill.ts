import { getSetting, getWatchHistory, setSetting } from "./api/db";
import { getMusicMoodGroups } from "./api/music";
import {
  loadStoredPlaylists,
  persistStoredPlaylists,
  type StoredPlaylist,
} from "./playlistLibrary";
import type { LikedItem } from "../store/useLikesStore";
import type { WatchHistoryRecord } from "../types/db";
import type { VideoSummary } from "../types/video";

const STATE_KEY = "library_metadata_backfill_state_v1";
const REPORT_KEY = "library_metadata_backfill_report_v1";
const LIKES_KEY = "liked_items";
const PLAYLISTS_PER_BATCH = 10;

export interface MetadataCoverage {
  total: number;
  genre: number;
  artist: number;
  year: number;
  playCount: number;
  lastPlayed: number;
  likes: number;
}

export interface MetadataBackfillReport {
  status: "running" | "complete";
  startedAt: number;
  finishedAt?: number;
  before: MetadataCoverage;
  after: MetadataCoverage;
}

interface BackfillState {
  completedPlaylistIds: string[];
  startedAt: number;
  before: MetadataCoverage;
}

interface TrackHistory {
  plays: number;
  lastPlayedAt: number | null;
  artistName: string | null;
}

export interface MetadataContext {
  history: ReadonlyMap<string, TrackHistory>;
  likedIds: ReadonlySet<string>;
  genreNames: readonly string[];
  artistGenres: ReadonlyMap<string, string>;
}

const normalized = (value?: string | null) => value?.trim().toLowerCase() ?? "";
const yearFrom = (track: VideoSummary): number | null => {
  if (track.publicationYear && track.publicationYear >= 1900) return track.publicationYear;
  if (track.publishedAt) return new Date(track.publishedAt).getUTCFullYear();
  const year = Number(track.publishedText?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? 0);
  return year >= 1900 ? year : null;
};
const trackArtist = (track: VideoSummary) => track.artistName?.trim()
  || track.channelName?.trim()
  || track.musicTrack?.artists.map((artist) => artist.name).filter(Boolean).join(", ")
  || null;

export function metadataCoverage(playlists: readonly StoredPlaylist[]): MetadataCoverage {
  const tracks = playlists.flatMap((playlist) => playlist.tracks);
  return tracks.reduce<MetadataCoverage>((coverage, track) => ({
    total: coverage.total + 1,
    genre: coverage.genre + (Boolean(track.genre?.trim()) ? 1 : 0),
    artist: coverage.artist + (Boolean(trackArtist(track)) ? 1 : 0),
    year: coverage.year + (yearFrom(track) !== null ? 1 : 0),
    playCount: coverage.playCount + (typeof track.playCount === "number" ? 1 : 0),
    lastPlayed: coverage.lastPlayed + (track.lastPlayedAt !== undefined ? 1 : 0),
    likes: coverage.likes + (typeof track.liked === "boolean" ? 1 : 0),
  }), { total: 0, genre: 0, artist: 0, year: 0, playCount: 0, lastPlayed: 0, likes: 0 });
}

export function historyMetadata(history: readonly WatchHistoryRecord[]): Map<string, TrackHistory> {
  const result = new Map<string, TrackHistory>();
  history.forEach((entry) => {
    const previous = result.get(entry.videoId);
    const timestamp = Date.parse(entry.watchDate);
    result.set(entry.videoId, {
      plays: (previous?.plays ?? 0) + 1,
      lastPlayedAt: Number.isFinite(timestamp) ? Math.max(previous?.lastPlayedAt ?? 0, timestamp) : previous?.lastPlayedAt ?? null,
      artistName: entry.channelName?.trim() || previous?.artistName || null,
    });
  });
  return result;
}

function genreForPlaylist(playlist: StoredPlaylist, genres: readonly string[]): string | null {
  const source = normalized(`${playlist.name} ${playlist.sourceTitle ?? ""} ${playlist.description ?? ""}`);
  return [...genres].sort((left, right) => right.length - left.length)
    .find((genre) => source.includes(normalized(genre))) ?? null;
}

export function artistGenreMap(playlists: readonly StoredPlaylist[], genres: readonly string[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  playlists.forEach((playlist) => {
    const playlistGenre = genreForPlaylist(playlist, genres);
    playlist.tracks.forEach((track) => {
      const artist = normalized(trackArtist(track));
      const genre = track.genre?.trim() || playlistGenre;
      if (!artist || !genre) return;
      const artistVotes = votes.get(artist) ?? new Map<string, number>();
      artistVotes.set(genre, (artistVotes.get(genre) ?? 0) + 1);
      votes.set(artist, artistVotes);
    });
  });
  return new Map([...votes].map(([artist, artistVotes]) => [artist,
    [...artistVotes].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]![0],
  ]));
}

export function enrichPlaylistMetadata(playlist: StoredPlaylist, context: MetadataContext): StoredPlaylist {
  const playlistGenre = genreForPlaylist(playlist, context.genreNames);
  return {
    ...playlist,
    tracks: playlist.tracks.map((track) => {
      const history = context.history.get(track.id);
      const artistName = trackArtist(track) || history?.artistName || null;
      const genre = track.genre?.trim() || playlistGenre || context.artistGenres.get(normalized(artistName)) || null;
      return {
        ...track,
        genre,
        artistName,
        publicationYear: yearFrom(track),
        playCount: history?.plays ?? track.playCount ?? 0,
        lastPlayedAt: history?.lastPlayedAt ?? track.lastPlayedAt ?? null,
        liked: context.likedIds.has(track.id),
      };
    }),
  };
}

const yieldToUi = () => new Promise<void>((resolve) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window.requestIdleCallback as (callback: () => void, options?: { timeout: number }) => number)(resolve, { timeout: 1000 });
  } else setTimeout(resolve, 0);
});

async function readLikes(): Promise<Set<string>> {
  try {
    const raw = await getSetting(LIKES_KEY);
    const items = raw ? JSON.parse(raw) as LikedItem[] : [];
    return new Set(items.map((item) => item.id));
  } catch { return new Set(); }
}

async function readGenres(): Promise<string[]> {
  try {
    const groups = await getMusicMoodGroups();
    const genreGroup = groups.find((group) => /genre/i.test(group.title));
    return [...new Set((genreGroup?.items ?? groups.flatMap((group) => group.items)).map((item) => item.title.trim()).filter(Boolean))];
  } catch { return []; }
}

async function readState(playlists: StoredPlaylist[]): Promise<BackfillState> {
  try {
    const raw = await getSetting(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BackfillState;
      if (Array.isArray(parsed.completedPlaylistIds) && parsed.before) return parsed;
    }
  } catch { /* A corrupt checkpoint restarts an idempotent pass. */ }
  return { completedPlaylistIds: [], startedAt: Date.now(), before: metadataCoverage(playlists) };
}

export async function runLibraryMetadataBackfill(): Promise<MetadataBackfillReport> {
  let playlists = await loadStoredPlaylists();
  const state = await readState(playlists);
  const completed = new Set(state.completedPlaylistIds);
  const running: MetadataBackfillReport = { status: "running", startedAt: state.startedAt, before: state.before, after: metadataCoverage(playlists) };
  await setSetting(REPORT_KEY, JSON.stringify(running));

  const [history, likedIds, genreNames] = await Promise.all([
    getWatchHistory(10000, 0).catch(() => []), readLikes(), readGenres(),
  ]);
  const context: MetadataContext = {
    history: historyMetadata(history), likedIds, genreNames,
    artistGenres: artistGenreMap(playlists, genreNames),
  };

  while (true) {
    playlists = await loadStoredPlaylists();
    const pending = playlists.filter((playlist) => !completed.has(playlist.id)).slice(0, PLAYLISTS_PER_BATCH);
    if (!pending.length) break;
    const pendingIds = new Set(pending.map((playlist) => playlist.id));
    const next = playlists.map((playlist) => pendingIds.has(playlist.id) ? enrichPlaylistMetadata(playlist, context) : playlist);
    await persistStoredPlaylists(next);
    pending.forEach((playlist) => completed.add(playlist.id));
    await setSetting(STATE_KEY, JSON.stringify({ ...state, completedPlaylistIds: [...completed] } satisfies BackfillState));
    await setSetting(REPORT_KEY, JSON.stringify({ ...running, after: metadataCoverage(next) } satisfies MetadataBackfillReport));
    await yieldToUi();
  }

  const finalPlaylists = await loadStoredPlaylists();
  const report: MetadataBackfillReport = {
    status: "complete", startedAt: state.startedAt, finishedAt: Date.now(),
    before: state.before, after: metadataCoverage(finalPlaylists),
  };
  await setSetting(REPORT_KEY, JSON.stringify(report));
  // A completed checkpoint is cleared so a later launch can refresh mutable
  // history/like fields while an interrupted pass still resumes where it stopped.
  await setSetting(STATE_KEY, "null");
  return report;
}

export async function getLibraryMetadataBackfillReport(): Promise<MetadataBackfillReport | null> {
  try {
    const raw = await getSetting(REPORT_KEY);
    return raw ? JSON.parse(raw) as MetadataBackfillReport : null;
  } catch { return null; }
}
