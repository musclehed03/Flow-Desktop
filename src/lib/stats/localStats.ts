import type { MusicRecap } from "../api/recap";
import type { SongItem } from "../../types/music";
import type { WatchHistoryRecord } from "../../types/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A liked song counts as forgotten after this long without a play. */
export const FORGOTTEN_AFTER_DAYS = 30;
/** Forgotten favorites shown; the rest stay one tap away in Likes. */
export const FORGOTTEN_LIMIT = 10;

/** Share of ended listens that were skipped, or null when nothing ended yet. */
export function skipRate(skips: number, plays: number): number | null {
  const total = skips + plays;
  return total > 0 ? skips / total : null;
}

export interface TrackSkipRate {
  id: string;
  name: string;
  detail: string;
  skips: number;
  /** Counted plays, or null when the track never made the top-tracks list. */
  plays: number | null;
  /** Share skipped, or null when its plays are unknown. */
  rate: number | null;
}

/**
 * Most-skipped tracks with their skip share. A track missing from the top-tracks
 * list keeps its skip count but no rate: its plays are unknown, not zero.
 */
export function trackSkipRates(music: MusicRecap): TrackSkipRate[] {
  const plays = new Map(music.topTracks.map((track) => [track.id, track.count]));
  return music.skippedTracks.map((track) => {
    const counted = plays.get(track.id) ?? null;
    return {
      id: track.id,
      name: track.name,
      detail: track.detail,
      skips: track.count,
      plays: counted,
      rate: counted === null ? null : skipRate(track.count, counted),
    };
  });
}

export interface ClockStats {
  /** Busiest listening hour, or null when nothing was counted yet. */
  peakHour: number | null;
  peakPlays: number;
  totalPlays: number;
}

/** The listening clock reduced to its peak and total; the first hour wins ties. */
export function clockStats(hourCounts: number[]): ClockStats {
  let peakHour: number | null = null;
  let peakPlays = 0;
  let totalPlays = 0;
  hourCounts.forEach((count, hour) => {
    totalPlays += count;
    if (count > peakPlays) {
      peakPlays = count;
      peakHour = hour;
    }
  });
  return { peakHour, peakPlays, totalPlays };
}

/** Latest play per track; history holds one row per track, so each row is its last play. */
export function lastPlayedById(records: WatchHistoryRecord[]): Map<string, number> {
  const played = new Map<string, number>();
  for (const record of records) {
    const at = Date.parse(record.watchDate);
    if (Number.isNaN(at)) continue;
    const previous = played.get(record.videoId);
    if (previous === undefined || at > previous) played.set(record.videoId, at);
  }
  return played;
}

export interface ForgottenFavorite {
  song: SongItem;
  likedAtMs: number;
  lastPlayedMs: number | null;
  daysSilent: number;
}

/**
 * Liked songs unplayed for at least a month, longest silence first. Silence runs
 * from the like for a song with no history row, so a fresh like never counts.
 */
export function forgottenFavorites(
  likes: { likedAt: string; song: SongItem }[],
  played: Map<string, number>,
  nowMs: number,
): ForgottenFavorite[] {
  const seen = new Set<string>();
  const forgotten: ForgottenFavorite[] = [];
  for (const like of likes) {
    const id = like.song.videoId ?? like.song.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const likedAtMs = Date.parse(like.likedAt);
    if (Number.isNaN(likedAtMs)) continue;
    const lastPlayedMs = played.get(id) ?? null;
    const silentSince = Math.max(likedAtMs, lastPlayedMs ?? 0);
    const daysSilent = Math.floor((nowMs - silentSince) / DAY_MS);
    if (daysSilent >= FORGOTTEN_AFTER_DAYS) forgotten.push({ song: like.song, likedAtMs, lastPlayedMs, daysSilent });
  }
  forgotten.sort((a, b) => b.daysSilent - a.daysSilent);
  return forgotten.slice(0, FORGOTTEN_LIMIT);
}

/** Whether any listening reached the ledger yet: plays, skips or time. */
export function statsEmpty(music: MusicRecap): boolean {
  return music.plays === 0 && music.skips === 0 && music.activity.totalMs === 0;
}
