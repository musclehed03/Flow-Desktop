import { milkdropPresetNames } from "../../lib/audio/milkdrop";
import { videoAnalyser } from "../../lib/audio/videoAnalyser";
import { toggleMusicFullscreen } from "../../lib/musicPresentation";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, X, Play, Pause, SkipBack, SkipForward, Maximize2, Brain, SlidersHorizontal } from 'lucide-react';
import { useVisualizerConfig, useVisualizerUi, openVisualizer, acceptVisualizerAdvisory } from '../../lib/useVisualizer';
import { useBoolPref, usePreference } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { parseVisualizerPresets, VISUALIZER_DEFAULTS, type VisualizerConfig } from '../../lib/audio/visualizer';
import { VisualizerCanvas } from './VisualizerCanvas';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { usePlayerStore } from '../../store/usePlayerStore';

export function VisualizerToggle({ surface }: { surface: 'music' | 'video' }) {
  const { t } = useTranslation('settings');
  const open = useVisualizerUi((state) => state.open);
  return <button type="button" data-visualizer-toggle="true" aria-label={t('visualizer.title')} title={t('visualizer.title')} aria-pressed={open}
    onClick={() => { if (open) useVisualizerUi.setState({ open: false }); else void openVisualizer(surface); }}
    className="grid h-10 w-10 place-items-center rounded-full border border-outline-variant bg-surface-container text-on-surface"><AudioLines size={18} /></button>;
}
export function VisualizerArtwork({ children }: { children: ReactNode }) {
  const [config] = useVisualizerConfig();
  const [simple] = useBoolPref(SETTINGS.SIMPLIFIED_VIEW_ENABLED);
  const [focus] = useBoolPref(SETTINGS.SENSORY_FOCUS_ENABLED);
  return config.enabled && config.mode === 'inline' && !simple && !focus
    ? <div className="aspect-square w-[min(480px,50vh,40vw)]"><VisualizerCanvas config={config} surface="music" /></div> : children;
}

