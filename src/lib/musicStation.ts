import { libraryRadioCandidates } from "./libraryRadio";
import { expandDailyMix } from "./musicMixes";
import type { ArtistItem, SongItem, DailyMixSeed, QueuePage } from "../types/music";
import { getMusicMoodGenre, getMusicQueueContinuation, getMusicWatchQueue, getMusicRelatedTyped, rankMusicCandidates } from "./api/music";
import { audioMusicOnly, recallArtist, relatedSongs } from "./musicRecall";
import { getMusicHistory } from "./api/db";
import { buildQuickPicks } from "./musicQuickPicksBuilder";
import { getSettingValue } from "../store/useAppSettingsStore";
import { SETTINGS } from "./settings/schema";

export type DiscoveryLevel = "less" | "moderate" | "more";
export interface MusicStation {
  type: "track" | "artist" | "genre" | "mix" | "multi-artist";
  seed: SongItem;
  mix?: DailyMixSeed;
  seedCursor?: number;
  discovery?: DiscoveryLevel;
  title?: string;
  artist?: ArtistItem;
  browseId?: string;
  params?: string | null;
  genreContinuation?: string | null;
  genreTurn?: boolean;
  continuation: string | null;
  playlistId: string | null;
  catalog?: SongItem[];
  /** Multi-artist roots, in picker order. Kept when the station is saved. */
  roots?: ArtistItem[];
  /** Next root to expand during refill. Transient — reset on save. */
  rootCursor?: number;
  /** Root id -> seed track videoId, resolved lazily. Transient — dropped on save. */
  rootSeeds?: Record<string, string>;
  /** Per-root radio pagination, keyed by root id. Transient — dropped on save. */
  rootPages?: Record<string, { continuation: string | null; playlistId: string | null }>;
  /** Related-artist browseIds discovered from roots, not yet expanded. Transient — dropped on save. */
  frontier?: string[];
}
export const geniusEnabled = () => getSettingValue(SETTINGS.GENIUS_DJ_ENABLED) === "true";
export const discoveryLevel = (): DiscoveryLevel => getSettingValue(SETTINGS.RADIO_DISCOVERY_LEVEL) as DiscoveryLevel;
export const targetNovelty = () => !geniusEnabled() || discoveryLevel() === "moderate" ? undefined : discoveryLevel() === "less" ? 0.10 : 0.65;
/**
 * Whether a station tops up through the Genius DJ lane instead of the
 * upstream radio session. The lane only changes the music when its novelty
 * ranking is engaged (discovery "less" or "more"), or when the station needs
 * its own fetch (Daily Mix / genre). A plain track or artist station at the
 * default "moderate" discovery uses the upstream session, which keeps its
 * anchor reseed, pool, and per-artist cap — the Genius lane at "moderate" is
 * a no-op rank on top of a fetch with none of those.
 */
export const geniusLaneFor = (station: MusicStation | null): boolean => {
  // A multi-artist station always needs its own fetch: only the lane rotates
  // roots, the upstream session cannot. The lane degrades gracefully with
  // Genius off (pass-through ranking, no expansion).
  if (station?.type === "multi-artist") return true;
  if (!geniusEnabled()) return false;
  if (targetNovelty() !== undefined) return true;
  return station?.type === "mix" || station?.type === "genre";
};
export const trackStation = (seed: SongItem): MusicStation => ({ type: "track", seed, continuation: null, playlistId: null });
export const multiArtistStation = (roots: ArtistItem[], seed: SongItem): MusicStation => ({
  type: "multi-artist", seed, roots, rootCursor: 0, rootSeeds: {}, rootPages: {}, frontier: [],
  title: roots.map((root) => root.title).join(" + "),
  continuation: null, playlistId: null,
});
export const songId = (song: SongItem) => song.videoId ?? song.id;
export function belongsToSeedArtist(song: SongItem, station: MusicStation): boolean {
  const id = station.artist?.id ?? station.seed.artists[0]?.id;
  const name = station.artist?.title ?? station.seed.artists[0]?.name;
  return song.artists.some((artist) => id && artist.id ? artist.id === id : !!name && artist.name.toLowerCase() === name.toLowerCase());
}
export function belongsToAnyRoot(song: SongItem, station: MusicStation): boolean {
  const roots = station.roots ?? [];
  return song.artists.some((artist) =>
    roots.some((root) => (artist.id && root.id ? artist.id === root.id : artist.name.toLowerCase() === root.title.toLowerCase())));
}
/** Startup recalls only this many roots, so a large seed list cannot block first playback. */
export const MULTI_ARTIST_STARTUP_ROOTS = 4;
/** Top songs taken from each recalled root at startup. */
const MULTI_ARTIST_STARTUP_SONGS_PER_ROOT = 3;
/** Related artists expanded per refill when discovery runs past the roots. */
const MULTI_ARTIST_FRONTIER_BATCH = 2;
/**
 * Recall the first roots of a multi-artist station for startup: a few top
 * songs each, round-robined so the first queue is not all root #1. Returns
 * the seed songs plus the root -> seed-track map the refill rotation reuses.
 */
