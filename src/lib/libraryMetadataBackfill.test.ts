import { describe, expect, it } from "vitest";
import type { StoredPlaylist } from "./playlistLibrary";
import {
  artistGenreMap,
  enrichPlaylistMetadata,
  historyMetadata,
  metadataCoverage,
} from "./libraryMetadataBackfill";

const playlist: StoredPlaylist = {
  id: "rock",
  name: "Rock/Metal",
  tracks: [
    { id: "played", title: "Played", channelName: "", publishedAt: Date.UTC(2020, 2, 1) },
    { id: "same-artist", title: "Same artist", channelName: "The Band" },
  ],
};

describe("library metadata backfill", () => {
  it("fills local metadata, prioritizing genre membership, and reports coverage", () => {
    const history = historyMetadata([
      { videoId: "played", title: "Played", channelName: "The Band", watchDate: "2026-10-20T12:00:00Z", watchDurationSeconds: 120 },
      { videoId: "played", title: "Played", channelName: "The Band", watchDate: "2026-10-21T12:00:00Z", watchDurationSeconds: 120 },
    ]);
    const genres = ["Rock", "Metal"];
    const context = { history, likedIds: new Set(["played"]), genreNames: genres, artistGenres: artistGenreMap([playlist], genres) };
    const before = metadataCoverage([playlist]);
    const enriched = enrichPlaylistMetadata(playlist, context);
    const after = metadataCoverage([enriched]);

    expect(enriched.tracks[0]).toMatchObject({ genre: "Metal", artistName: "The Band", publicationYear: 2020, playCount: 2, liked: true });
    expect(enriched.tracks[1]).toMatchObject({ genre: "Metal", artistName: "The Band", playCount: 0, lastPlayedAt: null, liked: false });
    expect(after.genre).toBeGreaterThan(before.genre);
    expect(after.likes).toBe(2);
  });

  it("is idempotent when the same local sources are applied again", () => {
    const context = { history: new Map(), likedIds: new Set<string>(), genreNames: ["Metal"], artistGenres: new Map<string, string>() };
    const once = enrichPlaylistMetadata(playlist, context);
    expect(enrichPlaylistMetadata(once, context)).toEqual(once);
  });
});
