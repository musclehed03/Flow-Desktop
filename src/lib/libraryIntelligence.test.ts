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
  it("evaluates play-count, artist, like and limit rules locally", () => {
    const tracks = [track("a", "A", "Kevin Gates"), track("b", "B", "Other")];
    const history = [{ videoId: "a", title: "A", channelName: "Kevin Gates", watchDate: "2026-01-01", watchDurationSeconds: 100 }];
    expect(evaluateSmartPlaylist(tracks, history, new Set(["a"]), { artistContains: "kevin", minPlayCount: 1, likedOnly: true, limit: 10, random: false }).map((item) => item.id)).toEqual(["a"]);
  });
});
