import { getString, type StringKey } from '../../lib/i18n/index';
import { useState } from 'react';
import { usePreference } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { parseSavedStations, saveStation, deleteSavedStation } from '../../lib/stationLibrary';
import { discoveryLevel, type MusicStation } from '../../lib/musicStation';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { usePlayerStore } from '../../store/usePlayerStore';

export function SaveStationControl({ station }: { station: MusicStation | null }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  if (!station || station.type === 'track') return null;
  return <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
    event.preventDefault();
    const ok = await saveStation(name || station.title || station.artist?.title || station.seed.title, station, discoveryLevel());
    setStatus(getString(ok ? 'settings_radio_saved' : 'settings_radio_saveFailed'));
  }}>
    <input aria-label={getString('settings_radio_stationName')} placeholder={station.title ?? station.artist?.title}
      value={name} onChange={(event) => setName(event.target.value)}
      className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-2 py-1 text-on-surface" />
    <button className="rounded-lg border border-outline-variant px-3 py-1" type="submit">{getString('settings_radio_save')}</button>
    {status && <p role="status">{status}</p>}
  </form>;
}

export function SavedStations() {
  const [raw] = usePreference(SETTINGS.SAVED_RADIO_STATIONS);
  const [error, setError] = useState(false);
  const stations = parseSavedStations(raw);
  if (!stations.length) return null;
  return <section className="mb-6 rounded-2xl border border-outline-variant p-4 text-on-surface">
    <h2 className="mb-3 text-xl font-semibold">{getString('settings_radio_savedStations')}</h2>
    <div className="flex flex-wrap gap-3">{stations.map((saved) => <div key={saved.id} className="flex items-center gap-2">
      <button type="button" className="rounded-full border border-outline-variant px-4 py-2" onClick={async () => {
        const ok = await useMusicPlayerStore.getState().resumeStation(saved.station, saved.discovery);
        setError(!ok);
      }}>{saved.name} · {getString(`settings_radio_${saved.discovery}` as StringKey)}</button>
      <button type="button" aria-label={getString('settings_radio_removeStation', saved.name)}
        onClick={() => void deleteSavedStation(saved.id)} className="rounded-lg px-2 py-2">×</button>
    </div>)}</div>
    {error && <p role="status">{getString('settings_radio_exhausted')}</p>}
  </section>;
}

export function CurrentStationSave({ surface }: { surface: 'music' | 'video' }) {
  const music = useMusicPlayerStore((state) => state.station);
  const video = usePlayerStore((state) => state.musicStation);
  return <SaveStationControl station={surface === 'music' ? music : video} />;
}
