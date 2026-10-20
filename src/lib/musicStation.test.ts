import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankStationBatch, trackStation, targetNovelty, fetchStationPage } from './musicStation';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { SETTINGS } from './settings/schema';
import { getMusicMoodGenre, getMusicWatchQueue } from './api/music';
import type { SongItem } from '../types/music';
vi.mock('./api/music', () => ({
  rankMusicCandidates: async (songs: SongItem[]) => songs,
  getMusicMoodGenre: vi.fn(), getMusicWatchQueue: vi.fn(), getMusicQueueContinuation: vi.fn(),
}));
const original = useAppSettingsStore.getState().values;
const song = (id: string, artist = 'anchor'): SongItem => ({ id, videoId: id, title: id,
  artists: [{ id: artist, name: artist }], album: null, duration: 180, musicVideoType: null,
  thumbnail: '', explicit: false, playlistId: null, params: null });
afterEach(() => useAppSettingsStore.setState({ values: original }));
function level(value: string) {
  useAppSettingsStore.setState({ values: { ...original, [SETTINGS.GENIUS_DJ_ENABLED]: 'true', [SETTINGS.RADIO_DISCOVERY_LEVEL]: value } });
}
describe('radio discovery', () => {
  it('maps less and more while moderate retains the learned-appetite pipeline', () => {
    level('less'); expect(targetNovelty()).toBe(0.10);
    level('more'); expect(targetNovelty()).toBe(0.65);
    level('moderate'); expect(targetNovelty()).toBeUndefined();
  });
  it('reserves at least seven of ten for the seed artist when available', async () => {
    level('less');
    const candidates = [...Array.from({ length: 10 }, (_, i) => song(`other-${i}`, 'other')),
      ...Array.from({ length: 12 }, (_, i) => song(`own-${i}`))];
    const batch = await rankStationBatch(candidates, trackStation(song('seed')));
    expect(batch).toHaveLength(10);
    expect(batch.filter((s) => s.artists[0]?.id === 'anchor')).toHaveLength(7);
  });
  it('uses every available own-catalog track when fewer than seven remain', async () => {
    level('less');
    const batch = await rankStationBatch([song('o1', 'other'), song('own')], trackStation(song('seed')));
    expect(batch.map((s) => s.id)).toEqual(['own', 'o1']);
  });
  it('alternates genre continuation with the track station without losing genre identity', async () => {
    vi.mocked(getMusicMoodGenre).mockResolvedValue({ title: 'Genre', items: [{ type: 'song', ...song('genre') }], continuation: 'genre-next' });
    vi.mocked(getMusicWatchQueue).mockResolvedValue({ items: [song('station')], continuation: 'station-next', radioPlaylistId: 'station-id' } as Awaited<ReturnType<typeof getMusicWatchQueue>>);
    const station = { ...trackStation(song('seed')), type: 'genre' as const, browseId: 'genre', params: 'params', title: 'Genre', genreContinuation: 'genre-token' };
    const first = await fetchStationPage(station, song('seed'));
    expect(getMusicMoodGenre).toHaveBeenCalledWith('genre', 'params', 'genre-token');
    const next = await fetchStationPage(first.station, song('last'));
    expect(next.station).toMatchObject({ type: 'genre', browseId: 'genre', genreContinuation: 'genre-next', continuation: 'station-next', genreTurn: true });
  });
});
