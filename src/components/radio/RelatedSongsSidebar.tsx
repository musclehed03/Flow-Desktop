import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ListMusic, X } from 'lucide-react';
import { useRelatedSnapshot } from '../../lib/relatedSnapshot';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { usePlayerStore } from '../../store/usePlayerStore';

export function RelatedSongsToggle({ surface }: { surface: 'music' | 'video' }) {
  const { t } = useTranslation('settings');
  const open = useRelatedSnapshot((state) => state.open);
  return <button type="button" data-related-toggle="true" aria-label={t('related.title')} title={t('related.title')}
    aria-expanded={open} aria-pressed={open} aria-controls="related-songs-sidebar"
    className="grid h-10 w-10 place-items-center rounded-full border border-outline-variant bg-surface-container text-on-surface"
    onClick={(event) => {
      const snapshot = useRelatedSnapshot.getState();
      if (snapshot.open) { snapshot.close(); return; }
      if (surface === 'music') {
        const player = useMusicPlayerStore.getState();
        if (player.currentTrack) void snapshot.show({ kind: 'music', song: player.currentTrack }, player.queue.map((song) => song.videoId ?? song.id), event.currentTarget);
      } else {
        const player = usePlayerStore.getState();
        if (player.currentVideo) void snapshot.show({ kind: 'video', video: player.currentVideo }, player.queue.map((video) => video.id), event.currentTarget);
      }
    }}><ListMusic size={18} aria-hidden="true" /></button>;
}

export function RelatedSongsSidebar() {
  const { t } = useTranslation('settings');
  const state = useRelatedSnapshot();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state.open) return;
    close.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); useRelatedSnapshot.getState().close(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [state.open]);
  if (!state.open) return null;
  const title = state.seed?.kind === 'music' ? state.seed.song.title : state.seed?.video.title;
  return <aside id="related-songs-sidebar" data-sensory-essential="true" role="region" aria-label={t('related.title')}
    className="fixed bottom-0 right-0 top-[var(--app-titlebar-height,0px)] z-[560] w-[min(28rem,100vw)] overflow-y-auto border-l border-outline-variant bg-background p-4 text-on-surface">
    <header className="mb-4 flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{t('related.title')}</h2><p className="text-sm text-on-surface-variant">{t('related.snapshot', { name: title })}</p></div>
      <button ref={close} type="button" aria-label={t('related.close')} onClick={state.close} className="rounded-full border border-outline-variant p-2"><X size={18} /></button>
    </header>
    {state.loading && <p role="status">{t('related.loading')}</p>}
    {state.error && <p role="alert">{t('related.error')}</p>}
    {!state.loading && !state.error && !state.rows.length && <p>{t('related.empty')}</p>}
    <ol className="space-y-3">{state.rows.map((row) => <li key={row.id} className="rounded-xl border border-outline-variant p-3">
      <p className="font-medium">{row.title}</p><p className="text-sm text-on-surface-variant">{row.artist}</p>
      {state.added.includes(row.id) ? <p role="status" className="mt-2 text-sm">✓ {t('related.added')}</p> : <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" aria-label={t('related.nextLabel', { name: row.title })} onClick={() => state.add(row, true)} className="rounded-full border border-outline-variant px-3 py-2 text-sm">{t('related.next')}</button>
        <button type="button" aria-label={t('related.appendLabel', { name: row.title })} onClick={() => state.add(row, false)} className="rounded-full border border-outline-variant px-3 py-2 text-sm">{t('related.append')}</button>
      </div>}
    </li>)}</ol>
  </aside>;
}
