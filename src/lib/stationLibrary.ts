import { getSettingValue, setSettingValue } from '../store/useAppSettingsStore';
import { SETTINGS } from './settings/schema';
import type { DiscoveryLevel, MusicStation } from './musicStation';

export interface SavedStation {
  id: string;
  name: string;
  discovery: DiscoveryLevel;
  station: MusicStation;
}
export function parseSavedStations(raw: string): SavedStation[] {
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((entry): entry is SavedStation => !!entry && typeof entry === 'object'
      && typeof entry.id === 'string' && typeof entry.name === 'string' && !!entry.station?.seed?.id
      && ['artist', 'genre', 'mix', 'multi-artist'].includes(entry.station.type)
      && (entry.station.type !== 'multi-artist' || (Array.isArray(entry.station.roots) && entry.station.roots.length > 0
        && entry.station.roots.every((root: unknown) => !!root && typeof root === 'object'
          && typeof (root as { id: unknown }).id === 'string' && typeof (root as { title: unknown }).title === 'string')))
      && ['less', 'moderate', 'more'].includes(entry.discovery)) : [];
  } catch { return []; }
}
export async function saveStation(name: string, station: MusicStation, discovery: DiscoveryLevel): Promise<boolean> {
  if (!name.trim() || station.type === 'track') return false;
  const saved = parseSavedStations(getSettingValue(SETTINGS.SAVED_RADIO_STATIONS));
  const entry: SavedStation = { id: crypto.randomUUID(), name: name.trim(), discovery,
    station: { ...station, catalog: undefined, continuation: null, playlistId: null,
      genreContinuation: null, genreTurn: true, seedCursor: 0, discovery,
      // Multi-artist stations keep their roots; the transient refill state
      // (seed tracks, per-root pagination, discovered frontier) is re-derived.
      rootCursor: 0, rootSeeds: undefined, rootPages: undefined, frontier: undefined } };
  return setSettingValue(SETTINGS.SAVED_RADIO_STATIONS, JSON.stringify([...saved, entry]));
}
export async function deleteSavedStation(id: string): Promise<boolean> {
  return setSettingValue(SETTINGS.SAVED_RADIO_STATIONS,
    JSON.stringify(parseSavedStations(getSettingValue(SETTINGS.SAVED_RADIO_STATIONS)).filter((station) => station.id !== id)));
}
