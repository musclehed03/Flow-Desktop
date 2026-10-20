import { strFromU8, unzipSync } from "fflate";
import { loadStoredPlaylists, persistStoredPlaylists, type StoredPlaylist } from "./playlistLibrary";
import type { VideoSummary } from "../types/video";

export type FlowImportReason = "duplicate" | "invalidJson" | "invalidFormat" | "invalidPlaylist" | "readFailed" | "invalidZip" | "emptyZip" | "saveFailed";
export interface FlowImportResult {
  fileName: string;
  playlistName: string;
  tracksImported: number;
  tracksSkipped: number;
  status: "imported" | "skipped" | "failed";
  reason?: FlowImportReason;
}
export interface FlowImportSource {
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}
interface JsonSource { fileName: string; text: string; }

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function convertFlowPlaylist(
  text: string,
  fileName: string,
  id: string,
  now: number,
): { result: FlowImportResult; playlist?: StoredPlaylist } {
  const result: FlowImportResult = {
    fileName, playlistName: "", tracksImported: 0, tracksSkipped: 0, status: "failed",
  };
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { return { result: { ...result, reason: "invalidJson" } }; }
  if (!object(data) || data.format !== "flow-playlist" || data.version !== 1) {
    return { result: { ...result, reason: "invalidFormat" } };
  }
  if (!object(data.playlist) || typeof data.playlist.name !== "string"
    || !data.playlist.name.trim() || !Array.isArray(data.videos)) {
    return { result: { ...result, reason: "invalidPlaylist" } };
  }
  result.playlistName = data.playlist.name;
  const tracks: VideoSummary[] = [];
  for (const entry of data.videos) {
    if (!object(entry) || typeof entry.id !== "string" || !entry.id.trim()
      || typeof entry.title !== "string" || typeof entry.channelName !== "string") {
      result.tracksSkipped++;
      continue;
    }
    tracks.push({
      id: entry.id,
      title: entry.title,
      channelName: entry.channelName,
      ...(typeof entry.channelId === "string" && entry.channelId ? { channelId: entry.channelId } : {}),
      ...(typeof entry.thumbnailUrl === "string" ? { thumbnailUrl: entry.thumbnailUrl } : {}),
      ...(finiteNumber(entry.durationSeconds) && entry.durationSeconds >= 0 ? { durationSeconds: entry.durationSeconds } : {}),
      ...(finiteNumber(entry.publishedAt) && entry.publishedAt > 0 ? { publishedAt: entry.publishedAt } : {}),
      ...(finiteNumber(entry.addedAt) ? { addedAtInPlaylist: entry.addedAt } : {}),
    });
  }
  const exportedAt = typeof data.exportedAt === "string" || finiteNumber(data.exportedAt)
    ? new Date(data.exportedAt).getTime() : NaN;
  return {
    result: { ...result, status: "imported", tracksImported: tracks.length },
    playlist: {
      id, name: data.playlist.name, sourceTitle: data.playlist.name,
      description: typeof data.playlist.description === "string" && data.playlist.description.trim()
        ? data.playlist.description : "Imported from TIDAL",
      tracks, source: "Owned", createdAt: new Date(Number.isFinite(exportedAt) ? exportedAt : now).toISOString(),
    },
  };
}

export function convertFlowPlaylistBatch(sources: JsonSource[], existing: StoredPlaylist[], now = Date.now()) {
  const names = new Set(existing.map((playlist) => playlist.name));
  const ids = new Set(existing.map((playlist) => playlist.id));
  const playlists: StoredPlaylist[] = [];
  const results: FlowImportResult[] = [];
  let index = 0;
  for (const source of sources) {
    let id: string;
    do { id = `playlist-${now}-${index++}`; } while (ids.has(id));
    const converted = convertFlowPlaylist(source.text, source.fileName, id, now);
    if (converted.playlist) {
      if (names.has(converted.playlist.name)) {
        results.push({ ...converted.result, status: "skipped", tracksImported: 0, reason: "duplicate" });
        continue;
      }
      names.add(converted.playlist.name);
      ids.add(id);
      playlists.push(converted.playlist);
    }
    results.push(converted.result);
  }
  return { playlists, results };
}

/** Read every JSON entry, isolate file failures, and serialize the library only once. */
export async function importFlowPlaylistFiles(files: FlowImportSource[]): Promise<FlowImportResult[]> {
  const sources: JsonSource[] = [];
  const failures: FlowImportResult[] = [];
  const fail = (fileName: string, reason: FlowImportReason) => failures.push({
    fileName, playlistName: "", tracksImported: 0, tracksSkipped: 0, status: "failed", reason,
  });
  for (const file of files) {
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await file.arrayBuffer()); }
    catch { fail(file.name, "readFailed"); continue; }
    if (/\.zip$/i.test(file.name)) {
      try {
        const entries = Object.entries(unzipSync(bytes, { filter: (entry) => /\.json$/i.test(entry.name) }));
        if (!entries.length) fail(file.name, "emptyZip");
        for (const [name, contents] of entries) {
          sources.push({ fileName: `${file.name}/${name}`, text: strFromU8(contents) });
        }
      } catch { fail(file.name, "invalidZip"); }
    } else {
      sources.push({ fileName: file.name, text: strFromU8(bytes) });
    }
  }
  // A read failure of the existing library must never replace it with an empty one.
  const existing = await loadStoredPlaylists();
  const { playlists, results } = convertFlowPlaylistBatch(sources, existing);
  if (playlists.length) {
    try { await persistStoredPlaylists([...existing, ...playlists]); }
    catch {
      return [...failures, ...results.map((result) => result.status === "imported"
        ? { ...result, status: "failed" as const, tracksImported: 0, reason: "saveFailed" as const } : result)];
    }
  }
  return [...failures, ...results];
}
