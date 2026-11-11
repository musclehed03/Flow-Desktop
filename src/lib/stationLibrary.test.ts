import { afterEach, expect, it } from 'vitest';
import { parseSavedStations, saveStation } from './stationLibrary';
import { trackStation, multiArtistStation } from './musicStation';
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
it('keeps multi-artist roots on save and drops the transient refill state', async () => {
  const seed: SongItem = { id: 'seed', videoId: 'seed', title: 'Song', artists: [], album: null, duration: 180, thumbnail: '', explicit: false, musicVideoType: null, playlistId: null, params: null };
  const roots = [{ id: 'a', title: 'A', thumbnail: null, channelId: null }, { id: 'b', title: 'B', thumbnail: null, channelId: null }];
  const station = { ...multiArtistStation(roots, seed), rootSeeds: { a: 'seed' }, rootPages: { a: { continuation: 'c', playlistId: 'p' } }, frontier: ['x'], rootCursor: 1 };
  await saveStation('A + B', station, 'more');
  const saved = parseSavedStations(useAppSettingsStore.getState().values[SETTINGS.SAVED_RADIO_STATIONS]!);
  expect(saved[0]?.station.type).toBe('multi-artist');
  expect(saved[0]?.station.roots).toEqual(roots);
  expect(saved[0]?.station.rootCursor).toBe(0);
  expect(saved[0]?.station.rootSeeds).toBeUndefined();
  expect(saved[0]?.station.rootPages).toBeUndefined();
  expect(saved[0]?.station.frontier).toBeUndefined();
});
it('rejects a saved multi-artist station without roots', () => {
  const seed: SongItem = { id: 'seed', videoId: 'seed', title: 'Song', artists: [], album: null, duration: 180, thumbnail: '', explicit: false, musicVideoType: null, playlistId: null, params: null };
  expect(parseSavedStations(JSON.stringify([{ id: '1', name: 'x', discovery: 'moderate',
    station: { type: 'multi-artist', seed, roots: [], continuation: null, playlistId: null } }]))).toEqual([]);
});
