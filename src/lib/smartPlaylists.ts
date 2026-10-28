import { getSetting, getWatchHistory, setSetting } from "./api/db";
import { getString } from "./i18n/index";
import { evaluateSmartPlaylist, type SmartPlaylistRule } from "./libraryIntelligence";
import {
  loadStoredPlaylists,
  persistStoredPlaylists,
  type StoredPlaylist,
} from "./playlistLibrary";
import type { LikedItem } from "../store/useLikesStore";
import type { WatchHistoryRecord } from "../types/db";
import type { VideoSummary } from "../types/video";

const RULES_KEY = "smart_playlist_rules_v1";
const LIKES_KEY = "liked_items";

export interface SavedSmartPlaylist {
  id: string;
  playlistId: string;
  name: string;
  rule: SmartPlaylistRule;
  createdAt: string;
  updatedAt: string;
}

export interface SmartPlaylistInputs {
  playlists: StoredPlaylist[];
  history: WatchHistoryRecord[];
  likedIds: Set<string>;
}

export const defaultSmartPlaylistRule = (): SmartPlaylistRule => ({
  artistContains: "", genre: "", yearFrom: undefined, yearTo: undefined,
  minPlayCount: 0, notPlayedSinceDays: undefined, likedOnly: false, limit: 100, random: false,
});

export function parseSmartPlaylists(raw: string | null): SavedSmartPlaylist[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedSmartPlaylist => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<SavedSmartPlaylist>;
      return typeof value.id === "string" && typeof value.playlistId === "string"
        && typeof value.name === "string" && !!value.rule;
    }) : [];
  } catch { return []; }
}

export async function loadSmartPlaylists(): Promise<SavedSmartPlaylist[]> {
  return parseSmartPlaylists(await getSetting(RULES_KEY));
}

async function readLikes(): Promise<Set<string>> {
  try {
    const raw = await getSetting(LIKES_KEY);
    const items = raw ? JSON.parse(raw) as LikedItem[] : [];
    return new Set(items.map((item) => item.id));
  } catch { return new Set(); }
}

export async function loadSmartPlaylistInputs(): Promise<SmartPlaylistInputs> {
  const [playlists, history, likedIds] = await Promise.all([
    loadStoredPlaylists(), getWatchHistory(10000, 0).catch(() => []), readLikes(),
  ]);
  return { playlists, history, likedIds };
}

export function smartPlaylistSourceTracks(playlists: readonly StoredPlaylist[]): VideoSummary[] {
  const tracks = playlists.filter((playlist) => !playlist.smartRuleId).flatMap((playlist) => playlist.tracks);
  return [...new Map(tracks.map((track) => [track.id, track])).values()];
}

export function previewSmartPlaylist(inputs: SmartPlaylistInputs, rule: SmartPlaylistRule, random = Math.random): VideoSummary[] {
  return evaluateSmartPlaylist(smartPlaylistSourceTracks(inputs.playlists), inputs.history, inputs.likedIds, rule, Date.now(), random);
}

function materialize(saved: SavedSmartPlaylist, inputs: SmartPlaylistInputs, previous?: StoredPlaylist): StoredPlaylist {
  const tracks = previewSmartPlaylist(inputs, saved.rule);
  return {
    id: saved.playlistId,
    name: saved.name,
    sourceTitle: saved.name,
    description: getString("smart_playlist_description"),
    tracks,
    source: "Owned",
    createdAt: previous?.createdAt ?? saved.createdAt,
    thumbnailUrl: tracks[0]?.thumbnailUrl ?? null,
    videoCount: tracks.length,
    videoCountText: `${tracks.length} ${tracks.length === 1 ? getString("smart_playlist_track") : getString("smart_playlist_tracks")}`,
    smartRuleId: saved.id,
  };
}

export async function saveSmartPlaylist(
  draft: { id?: string; playlistId?: string; name: string; rule: SmartPlaylistRule },
  inputs?: SmartPlaylistInputs,
): Promise<SavedSmartPlaylist> {
  const name = draft.name.trim();
  if (!name) throw new Error("smart_playlist_name_required");
  const now = new Date().toISOString();
  const existing = await loadSmartPlaylists();
  const current = draft.id ? existing.find((item) => item.id === draft.id) : undefined;
  const id = current?.id ?? crypto.randomUUID();
  const saved: SavedSmartPlaylist = {
    id,
    playlistId: current?.playlistId ?? draft.playlistId ?? `smart-playlist-${id}`,
    name,
    rule: { ...defaultSmartPlaylistRule(), ...draft.rule, limit: Math.max(1, Math.min(10000, draft.rule.limit)) },
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  const nextRules = current ? existing.map((item) => item.id === id ? saved : item) : [...existing, saved];
  const source = inputs ?? await loadSmartPlaylistInputs();
  const previous = source.playlists.find((playlist) => playlist.id === saved.playlistId);
  const playlist = materialize(saved, source, previous);
  const nextPlaylists = previous
    ? source.playlists.map((item) => item.id === playlist.id ? playlist : item)
    : [...source.playlists, playlist];
  await persistStoredPlaylists(nextPlaylists);
  await setSetting(RULES_KEY, JSON.stringify(nextRules));
  return saved;
}

export async function deleteSmartPlaylist(id: string): Promise<void> {
  const rules = await loadSmartPlaylists();
  const target = rules.find((item) => item.id === id);
  if (!target) return;
  const playlists = await loadStoredPlaylists();
  await persistStoredPlaylists(playlists.filter((playlist) => playlist.id !== target.playlistId));
  await setSetting(RULES_KEY, JSON.stringify(rules.filter((item) => item.id !== id)));
}

export async function refreshSmartPlaylists(): Promise<number> {
  const rules = await loadSmartPlaylists();
  if (!rules.length) return 0;
  const inputs = await loadSmartPlaylistInputs();
  const byRule = new Map(rules.map((rule) => [rule.id, rule]));
  const refreshed = inputs.playlists.map((playlist) => {
    if (!playlist.smartRuleId) return playlist;
    const rule = byRule.get(playlist.smartRuleId);
    return rule ? materialize(rule, inputs, playlist) : playlist;
  });
  const missing = rules.filter((rule) => !refreshed.some((playlist) => playlist.smartRuleId === rule.id));
  await persistStoredPlaylists([...refreshed, ...missing.map((rule) => materialize(rule, inputs))]);
  return rules.length;
}
