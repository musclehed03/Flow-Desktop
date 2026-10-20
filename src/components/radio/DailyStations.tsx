import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { currentDailyStations } from '../../lib/dailyStations';
import { dailyMixRoute } from '../../lib/musicMixes';
import type { DailyMixSeed } from '../../types/music';

export function DailyStations() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [mixes, setMixes] = useState<DailyMixSeed[]>([0, 1, 2].map(() => ({ label: '', seedTrackIds: [] })));
  useEffect(() => { let active = true; void currentDailyStations().then((value) => { if (active) setMixes(value); }); return () => { active = false; }; }, []);
  return <section aria-label={t('radio.dailyStations')} className="mb-6 text-on-surface">
    <h2 className="mb-3 text-xl font-semibold">{t('radio.dailyStations')}</h2>
    <div className="grid gap-3 sm:grid-cols-3">{mixes.map((mix, index) => <button type="button" key={index}
      disabled={!mix.seedTrackIds.length} onClick={() => navigate(dailyMixRoute(mix))}
      className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 text-left disabled:opacity-70">
      <span className="block font-semibold">{t('radio.mixNumber', { number: index + 1 })}</span>
      <span className="block text-sm text-on-surface-variant">{mix.seedTrackIds.length ? mix.label : t('radio.mixNeedsHistory')}</span>
      <span className="block text-xs text-on-surface-variant">{t(index === 2 ? 'radio.mixFringe' : 'radio.mixComfort')}</span>
    </button>)}</div>
  </section>;
}
