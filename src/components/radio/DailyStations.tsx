import { getString } from '../../lib/i18n/index';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { currentDailyStations } from '../../lib/dailyStations';
import { dailyMixRoute } from '../../lib/musicMixes';
import type { DailyMixSeed } from '../../types/music';

export function DailyStations() {
  const navigate = useNavigate();
  const [mixes, setMixes] = useState<DailyMixSeed[]>([0, 1, 2].map(() => ({ label: '', seedTrackIds: [] })));
  useEffect(() => { let active = true; void currentDailyStations().then((value) => { if (active) setMixes(value); }); return () => { active = false; }; }, []);
  return <section aria-label={getString('settings_radio_dailyStations')} className="mb-6 text-on-surface">
    <h2 className="mb-3 text-xl font-semibold">{getString('settings_radio_dailyStations')}</h2>
    <div className="grid gap-3 sm:grid-cols-3">{mixes.map((mix, index) => <button type="button" key={index}
      disabled={!mix.seedTrackIds.length} onClick={() => navigate(dailyMixRoute(mix))}
      className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 text-start disabled:opacity-70">
      <span className="block font-semibold">{getString('settings_radio_mixNumber', index + 1)}</span>
      <span className="block text-sm text-on-surface-variant">{mix.seedTrackIds.length ? mix.label : getString('settings_radio_mixNeedsHistory')}</span>
      <span className="block text-xs text-on-surface-variant">{getString(index === 2 ? 'settings_radio_mixFringe' : 'settings_radio_mixComfort')}</span>
    </button>)}</div>
  </section>;
}
