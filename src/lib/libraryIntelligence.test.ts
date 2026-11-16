import { describe, expect, it } from "vitest";
import { buildLocalLibraryStats, diagnoseLibrary, evaluateSmartPlaylist } from "./libraryIntelligence";

const track = (id: string, title = id, channelName = "Artist") => ({ id, title, channelName });
describe("local library intelligence", () => {
  it("builds on-device play and skip totals", () => {
    const stats = buildLocalLibraryStats([{ videoId: "a", title: "A", channelName: "Artist", watchDate: "2026-01-01", watchDurationSeconds: 5, totalDurationSeconds: 100 }, { videoId: "a", title: "A", channelName: "Artist", watchDate: "2026-01-02", watchDurationSeconds: 80, totalDurationSeconds: 100 }]);
    expect(stats).toMatchObject({ plays: 2, listeningSeconds: 85, skips: 1 });
    expect(stats.topTracks[0]).toMatchObject({ id: "a", plays: 2 });
  });
  it("reports exact and normalized near duplicates without deleting", () => {
    const result = diagnoseLibrary([{ id: "p1", name: "One", tracks: [track("same", "Song (Official Video)")] }, { id: "p2", name: "Two", tracks: [track("same", "Song"), track("other", "Song Audio")] }]);
    expect(result.exactDuplicates[0]?.playlists).toEqual(["One", "Two"]);
    expect(result.nearDuplicates).toHaveLength(1);
  });

  describe("Library Doctor (Feature 13.9)", () => {
    it("diagnoses exact duplicates across playlists (exact duplicate found)", () => {
      const p1 = { id: "p1", name: "Favorites", tracks: [track("dup-id-1", "Song A", "Artist X")] };
      const p2 = { id: "p2", name: "Road Trip", tracks: [track("dup-id-1", "Song A", "Artist X"), track("unique-1", "Unique", "Artist Y")] };
      const diagnosis = diagnoseLibrary([p1, p2]);

      expect(diagnosis.exactDuplicates).toHaveLength(1);
      expect(diagnosis.exactDuplicates[0]).toEqual({
        id: "dup-id-1",
        playlists: ["Favorites", "Road Trip"],
      });
    });

    it("diagnoses near-duplicates with metadata tag differences (near-duplicate found)", () => {
      const p1 = { id: "p1", name: "Classics", tracks: [track("v1", "Bohemian Rhapsody (Official Video) [HD]", "Queen")] };
      const p2 = { id: "p2", name: "Rock", tracks: [track("v2", "Bohemian Rhapsody (Audio)", "Queen")] };
      const diagnosis = diagnoseLibrary([p1, p2]);

      expect(diagnosis.nearDuplicates.length).toBeGreaterThanOrEqual(1);
      const match = diagnosis.nearDuplicates.find((entry) => entry.titles.some((t) => t.includes("Bohemian Rhapsody")));
      expect(match).toBeDefined();
      expect(match!.titles).toContain("Bohemian Rhapsody (Official Video) [HD]");
      expect(match!.titles).toContain("Bohemian Rhapsody (Audio)");
    });

    it("flags dead, private, and unavailable tracks with accurate reasons (dead track flagged)", () => {
      const p1 = {
        id: "p1",
        name: "Old Mix",
        tracks: [
          track("live-1", "Active Song", "Living Artist"),
          track("dead-del", "[Deleted video]", "YouTube"),
          track("dead-priv", "Private video", "YouTube"),
          { ...track("dead-unavail", "Unavailable Song", "Some Channel"), isUnavailable: true },
          { ...track("dead-reason", "Region Blocked", "Some Channel"), reasonUnavailable: "geographicRestriction" },
          track("dead-empty", "", "Missing Title"),
        ],
      };

      const diagnosis = diagnoseLibrary([p1]);
      expect(diagnosis.deadTracks).toHaveLength(5);

      const deleted = diagnosis.deadTracks.find((d) => d.track.id === "dead-del");
      expect(deleted).toBeDefined();
      expect(deleted!.reason).toBe("deleted");

      const privateTrack = diagnosis.deadTracks.find((d) => d.track.id === "dead-priv");
      expect(privateTrack).toBeDefined();
      expect(privateTrack!.reason).toBe("private");

      const unavail = diagnosis.deadTracks.find((d) => d.track.id === "dead-unavail");
      expect(unavail).toBeDefined();
      expect(unavail!.reason).toBe("unavailable");

      const reasonTrack = diagnosis.deadTracks.find((d) => d.track.id === "dead-reason");
      expect(reasonTrack).toBeDefined();
      expect(reasonTrack!.reason).toBe("unavailable");

      const incomplete = diagnosis.deadTracks.find((d) => d.track.id === "dead-empty");
      expect(incomplete).toBeDefined();
      expect(incomplete!.reason).toBe("incomplete");
    });

    it("suggests the best living replacement from library candidates (replacement suggested)", () => {
      const deadWithMetadata = {
        id: "dead-track-99",
        title: "Hotel California - Eagles [Deleted video]",
        channelName: "Eagles",
        musicTrack: { id: "dead-track-99", title: "Hotel California", artist: "Eagles" },
      };

      const livingReplacement = {
        id: "live-replacement-42",
        title: "Hotel California (2013 Remaster)",
        channelName: "Eagles",
      };

      const p1 = {
        id: "p1",
        name: "70s Rock",
        tracks: [deadWithMetadata],
      };

      const p2 = {
        id: "p2",
        name: "Living Library",
        tracks: [livingReplacement, track("unrelated", "Random Track", "Other")],
      };

      const diagnosis = diagnoseLibrary([p1, p2]);
      const deadDiagnosis = diagnosis.deadTracks.find((d) => d.track.id === "dead-track-99");

      expect(deadDiagnosis).toBeDefined();
      expect(deadDiagnosis!.reason).toBe("deleted");
      expect(deadDiagnosis!.suggestedReplacement).toBeDefined();
      expect(deadDiagnosis!.suggestedReplacement?.id).toBe("live-replacement-42");
      expect(deadDiagnosis!.suggestedReplacement?.title).toBe("Hotel California (2013 Remaster)");
    });

    it("strictly preserves original playlists without auto-deleting or mutating tracks (nothing auto-deleted)", () => {
      const originalPlaylists = [
        {
          id: "p1",
          name: "Playlist One",
          tracks: [
            track("same-id", "Duplicate Track", "Artist"),
            track("dead-id", "[Deleted video]", "YouTube"),
            track("live-id", "Valid Song", "Artist"),
          ],
        },
        {
          id: "p2",
          name: "Playlist Two",
          tracks: [
            track("same-id", "Duplicate Track (Official Audio)", "Artist"),
            track("another-live", "Another Living Song", "Artist 2"),
          ],
        },
      ];

      const snapshot = JSON.parse(JSON.stringify(originalPlaylists));
      const diagnosis = diagnoseLibrary(originalPlaylists);

      // Diagnosis finds exact duplicates, near duplicates, and dead tracks
      expect(diagnosis.exactDuplicates.length).toBeGreaterThan(0);
      expect(diagnosis.nearDuplicates.length).toBeGreaterThan(0);
      expect(diagnosis.deadTracks.length).toBeGreaterThan(0);

      // Playlists are strictly unmutated: lengths and contents intact
      expect(originalPlaylists[0]!.tracks).toHaveLength(3);
      expect(originalPlaylists[1]!.tracks).toHaveLength(2);
      expect(originalPlaylists).toEqual(snapshot);
    });
  });
  it("evaluates play-count, artist, like and limit rules locally", () => {
    const tracks = [track("a", "A", "Kevin Gates"), track("b", "B", "Other")];
    const history = [{ videoId: "a", title: "A", channelName: "Kevin Gates", watchDate: "2026-01-01", watchDurationSeconds: 100 }];
    expect(evaluateSmartPlaylist(tracks, history, new Set(["a"]), { artistContains: "kevin", minPlayCount: 1, likedOnly: true, limit: 10, random: false }).map((item) => item.id)).toEqual(["a"]);
  });
});
