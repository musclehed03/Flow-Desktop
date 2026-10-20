import { describe, expect, it } from 'vitest';
import { planDailyStations } from './dailyStations';
import type { WatchHistoryRecord } from '../types/db';
const now = Date.parse('2026-10-20T12:00:00Z');
const record = (videoId: string, channelName: string, seconds: number, days = 0): WatchHistoryRecord => ({ videoId, title: videoId, channelName, watchDurationSeconds: seconds, watchDate: new Date(now - days * 86400000).toISOString(), isMusic: true });
describe('three current Daily Mix stations', () => {
  it('always has exactly three slots and honestly represents cold start', () => {
    const mixes = planDailyStations([], [], [], [], now);
    expect(mixes).toHaveLength(3);
    expect(mixes.every((mix) => !mix.seedTrackIds.length)).toBe(true);
  });
  it('uses current listening time, factors likes, and keeps fringe in one co-listen cluster', () => {
    const clusters = [{ label: 'Compatible fringe', seedTrackIds: ['c', 'd', 'e'] }];
    const mixes = planDailyStations([record('old', 'Past', 10000, 31), record('a', 'First', 200), record('b', 'Second', 100)], [], clusters, [], now);
    expect(mixes.map((mix) => mix.label)).toEqual(['First', 'Second', 'Compatible fringe']);
    expect(mixes[2]).toEqual({ ...clusters[0], fringe: true });
    expect(mixes).toHaveLength(3);
  });
  it('does not turn unrelated non-music watch history into music recommendation seeds', () => {
    expect(planDailyStations([{ ...record('news', 'News', 99999), isMusic: false }], [], [], [], now)[0]?.seedTrackIds).toEqual([]);
  });
});
