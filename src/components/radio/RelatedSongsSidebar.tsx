import { getString } from '../../lib/i18n/index';
import { useEffect, useRef } from 'react';
import { ListMusic, X } from 'lucide-react';
import { useDismissOnOutsideInteraction } from '../../lib/useDismissOnOutsideInteraction';
import { useRelatedSnapshot } from '../../lib/relatedSnapshot';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { usePlayerStore } from '../../store/usePlayerStore';

export function RelatedSongsToggle({ surface }: { surface: 'music' | 'video' }) {
  const open = useRelatedSnapshot((state) => state.open);
  return <button type="button" data-related-toggle="true" aria-label={getString('related_title')} title={getString('related_title')}
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
  const state = useRelatedSnapshot();
  const close = useRef<HTMLButtonElement>(null);
  // The toggle that opened the sidebar is stored on the snapshot, so a click
  // on it toggles instead of dismissing and immediately reopening.
  const openerRef = useRef<HTMLElement | null>(null);
  openerRef.current = state.opener;
  // Click-off dismiss (fixes batch #18): a click or focus move back to the
  // page closes the sidebar — no hunting for the X. Escape is owned by the
  // same hook, and focus returns to the toggle that opened it.
  const sidebarRef = useDismissOnOutsideInteraction<HTMLElement>({
    open: state.open,
    onDismiss: () => useRelatedSnapshot.getState().close(),
    additionalRefs: [openerRef],
    restoreFocusRef: openerRef,
  });
  useEffect(() => {
    if (!state.open) return;
    close.current?.focus();
  }, [state.open]);
  if (!state.open) return null;
  const title = state.seed?.kind === 'music' ? state.seed.song.title : state.seed?.video.title;
  return <aside ref={sidebarRef} id="related-songs-sidebar" data-sensory-essential="true" role="region" aria-label={getString('related_title')}
    className="fixed bottom-0 end-0 top-[var(--app-titlebar-height,0px)] z-[560] w-[min(28rem,100vw)] overflow-y-auto border-s border-outline-variant bg-background p-4 text-on-surface">
    <header className="mb-4 flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{getString('related_title')}</h2><p className="text-sm text-on-surface-variant">{getString('related_snapshot', title)}</p></div>
      <button ref={close} type="button" aria-label={getString('related_close')} onClick={state.close} className="rounded-full border border-outline-variant p-2"><X size={18} /></button>
    </header>
    {state.loading && <p role="status">{getString('related_loading')}</p>}
    {state.error && <p role="alert">{getString('related_error')}</p>}
    {!state.loading && !state.error && !state.rows.length && <p>{getString('related_empty')}</p>}
    <ol className="space-y-3">{state.rows.map((row) => <li key={row.id} className="rounded-xl border border-outline-variant p-3">
      <p className="font-medium">{row.title}</p><p className="text-sm text-on-surface-variant">{row.artist}</p>
      {state.added.includes(row.id) ? <p role="status" className="mt-2 text-sm">✓ {getString('related_added')}</p> : <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" aria-label={getString('related_nextLabel', row.title)} onClick={() => state.add(row, true)} className="rounded-full border border-outline-variant px-3 py-2 text-sm">{getString('related_next')}</button>
        <button type="button" aria-label={getString('related_appendLabel', row.title)} onClick={() => state.add(row, false)} className="rounded-full border border-outline-variant px-3 py-2 text-sm">{getString('related_append')}</button>
      </div>}
    </li>)}</ol>
  </aside>;
}
