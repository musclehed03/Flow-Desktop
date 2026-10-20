import { strToU8 } from "fflate";
import { expect, it, vi } from "vitest";
import { importFlowPlaylistFiles } from "./flowPlaylistImport";
import { PLAYLIST_LIBRARY_UPDATED_EVENT } from "./playlistLibrary";
import { getSetting, setSetting } from "./api/db";

vi.mock("./api/db", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));

it("writes the existing playlist blob once and emits one library refresh after the batch", async () => {
  vi.mocked(getSetting).mockResolvedValue(JSON.stringify([
    { id: "owned", name: "Existing", source: "Owned", tracks: [] },
  ]));
  vi.mocked(setSetting).mockResolvedValue(undefined);
  const refreshed = vi.fn();
  window.addEventListener(PLAYLIST_LIBRARY_UPDATED_EVENT, refreshed);
  const sources = ["Favorites", "Favorites tracks", "Existing"].map((name) => ({
    name: `${name}.json`,
    arrayBuffer: async () => strToU8(JSON.stringify({
      format: "flow-playlist", version: 1, exportedAt: "2026-10-19T00:00:00Z",
      playlist: { name, description: "TIDAL playlist", isMusic: true },
      videos: [
        { id: "second", title: "Second", channelName: "Artist", publishedAt: 0, channelId: "" },
        { id: "first", title: "First", channelName: "Artist", addedAt: 12 },
      ],
    })).buffer as ArrayBuffer,
  }));
  try {
    const result = await importFlowPlaylistFiles(sources);
    expect(result.map((r) => r.status)).toEqual(["imported", "imported", "skipped"]);
    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
    const [key, blob] = vi.mocked(setSetting).mock.calls[0]!;
    expect(key).toBe("user_playlists");
    const saved = JSON.parse(blob);
    expect(saved.map((p: { name: string }) => p.name)).toEqual(["Watch Later", "Existing", "Favorites", "Favorites tracks"]);
    expect(saved[2].tracks).toEqual([
      { id: "second", title: "Second", channelName: "Artist" },
      { id: "first", title: "First", channelName: "Artist", addedAtInPlaylist: 12 },
    ]);
    expect(saved[2]).not.toHaveProperty("isMusic");
  } finally {
    window.removeEventListener(PLAYLIST_LIBRARY_UPDATED_EVENT, refreshed);
  }
});
