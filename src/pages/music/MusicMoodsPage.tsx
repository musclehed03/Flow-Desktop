import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button';
import { useMusicMoods } from '../../lib/useMusicMoods';
import { musicSeeAllRoute } from '../../lib/musicRoutes';

export default function MusicMoodsPage() {
  const { t } = useTranslation('common');
  const { t: stationText } = useTranslation('settings');
  const navigate = useNavigate();
  const { groups, loading, error, reload } = useMusicMoods();

  return <main className="px-6 py-8 lg:px-8">
    <h1 className="mb-6 text-3xl font-bold tracking-tight text-chrome-neutral-100">{t('musicBrowse')}</h1>
    {error && <div className="mb-6 flex items-center gap-3 text-sm text-chrome-neutral-400">
      <span>{error}</span><Button variant="secondary" onClick={() => void reload()}>{t('musicRetry')}</Button>
    </div>}
    {loading && !groups.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 12 }).map((_, index) => <div key={index}
        className="h-24 animate-pulse rounded-2xl bg-surface-container-low" />)}
    </div> : <div className="flex flex-col gap-10">
      {groups.map((group, index) => <section key={`${group.title}:${index}`}>
        {group.title && <h2 className="mb-4 text-xl font-bold text-chrome-neutral-100">{group.title}</h2>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.items.map((item) => <div key={`${item.browseId}:${item.params ?? ''}`} className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
          <button type="button" onClick={() => navigate(musicSeeAllRoute(item.browseId, item.params, item.title))}
            className="mb-3 block text-left font-medium text-on-surface">{item.title}</button>
          <Button variant="secondary" onClick={() => void useMusicPlayerStore.getState().startGenreRadio(item)}>{stationText('radio.station')}</Button>
        </div>)}
        </div>
      </section>)}
    </div>}
    {!loading && !error && !groups.length && <p className="py-20 text-center text-sm text-chrome-neutral-400">{t('musicChipEmpty')}</p>}
  </main>;
}