export function Visualizers() {
  const { t } = useTranslation('settings');
  const [config, saveConfig] = useVisualizerConfig();
  const [draft, setDraft] = useState(config);
  const [presetsRaw, savePresets] = usePreference(SETTINGS.VISUALIZER_PRESETS);
  const presets = parseVisualizerPresets(presetsRaw);
  const [name, setName] = useState('');
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);
  const acknowledged = useVisualizerUi((state) => state.consented);
  const open = useVisualizerUi((state) => state.open);
  const surface = useVisualizerUi((state) => state.surface);
  const [simple] = useBoolPref(SETTINGS.SIMPLIFIED_VIEW_ENABLED);
  const [focus] = useBoolPref(SETTINGS.SENSORY_FOCUS_ENABLED);
  const music = useMusicPlayerStore((state) => state.currentTrack);
  const video = usePlayerStore((state) => state.currentVideo);
  const musicPlaying = useMusicPlayerStore((state) => state.isPlaying);
  const videoPlaying = usePlayerStore((state) => state.isPlaying);
  const musicFullscreen = useMusicPlayerStore((state) => state.musicFullscreen);
  const videoFullscreen = usePlayerStore((state) => state.isVideoFullscreen);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { if (open) { opener.current = document.activeElement as HTMLElement; setDraft(config); dialog.current?.showModal(); } else if (dialog.current?.open) dialog.current.close(); }, [open]);
  useEffect(() => {
    if (open && draft.family === 'feedback') void milkdropPresetNames().then(setMilkdropNames).catch(() => setMilkdropNames([]));
  }, [open, draft.family]);
  useEffect(() => {
    if (music) useVisualizerUi.setState({ surface: 'music' });
    else if (video && config.enabled) void videoAnalyser().then((analyser) => useVisualizerUi.setState({ surface: 'video', analyser }));
  }, [music?.id, video?.id, config.enabled]);
  const close = () => { useVisualizerUi.setState({ open: false }); opener.current?.focus(); };
  useEffect(() => {
    if (!config.enabled || config.mode !== 'fullscreen') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !dialog.current?.open) { event.preventDefault(); event.stopImmediatePropagation(); saveConfig({ ...config, enabled: false }); } };
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [config.enabled, config.mode]);
  const update = (next: VisualizerConfig) => { setDraft(next); saveConfig(next); };
  const visible = config.enabled && !simple && !focus && (surface === 'music' ? !!music : !!video);
  const floating = visible && (config.mode !== 'inline' || surface === 'video');
  return <>
    {visible && !acknowledged && <section role="alert" data-sensory-essential="true" className="fixed bottom-28 right-4 z-[590] max-w-sm rounded-2xl border border-outline-variant bg-background p-4 text-on-surface"><p>{t('visualizer.advisory')}</p><button type="button" className="mt-2 rounded-full border border-outline-variant px-3 py-2" onClick={() => useVisualizerUi.setState({ open: true })}>{t('visualizer.review')}</button></section>}
    {floating && <section aria-label={t('visualizer.title')} data-sensory-essential="true"
      className={config.mode === 'fullscreen' ? 'fixed inset-0 z-[580] bg-background p-4 text-on-surface' : 'fixed bottom-28 right-4 z-[80] h-40 w-80 rounded-2xl border border-outline-variant bg-background p-2 text-on-surface'}>
      <div className="absolute right-5 top-5 z-10 flex max-w-[90vw] flex-wrap gap-2 rounded-full border border-outline-variant bg-surface-container p-2">
        <button type="button" aria-label={t('visualizer.playPause')} aria-pressed={surface === 'music' ? musicPlaying : videoPlaying} className="grid h-8 w-8 place-items-center rounded-full" onClick={() => surface === 'music' ? useMusicPlayerStore.getState().togglePlay() : usePlayerStore.getState().setIsPlaying(!usePlayerStore.getState().isPlaying)}>{(surface === 'music' ? musicPlaying : videoPlaying) ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" aria-label={t('sensory.player.previous')} className="grid h-8 w-8 place-items-center rounded-full" onClick={() => surface === 'music' ? useMusicPlayerStore.getState().previous() : usePlayerStore.getState().playPrevious()}><SkipBack size={18} /></button>
        <button type="button" aria-label={t('sensory.player.next')} className="grid h-8 w-8 place-items-center rounded-full" onClick={() => surface === 'music' ? useMusicPlayerStore.getState().next() : usePlayerStore.getState().playNext(true)}><SkipForward size={18} /></button>
        <button type="button" aria-label={t('visualizer.fullscreen')} aria-pressed={surface === 'music' ? musicFullscreen : videoFullscreen} className="grid h-8 w-8 place-items-center rounded-full" onClick={() => { if (surface === 'music') void toggleMusicFullscreen(); else usePlayerStore.getState().setIsVideoFullscreen(!usePlayerStore.getState().isVideoFullscreen); }}><Maximize2 size={18} /></button>
        <button type="button" aria-label={t('sensory.controls')} aria-haspopup="dialog" className="grid h-8 w-8 place-items-center rounded-full" onClick={() => document.querySelector<HTMLButtonElement>('[aria-controls="deviant-controls-dialog"]')?.click()}><Brain size={18} /></button>
        <button type="button" aria-label={t('visualizer.customize')} aria-haspopup="dialog" className="grid h-8 w-8 place-items-center rounded-full" onClick={() => useVisualizerUi.setState({ open: true })}><SlidersHorizontal size={18} /></button>
        <button type="button" aria-label={t('visualizer.close')} onClick={() => update({ ...config, enabled: false })}><X size={18} /></button>
      </div>
      <VisualizerCanvas config={config} />
    </section>}
    <dialog data-visualizer-dialog="true" ref={dialog} aria-label={t('visualizer.title')} onCancel={close} onClose={() => { useVisualizerUi.setState({ open: false }); opener.current?.focus(); }}
      className="m-auto max-h-[90vh] w-[min(40rem,95vw)] overflow-y-auto rounded-2xl border border-outline-variant bg-background p-5 text-on-surface">
      <button type="button" aria-label={t('visualizer.close')} onClick={close} className="mb-3 ml-auto flex rounded-full border border-outline-variant p-2"><X size={18} /></button>
      <h2 className="mb-2 text-xl font-semibold">{t('visualizer.title')}</h2>
      <p className="mb-3 text-sm" role="note">{t('visualizer.advisory')}</p>
      <label className="mb-3 flex items-center gap-2"><input type="checkbox" checked={acknowledged} onChange={(event) => acceptVisualizerAdvisory(event.target.checked)} />{t('visualizer.acknowledge')}</label>
      <button type="button" aria-pressed={draft.enabled} aria-label={t('visualizer.enabled')} disabled={!acknowledged && !draft.enabled}
        onClick={() => update({ ...draft, enabled: !draft.enabled })} className="mb-4 rounded-full border border-outline-variant px-4 py-2">{t(draft.enabled ? 'sensory.on' : 'sensory.off')} · {t('visualizer.enabled')}</button>
      {(simple || focus) && <p role="status">{t('visualizer.suiteHidden')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{t('visualizer.family')}<select value={draft.family} onChange={(event) => update({ ...draft, family: event.target.value as VisualizerConfig['family'] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{['spectrum','waveform','radial','nebula','feedback'].map((value) => <option key={value} value={value}>{t(`visualizer.${value}`)}</option>)}</select></label>
        <label>{t('visualizer.mode')}<select value={draft.mode} onChange={(event) => update({ ...draft, mode: event.target.value as VisualizerConfig['mode'] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{['inline','mini','fullscreen'].map((value) => <option key={value} value={value}>{t(`visualizer.${value}`)}</option>)}</select></label>
        <label>{t('visualizer.palette')}<select value={draft.palette} onChange={(event) => update({ ...draft, palette: event.target.value as VisualizerConfig['palette'] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{['deviants','cyan','mono'].map((value) => <option key={value} value={value}>{t(`visualizer.${value}`)}</option>)}</select></label>
        <label>{t('visualizer.fps')}<select value={draft.fps} onChange={(event) => update({ ...draft, fps: Number(event.target.value) as VisualizerConfig['fps'] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{[15,30,60].map((value) => <option key={value}>{value}</option>)}</select></label>
        {([['sensitivity',.2,3,.1],['smoothing',0,.98,.01],['density',16,160,1],['falloff',.1,.98,.01],['beat',0,1,.05]] as const).map(([key,min,max,step]) => <label key={key}>{t(`visualizer.${key}`)} · {draft[key]}
          <input type="range" aria-label={t(`visualizer.${key}`)} min={min} max={max} step={step} value={draft[key]} className="block w-full"
            onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} onPointerUp={() => saveConfig(draft)} onKeyUp={() => saveConfig(draft)} onBlur={() => saveConfig(draft)} /></label>)}
      </div>
      {draft.family === 'feedback' && <label className="mt-3 block">{t('visualizer.milkdropPreset')}<select value={draft.milkdropPreset ?? milkdropNames[0] ?? ''} onChange={(event) => update({ ...draft, milkdropPreset: event.target.value })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{milkdropNames.map((preset) => <option key={preset}>{preset}</option>)}</select></label>}
      <div className="my-4 flex flex-wrap gap-2">{VISUALIZER_DEFAULTS.map((preset) => <button type="button" key={preset.key} className="rounded-full border border-outline-variant px-3 py-2" onClick={() => update({ ...preset.config, enabled: draft.enabled })}>{t(`visualizer.preset_${preset.key}`)}</button>)}</div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { savePresets(JSON.stringify([...presets, { name: name.trim(), config: draft }])); setName(''); } }}>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t('visualizer.presetName')} className="rounded-lg border border-outline-variant bg-surface p-2 text-on-surface" />
        <button type="submit" className="rounded-full border border-outline-variant px-3 py-2">{t('visualizer.savePreset')}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">{presets.map((preset,index) => <button type="button" key={`${preset.name}-${index}`} className="rounded-full border border-outline-variant px-3 py-2" onClick={() => update({ ...preset.config, enabled: draft.enabled })}>{preset.name}</button>)}</div>
    </dialog>
  </>;
}
