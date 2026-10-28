import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();
vi.mock("./api/db", () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => { settings.set(key, value); },
  getWatchHistory: async () => [{ videoId: "liked", title: "Liked", channelName: "Artist", watchDate: "2026-10-01", watchDurationSeconds: 60 }],
}));

import {
  deleteSmartPlaylist,
  loadSmartPlaylists,
  saveSmartPlaylist,
  smartPlaylistSourceTracks,
} from "./smartPlaylists";

beforeEach(() => {
  settings.clear();
  settings.set("user_playlists", JSON.stringify([
    { id: "base", name: "Base", source: "Owned", tracks: [{ id: "liked", title: "Liked", channelName: "Artist", genre: "Rock", liked: true, playCount: 2 }] },
  ]));
  settings.set("liked_items", JSON.stringify([{ kind: "video", id: "liked", likedAt: "2026-10-01", video: {} }]));
});

describe("saved smart playlists", () => {
  it("creates, edits and deletes a normal materialized playlist without duplicating its own tracks", async () => {
    const created = await saveSmartPlaylist({ playlistId: "smart", name: "Rock likes", rule: { genre: "rock", likedOnly: true, limit: 20, random: false } });
    expect((await loadSmartPlaylists())).toHaveLength(1);
    let library = JSON.parse(settings.get("user_playlists") ?? "[]");
    expect(library.find((playlist: { id: string }) => playlist.id === "smart")).toMatchObject({ name: "Rock likes", smartRuleId: created.id, videoCount: 1 });
    expect(smartPlaylistSourceTracks(library).map((track) => track.id)).toEqual(["liked"]);

    await saveSmartPlaylist({ id: created.id, name: "Renamed", rule: { limit: 5, random: false } });
    library = JSON.parse(settings.get("user_playlists") ?? "[]");
    expect(library.filter((playlist: { id: string }) => playlist.id === "smart")).toHaveLength(1);
    expect(library.find((playlist: { id: string }) => playlist.id === "smart").name).toBe("Renamed");

    await deleteSmartPlaylist(created.id);
    expect(await loadSmartPlaylists()).toEqual([]);
    expect(JSON.parse(settings.get("user_playlists") ?? "[]").some((playlist: { id: string }) => playlist.id === "smart")).toBe(false);
  });
});
