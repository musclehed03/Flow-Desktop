import { describe, expect, it } from "vitest";

import type { ActivityPattern, MusicRecap, RankedItem } from "../api/recap";
import type { SongItem } from "../../types/music";
import type { WatchHistoryRecord } from "../../types/db";
import {
  clockStats,
  forgottenFavorites,
  lastPlayedById,
  skipRate,
  statsEmpty,
  trackSkipRates,
  FORGOTTEN_AFTER_DAYS,
  FORGOTTEN_LIMIT,
} from "./localStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-16T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

const pattern = (totalMs: number): ActivityPattern => ({
  totalMs,
  dayMs: {},
  hourCounts: new Array(24).fill(0),
  weekdayCounts: new Array(7).fill(0),
  activeDays: 0,
  longestStreak: 0,
  busiestDay: null,
});

const ranked = (id: string, name: string, count: number): RankedItem => ({
  id,
  name,
  count,
  durationMs: 0,
  detail: "",
  imageUrl: "",
  kind: "TRACK",
});

const music = (overrides: Partial<MusicRecap> = {}): MusicRecap => ({
  plays: 0,
  sessions: 0,
  activity: pattern(0),
  topArtists: [],
  topTracks: [],
  discoveredArtists: [],
  skippedTracks: [],
  skips: 0,
  dislikedArtists: [],
  blockedArtists: [],
  ...overrides,
});

const song = (id: string, title = `Song ${id}`): SongItem => ({
  id,
  videoId: id,
  title,
  artists: [{ id: `a-${id}`, name: `Artist ${id}` }],
  album: null,
  duration: 200,
  musicVideoType: null,
  thumbnail: "",
  explicit: false,
  playlistId: null,
  params: null,
});

const historyRow = (videoId: string, watchDate: string): WatchHistoryRecord => ({
  videoId,
  title: videoId,
  watchDate,
  watchDurationSeconds: 10,
  totalDurationSeconds: 200,
  isMusic: true,
});

describe("skipRate", () => {
  it("is null when nothing ended yet", () => {
    expect(skipRate(0, 0)).toBeNull();
  });

  it("is zero when nothing was skipped", () => {
    expect(skipRate(0, 9)).toBe(0);
  });

  it("is one when everything was skipped", () => {
    expect(skipRate(4, 0)).toBe(1);
  });

  it("divides skips by ended listens", () => {
    expect(skipRate(3, 7)).toBeCloseTo(0.3, 10);
  });
});

describe("trackSkipRates", () => {
  it("joins skip counts with counted plays", () => {
    const rates = trackSkipRates(
      music({ topTracks: [ranked("a", "A", 7)], skippedTracks: [ranked("a", "A", 3)] }),
    );
    expect(rates).toEqual([{ id: "a", name: "A", detail: "", skips: 3, plays: 7, rate: 0.3 }]);
  });

  it("keeps the count but no rate when plays are unknown", () => {
    const rates = trackSkipRates(music({ skippedTracks: [ranked("b", "B", 5)] }));
    expect(rates).toEqual([{ id: "b", name: "B", detail: "", skips: 5, plays: null, rate: null }]);
  });

  it("keeps the ranked order and ignores unskipped tracks", () => {
    const rates = trackSkipRates(
      music({
        topTracks: [ranked("a", "A", 20), ranked("b", "B", 1)],
        skippedTracks: [ranked("b", "B", 8), ranked("a", "A", 2)],
      }),
    );
    expect(rates.map((rate) => rate.id)).toEqual(["b", "a"]);
  });

  it("is empty without skips", () => {
    expect(trackSkipRates(music())).toEqual([]);
  });
});

describe("clockStats", () => {
  it("has no peak without plays", () => {
    expect(clockStats(new Array(24).fill(0))).toEqual({ peakHour: null, peakPlays: 0, totalPlays: 0 });
  });

  it("names the busiest hour and totals the plays", () => {
    const hours = new Array(24).fill(0);
    hours[7] = 2;
    hours[21] = 5;
    expect(clockStats(hours)).toEqual({ peakHour: 21, peakPlays: 5, totalPlays: 7 });
  });

  it("lets the first hour win ties", () => {
    const hours = new Array(24).fill(0);
    hours[9] = 3;
    hours[18] = 3;
    expect(clockStats(hours).peakHour).toBe(9);
  });
});

describe("lastPlayedById", () => {
  it("keeps the latest play per track", () => {
    const played = lastPlayedById([
      historyRow("a", daysAgo(10)),
      historyRow("a", daysAgo(2)),
      historyRow("b", daysAgo(5)),
    ]);
    expect(played.get("a")).toBe(Date.parse(daysAgo(2)));
    expect(played.get("b")).toBe(Date.parse(daysAgo(5)));
  });

  it("skips rows without a readable date", () => {
    expect(lastPlayedById([historyRow("a", "not a date")]).has("a")).toBe(false);
  });
});

describe("forgottenFavorites", () => {
  it("lists likes silent for at least a month, longest silence first", () => {
    const found = forgottenFavorites(
      [
        { likedAt: daysAgo(100), song: song("recent") },
        { likedAt: daysAgo(200), song: song("old") },
      ],
      new Map([["recent", NOW - 10 * DAY_MS]]),
      NOW,
    );
    expect(found.map((favorite) => favorite.song.id)).toEqual(["old"]);
    expect(found[0]?.daysSilent).toBe(200);
    expect(found[0]?.lastPlayedMs).toBeNull();
  });

  it("measures silence from the last play, not the like", () => {
    const found = forgottenFavorites(
      [{ likedAt: daysAgo(200), song: song("a") }],
      new Map([["a", NOW - 40 * DAY_MS]]),
      NOW,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.daysSilent).toBe(40);
  });

  it("treats the boundary day as forgotten and the day before as fresh", () => {
    const played = new Map<string, number>();
    expect(forgottenFavorites([{ likedAt: daysAgo(FORGOTTEN_AFTER_DAYS), song: song("a") }], played, NOW)).toHaveLength(1);
    expect(forgottenFavorites([{ likedAt: daysAgo(FORGOTTEN_AFTER_DAYS - 0.5), song: song("b") }], played, NOW)).toHaveLength(0);
  });

  it("skips unreadable likes and duplicate songs", () => {
    const found = forgottenFavorites(
      [
        { likedAt: "never", song: song("bad") },
        { likedAt: daysAgo(60), song: song("a") },
        { likedAt: daysAgo(90), song: song("a") },
      ],
      new Map(),
      NOW,
    );
    expect(found.map((favorite) => favorite.song.id)).toEqual(["a"]);
  });

  it("caps the list", () => {
    const likes = Array.from({ length: FORGOTTEN_LIMIT + 5 }, (_, index) => ({
      likedAt: daysAgo(60 + index),
      song: song(`s${index}`),
    }));
    expect(forgottenFavorites(likes, new Map(), NOW)).toHaveLength(FORGOTTEN_LIMIT);
  });
});

describe("statsEmpty", () => {
  it("is true only with no plays, skips or time", () => {
    expect(statsEmpty(music())).toBe(true);
    expect(statsEmpty(music({ plays: 1 }))).toBe(false);
    expect(statsEmpty(music({ skips: 1 }))).toBe(false);
    expect(statsEmpty(music({ activity: pattern(60_000) }))).toBe(false);
  });
});
