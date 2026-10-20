import { afterEach, expect, it } from 'vitest';
import { parseSavedStations, saveStation } from './stationLibrary';
import { trackStation } from './musicStation';
import { SETTINGS } from './settings/schema';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import type { SongItem } from '../types/music';
const original = useAppSettingsStore.getState().values;
afterEach(() => useAppSettingsStore.setState({ values: original }));
it('saves name, seed and discovery without expiring station continuation credentials', async () => {
  const seed: SongItem = { id: 'seed', videoId: 'seed', title: 'Song', artists: [], album: null, duration: 180, thumbnail: '', explicit: false, musicVideoType: null, playlistId: null, params: null };
  await saveStation('Rock/Metal', { ...trackStation(seed), type: 'genre', browseId: 'genre', title: 'Rock', continuation: 'expired' }, 'more');
  const saved = parseSavedStations(useAppSettingsStore.getState().values[SETTINGS.SAVED_RADIO_STATIONS]!);
  expect(saved[0]?.name).toBe('Rock/Metal');
  expect(saved[0]?.discovery).toBe('more');
  expect(saved[0]?.station.continuation).toBeNull();
  expect(saved[0]?.station.browseId).toBe('genre');
});
it('rejects malformed persisted station shapes', () => {
  expect(parseSavedStations('{')).toEqual([]);
  expect(parseSavedStations('[{"id":1}]')).toEqual([]);
});