export async function recallMultiArtistSeeds(station: MusicStation, limit = MULTI_ARTIST_STARTUP_ROOTS): Promise<{ songs: SongItem[]; rootSeeds: Record<string, string> }> {
  const roots = (station.roots ?? []).slice(0, limit);
  const pages = await Promise.all(roots.map((root) => recallArtist(root.id)));
  const rootSeeds: Record<string, string> = { ...(station.rootSeeds ?? {}) };
  const perRoot: SongItem[][] = [];
  pages.forEach((page, index) => {
    const root = roots[index]!;
    const songs = audioMusicOnly(page?.topSongs ?? []).slice(0, MULTI_ARTIST_STARTUP_SONGS_PER_ROOT);
    if (!songs.length) return;
    perRoot.push(songs);
    rootSeeds[root.id] = songId(songs[0]!);
  });
  const songs: SongItem[] = [];
  for (let i = 0; i < MULTI_ARTIST_STARTUP_SONGS_PER_ROOT; i++)
    for (const list of perRoot) if (list[i]) songs.push(list[i]!);
  return { songs, rootSeeds };
}

// Ask for a seed's own queue first — it names the site's automix for the
// seed — then continue with that playlist id and its params, mirroring
// radioSession's seed fetch. (Guessing `RDAMVM<seed>` skips the site's own
// automix params.)
async function fetchSeedQueue(seedId: string): Promise<QueuePage> {
  const seedQueue = await getMusicWatchQueue(seedId).catch(() => null);
  const automix = seedQueue?.radioPlaylistId;
  return getMusicWatchQueue(seedId, automix ?? `RDAMVM${seedId}`,
    automix ? (seedQueue?.radioParams ?? undefined) : undefined);
}

export async function fetchStationPage(station: MusicStation, last: SongItem): Promise<{ songs: SongItem[]; station: MusicStation }> {
  if (station.type === "mix" && station.mix?.seedTrackIds.length) {
    const cursor = station.seedCursor ?? 0;
    const seeds = station.mix.seedTrackIds;
    const songs = await expandDailyMix({ ...station.mix, seedTrackIds: [seeds[cursor % seeds.length]!] });
    return { songs, station: { ...station, seedCursor: cursor + 1 } };
  }
  if (station.type === "genre" && station.browseId && station.genreTurn !== false) {
    const page = await getMusicMoodGenre(station.browseId, station.params ?? undefined, station.genreContinuation ?? undefined);
    return { songs: page.items.filter((item): item is SongItem & { type: "song" } => item.type === "song"),
      station: { ...station, genreContinuation: page.continuation, genreTurn: false } };
  }
  if (station.type === "multi-artist" && (station.roots?.length ?? 0) > 0) {
    const roots = station.roots!;
    const rootSeeds = { ...(station.rootSeeds ?? {}) };
    const rootPages = { ...(station.rootPages ?? {}) };
    const frontier = [...(station.frontier ?? [])];
    // Rotate roots one per page; skip roots with nothing playable, bounded
    // so a station of dead roots still terminates. Each root keeps its own
    // radio pagination, so a later cycle continues where that root left off
    // instead of re-fetching its first page.
    for (let attempt = 0; attempt < roots.length; attempt++) {
      const root = roots[((station.rootCursor ?? 0) + attempt) % roots.length]!;
      const page = await recallArtist(root.id);
      const seedId = rootSeeds[root.id] ?? audioMusicOnly(page?.topSongs ?? [])[0]?.videoId ?? page?.topSongs[0]?.videoId;
      if (seedId) rootSeeds[root.id] = seedId;
      for (const related of page?.related ?? []) {
        if (!roots.some((known) => known.id === related.id) && !frontier.includes(related.id)) frontier.push(related.id);
      }
      if (!seedId) continue;
      const saved = rootPages[root.id];
      let songs: SongItem[] = [];
      let nextPage: { continuation: string | null; playlistId: string | null } | null = null;
      if (saved?.continuation) {
        const continued = await getMusicQueueContinuation(saved.continuation).catch(() => null);
        if (continued) { songs = continued.items; nextPage = { continuation: continued.continuation, playlistId: saved.playlistId }; }
      }
      if (!nextPage) {
        const fresh = await fetchSeedQueue(seedId);
        songs = fresh.items;
        nextPage = { continuation: fresh.continuation, playlistId: fresh.radioPlaylistId ?? null };
      }
      if (nextPage) rootPages[root.id] = nextPage;
      return { songs, station: { ...station, rootCursor: ((station.rootCursor ?? 0) + attempt + 1) % roots.length,
        rootSeeds, rootPages, frontier, continuation: nextPage?.continuation ?? null, playlistId: nextPage?.playlistId ?? null } };
    }
    return { songs: [], station: { ...station, rootCursor: (station.rootCursor ?? 0) + 1, rootSeeds, rootPages, frontier } };
  }
  // A fresh track station has no playlist yet: ask for the seed's own queue
  // first — it names the site's automix for the seed — then continue with
  // that playlist id and its params, mirroring radioSession's seed fetch.
  // (Guessing `RDAMVM<seed>` skips the site's own automix params.)
  if (!station.continuation && !station.playlistId) {
    const page = await fetchSeedQueue(songId(last));
    return { songs: page.items, station: { ...station, continuation: page.continuation,
      playlistId: page.radioPlaylistId ?? station.playlistId, genreTurn: true } };
  }
  const page = station.continuation ? await getMusicQueueContinuation(station.continuation)
    : await getMusicWatchQueue(songId(last), station.playlistId ?? `RDAMVM${songId(last)}`);
  return { songs: page.items, station: { ...station, continuation: page.continuation,
    playlistId: page.radioPlaylistId ?? station.playlistId, genreTurn: true } };
}

