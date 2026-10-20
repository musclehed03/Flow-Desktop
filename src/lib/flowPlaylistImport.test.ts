import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { convertFlowPlaylist, convertFlowPlaylistBatch, importFlowPlaylistFiles } from "./flowPlaylistImport";
import { loadStoredPlaylists, persistStoredPlaylists } from "./playlistLibrary";

vi.mock("./playlistLibrary", () => ({ loadStoredPlaylists: vi.fn(), persistStoredPlaylists: vi.fn() }));
const document = (name = "Favorites", videos: unknown[] = [
  { id: "two", title: "Second", channelName: "Artist", channelId: "", publishedAt: 0, addedAt: null },
  { id: "one", title: "First", channelName: "Other", channelId: "UC1", thumbnailUrl: "cover", durationSeconds: 123, publishedAt: 100, addedAt: 0 },
]) => JSON.stringify({ format: "flow-playlist", version: 1, exportedAt: "2026-10-19T00:00:00Z", playlist: { name, isMusic: true }, videos });
const file = (name: string, bytes: Uint8Array) => ({ name, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });

beforeEach(() => {
  vi.mocked(loadStoredPlaylists).mockResolvedValue([]);
  vi.mocked(persistStoredPlaylists).mockReset().mockResolvedValue(undefined);
});

describe("Flow playlist conversion", () => {
  it("maps golden metadata without losing track order, duplicates, or addedAt zero", () => {
    const { playlist, result } = convertFlowPlaylist(document(), "favorites.json", "playlist-1-0", 1);
    expect(result).toEqual({ fileName: "favorites.json", playlistName: "Favorites", tracksImported: 2, tracksSkipped: 0, status: "imported" });
    expect(playlist).toEqual({
      id: "playlist-1-0", name: "Favorites", sourceTitle: "Favorites", description: "Imported from TIDAL", source: "Owned", createdAt: "2026-10-19T00:00:00.000Z",
      tracks: [{ id: "two", title: "Second", channelName: "Artist" },
        { id: "one", title: "First", channelName: "Other", channelId: "UC1", thumbnailUrl: "cover", durationSeconds: 123, publishedAt: 100, addedAtInPlaylist: 0 }],
    });
  });

  it("skips malformed entries and preserves valid repeated IDs", () => {
    const track = { id: "a", title: "A", channelName: "Artist" };
    const converted = convertFlowPlaylist(document("A", [null, {}, { ...track, id: " " }, { ...track, title: 8 }, track, track]), "a.json", "playlist-1", 0);
    expect(converted.result.tracksSkipped).toBe(4);
    expect(converted.playlist?.tracks.map((t) => t.id)).toEqual(["a", "a"]);
  });

  it("isolates malformed files and skips whole playlists by exact name", () => {
    const sources = [document(), "{", document(), document("Favorites tracks")].map((text, i) => ({ fileName: `${i}.json`, text }));
    const batch = convertFlowPlaylistBatch(sources, [], 1);
    expect(batch.playlists.map((p) => p.name)).toEqual(["Favorites", "Favorites tracks"]);
    expect(batch.results.map((r) => r.reason)).toEqual([undefined, "invalidJson", "duplicate", undefined]);
    expect(batch.results[2]?.tracksImported).toBe(0);
    expect(convertFlowPlaylistBatch(sources, batch.playlists, 1).playlists).toHaveLength(0);
  });

  it("rejects unsupported formats and invalid playlists; handles invalid export timestamps", () => {
    for (const value of [null, [], {}, { format: "flow-playlist", version: 2 }]) {
      expect(convertFlowPlaylist(JSON.stringify(value), "bad", "id", 0).result.reason).toBe("invalidFormat");
    }
    expect(convertFlowPlaylist('{"format":"flow-playlist","version":1}', "bad", "id", 0).result.reason).toBe("invalidPlaylist");
    const input = JSON.parse(document());
    input.exportedAt = "invalid";
    expect(convertFlowPlaylist(JSON.stringify(input), "a", "id", 0).playlist?.createdAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("reads every ZIP JSON entry plus multiple files and persists once", async () => {
    const zip = zipSync({ "folder/a.json": strToU8(document()), "b.JSON": strToU8(document("Other")), "bad.json": strToU8("{"), "notes.txt": strToU8("ignored") });
    const result = await importFlowPlaylistFiles([file("library.zip", zip), file("third.json", strToU8(document("Third")))]);
    expect(result.map((r) => r.playlistName)).toEqual(["Favorites", "Other", "", "Third"]);
    expect(persistStoredPlaylists).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(persistStoredPlaylists).mock.calls[0]![0];
    expect(saved).toHaveLength(3);
    vi.mocked(loadStoredPlaylists).mockResolvedValue(saved);
    await importFlowPlaylistFiles([file("library.zip", zip), file("third.json", strToU8(document("Third")))]);
    expect(persistStoredPlaylists).toHaveBeenCalledTimes(1);
  });

  it("continues after unreadable files and invalid ZIPs, and reports a failed save honestly", async () => {
    vi.mocked(persistStoredPlaylists).mockRejectedValue(new Error("disk full"));
    const results = await importFlowPlaylistFiles([
      { name: "unreadable.json", arrayBuffer: async () => { throw new Error(); } },
      file("bad.zip", strToU8("no zip")), file("empty.zip", zipSync({})), file("good.json", strToU8(document())),
    ]);
    expect(results.map((r) => r.reason)).toEqual(["readFailed", "invalidZip", "emptyZip", "saveFailed"]);
    expect(results.every((r) => r.tracksImported === 0)).toBe(true);
  });

  it("never overwrites a library that failed to load", async () => {
    vi.mocked(loadStoredPlaylists).mockRejectedValueOnce(new Error("locked"));
    await expect(importFlowPlaylistFiles([file("good.json", strToU8(document()))])).rejects.toThrow("locked");
    expect(persistStoredPlaylists).not.toHaveBeenCalled();
  });
});

it("handles a synthetic 134-file batch including a 7,261-track playlist with one save", async () => {
  const inputs = Array.from({ length: 134 }, (_, playlist) => {
    const count = playlist === 0 ? 7261 : 140;
    const videos = Array.from({ length: count }, (_, track) => ({
      id: `v-${playlist}-${track}`, title: `Track ${track}`, channelName: "Artist", durationSeconds: 180,
    }));
    return file(`${playlist}.json`, strToU8(document(`Playlist ${playlist}`, videos)));
  });
  const started = performance.now();
  const results = await importFlowPlaylistFiles(inputs);
  const durationMs = Math.round(performance.now() - started);
  expect(results.filter((r) => r.status === "imported")).toHaveLength(134);
  expect(results.reduce((total, r) => total + r.tracksImported, 0)).toBe(25881);
  expect(persistStoredPlaylists).toHaveBeenCalledTimes(1);
  const saved = vi.mocked(persistStoredPlaylists).mock.calls[0]![0];
  expect(saved[0]?.tracks[7260]?.id).toBe("v-0-7260");
  // Include serialization cost explicitly; the mocked repository does not serialize.
  const serializeStarted = performance.now();
  const bytes = new TextEncoder().encode(JSON.stringify(saved)).length;
  console.info("Synthetic importer scale (not the real TIDAL corpus)", {
    playlists: saved.length, tracks: 25881, durationMs,
    serializationMs: Math.round(performance.now() - serializeStarted), bytes,
  });
});
