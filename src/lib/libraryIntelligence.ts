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

export type DeadTrackReason = "deleted" | "private" | "unavailable" | "incomplete";

export interface DeadTrackDiagnosis {
  playlist: string;
  playlistId?: string;
  index: number;
  track: VideoSummary;
  reason: DeadTrackReason;
  suggestedReplacement?: VideoSummary | null;
}

export interface LibraryDiagnosis {
  emptyEntries: Array<{ playlist: string; index: number }>;
  exactDuplicates: Array<{ id: string; playlists: string[] }>;
  nearDuplicates: Array<{ key: string; titles: string[] }>;
  deadTracks: DeadTrackDiagnosis[];
  totalIssuesCount: number;
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

export function isDeadOrUnavailableTrack(track: VideoSummary): { isDead: boolean; reason?: DeadTrackReason } {
  const id = track.id?.trim() ?? "";
  const title = track.title?.trim() ?? "";

  if (!id || !title) {
    return { isDead: true, reason: "incomplete" };
  }

  const raw = track as unknown as Record<string, unknown>;
  if (raw.isUnavailable === true || raw.unavailable === true) {
    return { isDead: true, reason: "unavailable" };
  }
  if (raw.reasonUnavailable) {
    return { isDead: true, reason: "unavailable" };
  }
  if (raw.isPrivate === true || raw.privateContent === true) {
    return { isDead: true, reason: "private" };
  }
  if (raw.isDeleted === true || raw.isDead === true) {
    return { isDead: true, reason: "deleted" };
  }

  // Exact or embedded title pattern matches for deleted/private/unavailable videos
  if (
    /^\s*\[?(?:deleted|removed)\s*video\]?\s*$/i.test(title) ||
    /\[(?:deleted|removed)\s*video\]/i.test(title) ||
    /\b(?:deleted\s*video)\b/i.test(title)
  ) {
    return { isDead: true, reason: "deleted" };
  }
  if (
    /^\s*\[?private\s*video\]?\s*$/i.test(title) ||
    /\[private\s*video\]/i.test(title) ||
    /\b(?:private\s*video)\b/i.test(title)
  ) {
    return { isDead: true, reason: "private" };
  }
  if (
    /^\s*\[?(?:this\s+video\s+is\s+)?unavailable(?:\s+video)?\]?\s*$/i.test(title) ||
    /\[unavailable(?:\s*video)?\]/i.test(title) ||
    /\b(?:this\s+video\s+is\s+unavailable|video\s+unavailable)\b/i.test(title)
  ) {
    return { isDead: true, reason: "unavailable" };
  }

  // Check if title consists purely of deletion/unavailability tags
  const stripped = title.replace(/\[?(?:deleted|private|unavailable)\s*(?:video)?\]?/gi, "").trim();
  if (stripped.length === 0) {
    return { isDead: true, reason: /private/i.test(title) ? "private" : "deleted" };
  }

  return { isDead: false };
}

function resolveTrackArtist(track: VideoSummary): string {
  if (track.musicTrack?.artists && track.musicTrack.artists.length > 0) {
    return track.musicTrack.artists.map((a) => a.name).join(" ");
  }
  const raw = track as unknown as Record<string, unknown>;
  const rawArtist = (raw.artist || raw.author) as string | undefined;
  return track.artistName || rawArtist || (track.channelName && track.channelName !== "YouTube" ? track.channelName : "") || "";
}

export function findBestLivingReplacement(
  deadTrack: VideoSummary,
  livingCandidates: readonly VideoSummary[],
): VideoSummary | null {
  const rawTitle = deadTrack.musicTrack?.title || deadTrack.title || "";
  const cleanTitle = rawTitle.replace(/\[?(?:deleted|private|unavailable)\s*(?:video)?\]?/gi, "").trim();
  const rawArtist = resolveTrackArtist(deadTrack);

  if (!cleanTitle && !rawArtist) return null;

  const targetKey = cleanTitle ? titleKey({ ...deadTrack, title: cleanTitle, channelName: rawArtist }) : "";
  const targetTitleNorm = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const targetArtistNorm = rawArtist.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  let bestCandidate: VideoSummary | null = null;
  let highestScore = 0;

  for (const candidate of livingCandidates) {
    if (!candidate.id || candidate.id === deadTrack.id) continue;
    if (isDeadOrUnavailableTrack(candidate).isDead) continue;

    const candKey = titleKey(candidate);
    const candTitleNorm = (candidate.musicTrack?.title || candidate.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const candArtistNorm = resolveTrackArtist(candidate).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    let score = 0;
    if (targetKey && candKey === targetKey) {
      score = 100;
    } else if (targetTitleNorm && candTitleNorm === targetTitleNorm) {
      score = targetArtistNorm && (candArtistNorm.includes(targetArtistNorm) || targetArtistNorm.includes(candArtistNorm)) ? 95 : 85;
    } else if (
      targetTitleNorm &&
      (candTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(candTitleNorm)) &&
      targetTitleNorm.length > 3
    ) {
      score = targetArtistNorm && (candArtistNorm.includes(targetArtistNorm) || targetArtistNorm.includes(candArtistNorm)) ? 80 : 65;
    }

    if (score > highestScore && score >= 60) {
      highestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

export function diagnoseLibrary(
  playlists: readonly StoredPlaylist[],
  livingCandidates: readonly VideoSummary[] = [],
): LibraryDiagnosis {
  const ids = new Map<string, Set<string>>();
  const near = new Map<string, Set<string>>();
  const emptyEntries: LibraryDiagnosis["emptyEntries"] = [];
  const deadTracks: DeadTrackDiagnosis[] = [];

  // Build living tracks candidate pool from all playlists + additional candidates
  const livingPool: VideoSummary[] = [];
  const seenLivingIds = new Set<string>();

  const registerLiving = (t: VideoSummary) => {
    if (t.id && !seenLivingIds.has(t.id) && !isDeadOrUnavailableTrack(t).isDead) {
      seenLivingIds.add(t.id);
      livingPool.push(t);
    }
  };

  playlists.forEach((p) => p.tracks.forEach(registerLiving));
  livingCandidates.forEach(registerLiving);

  playlists.forEach((playlist) => playlist.tracks.forEach((track, index) => {
    const deadCheck = isDeadOrUnavailableTrack(track);
    if (deadCheck.isDead) {
      if (deadCheck.reason === "incomplete") {
        emptyEntries.push({ playlist: playlist.name, index });
      }
      const replacement = findBestLivingReplacement(track, livingPool);
      deadTracks.push({
        playlist: playlist.name,
        playlistId: playlist.id,
        index,
        track,
        reason: deadCheck.reason!,
        suggestedReplacement: replacement,
      });
    }

    if (track.id.trim()) {
      const names = ids.get(track.id) ?? new Set<string>();
      names.add(playlist.name);
      ids.set(track.id, names);
    }
    const key = titleKey(track);
    if (key) {
      const titles = near.get(key) ?? new Set<string>();
      titles.add(track.title);
      near.set(key, titles);
    }
  }));

  const exactDuplicates = [...ids].filter(([, names]) => names.size > 1).map(([id, names]) => ({ id, playlists: [...names] }));
  const nearDuplicates = [...near].filter(([, titles]) => titles.size > 1).map(([key, titles]) => ({ key, titles: [...titles] }));

  return {
    emptyEntries,
    exactDuplicates,
    nearDuplicates,
    deadTracks,
    totalIssuesCount: exactDuplicates.length + nearDuplicates.length + deadTracks.length,
  };
}

export function evaluateSmartPlaylist(tracks: readonly VideoSummary[], history: readonly WatchHistoryRecord[], likedIds: ReadonlySet<string>, rule: SmartPlaylistRule, now = Date.now(), random = Math.random): VideoSummary[] {
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
  if (rule.random) {
    for (let index = candidates.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
    }
  }
  return candidates.slice(0, Math.max(1, Math.min(10000, rule.limit)));
}