/** Artist graph expansion remains in MusicBrain's adjacency-gated ranking pipeline. */
export async function expandStationCandidates(station: MusicStation, songs: SongItem[]): Promise<{ songs: SongItem[]; station: MusicStation }> {
  const level = station.discovery ?? discoveryLevel();
  if (!geniusEnabled() || level === "moderate") return { songs, station };
  if (station.type === "multi-artist") {
    if (level === "less") {
      // "Less" stays on the roots themselves: their catalog, then the page.
      const roots = await Promise.all((station.roots ?? []).map((root) => recallArtist(root.id)));
      const rootSongs = roots.flatMap((page) => page?.topSongs.slice(0, 10) ?? []);
      return { songs: [...rootSongs, ...songs], station: { ...station, catalog: [...(station.catalog ?? []), ...rootSongs] } };
    }
    // "More" walks the frontier: related artists discovered from the roots,
    // consumed as they expand so the refill keeps finding new artists.
    const frontier = [...(station.frontier ?? [])];
    const ids = frontier.slice(0, MULTI_ARTIST_FRONTIER_BATCH);
    const neighbors = await Promise.all(ids.map(recallArtist));
    const found = neighbors.flatMap((page) => page?.topSongs.slice(0, 10) ?? []);
    const discovered = neighbors.flatMap((page) => page?.related ?? []).map((artist) => artist.id)
      .filter((id) => !frontier.includes(id) && !(station.roots ?? []).some((root) => root.id === id));
    return { songs: [...songs, ...found], station: { ...station, frontier: [...frontier.slice(ids.length), ...discovered] } };
  }
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
  const level = station.mix?.fringe ? "more" : station.discovery ?? discoveryLevel();
  const novelty = !geniusEnabled() || level === "moderate" ? undefined : level === "less" ? 0.10 : 0.65;
  const originals = new Map(songs.map((song) => [songId(song), song]));
  const ranked = await rankMusicCandidates(songs, "radio", novelty).catch(() => songs);
  const ordered = ranked.map((song) => ({ ...song, transition: originals.get(songId(song))?.transition, libraryVideo: originals.get(songId(song))?.libraryVideo,
    radioReason: originals.get(songId(song))?.radioReason ?? { kind: "station" as const, seedName: station.title ?? station.artist?.title ?? station.seed.artists[0]?.name } }));
  if (!geniusEnabled() || level !== "less") return ordered.slice(0, limit);
  // "Less" reserves most of the batch for the seed: for a multi-artist
  // station, a song counts as own when it belongs to ANY root.
  const belongs = station.type === "multi-artist" ? belongsToAnyRoot : belongsToSeedArtist;
  const own = ordered.filter((song) => belongs(song, station));
  const other = ordered.filter((song) => !belongs(song, station));
  const quota = own.slice(0, Math.min(limit, 7));
  return [...quota, ...other, ...own.slice(quota.length)].slice(0, limit);
}

export async function stationFallback(last: SongItem, unavailable: Set<string> = new Set()): Promise<SongItem[]> {
  const related = (await relatedSongs(songId(last))).filter((song) => !unavailable.has(songId(song)));
  if (related.length) return related;
  const history = await getMusicHistory(200, 0).catch(() => []);
  const picks = await buildQuickPicks(history, last, new Set(unavailable), null).catch(() => []);
  const available = picks.filter((song) => !unavailable.has(songId(song)));
  return available.length ? available : libraryRadioCandidates(unavailable);
}
export const filterStationSongs = (songs: SongItem[]) => audioMusicOnly(songs);
