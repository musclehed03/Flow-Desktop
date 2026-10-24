import { videoAnalyser } from "../../lib/audio/videoAnalyser";
import { toggleMusicFullscreen } from "../../lib/musicPresentation";
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, X, Maximize2, Brain, ListMusic, SlidersHorizontal, GripHorizontal, RotateCcw } from 'lucide-react';
import { useVisualizerConfig, useVisualizerUi, openVisualizer, openVisualizerCustomizer } from '../../lib/useVisualizer';
import { useBoolPref } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { VisualizerCanvas } from './VisualizerCanvas';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { PlayerTransportControls, PlayerVolumeControl } from '../player/SharedPlayerControls';
import { Slider } from '../ui/Slider';
import { requestVideoSeek } from '../../lib/playerEvents';
import { useSurfaceLayout } from '../../lib/useSurfaceLayout';

const VISUALIZER_CONSTRAINTS = { minWidth: 280, minHeight: 140, margin: 12 } as const;

const VisualizerCustomizerPanel = lazy(() => import('./VisualizerCustomizerPanel'));

export function VisualizerToggle({ surface }: { surface: 'music' | 'video' }) {
  const { t } = useTranslation('settings');
  const open = useVisualizerUi((state) => state.open);
  return <button type="button" data-visualizer-toggle="true" data-player-control="visualizer" aria-label={t('visualizer.title')} title={t('visualizer.title')} aria-pressed={open}
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
  const acknowledged = useVisualizerUi((state) => state.consented);
  const open = useVisualizerUi((state) => state.open);
  const openerElement = useVisualizerUi((state) => state.opener);
  const surface = useVisualizerUi((state) => state.surface);
  const [simple] = useBoolPref(SETTINGS.SIMPLIFIED_VIEW_ENABLED);
  const [focus] = useBoolPref(SETTINGS.SENSORY_FOCUS_ENABLED);
  const music = useMusicPlayerStore((state) => state.currentTrack);
  const video = usePlayerStore((state) => state.currentVideo);
  const musicPlaying = useMusicPlayerStore((state) => state.isPlaying);
  const videoPlaying = usePlayerStore((state) => state.isPlaying);
  const musicProgress = useMusicPlayerStore((state) => state.progress);
  const musicDuration = useMusicPlayerStore((state) => state.duration);
  const musicVolume = useMusicPlayerStore((state) => state.volume);
  const musicMuted = useMusicPlayerStore((state) => state.isMuted);
  const videoProgress = usePlayerStore((state) => state.currentTime);
  const videoDuration = usePlayerStore((state) => state.duration);
  const videoVolume = usePlayerStore((state) => state.volume);
  const videoMuted = usePlayerStore((state) => state.muted);
  const musicFullscreen = useMusicPlayerStore((state) => state.musicFullscreen);
  const videoFullscreen = usePlayerStore((state) => state.isVideoFullscreen);
  const opener = useRef<HTMLElement | null>(null);
  const miniSurface = useSurfaceLayout('visualizer-mini', () => ({
    x: Math.max(12, window.innerWidth - 332), y: Math.max(12, window.innerHeight - 284), width: 320, height: 160,
  }), VISUALIZER_CONSTRAINTS);
  opener.current = openerElement;
  useEffect(() => {
    if (music) useVisualizerUi.setState({ surface: 'music' });
    else if (video && config.enabled) void videoAnalyser().then((analyser) => useVisualizerUi.setState({ surface: 'video', analyser }));
  }, [music?.id, video?.id, config.enabled]);
  const close = () => useVisualizerUi.setState({ open: false });
  useEffect(() => {
    if (!config.enabled || config.mode !== 'fullscreen') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !open) { event.preventDefault(); event.stopImmediatePropagation(); saveConfig({ ...config, enabled: false }); } };
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [config.enabled, config.mode, open]);
  const update = saveConfig;
  const activePlaying = surface === 'music' ? musicPlaying : videoPlaying;
  const activeProgress = surface === 'music' ? musicProgress : videoProgress;
  const activeDuration = surface === 'music' ? musicDuration : videoDuration;
  const activeVolume = surface === 'music' ? musicVolume : videoVolume;
  const activeMuted = surface === 'music' ? musicMuted : videoMuted;
  const seek = (seconds: number) => surface === 'music'
    ? useMusicPlayerStore.getState().seek(seconds)
    : requestVideoSeek(seconds);
  const openQueue = () => {
    if (config.mode === 'fullscreen') update({ ...config, mode: 'mini' });
    if (surface === 'music') useMusicPlayerStore.getState().openOverlay('queue');
    else {
      const player = usePlayerStore.getState();
      player.setIsQueuePanelOpen(true);
      player.expandVideoPlayer();
      window.dispatchEvent(new CustomEvent('flow-video-expand-request'));
    }
  };
  const visible = config.enabled && !simple && !focus && (surface === 'music' ? !!music : !!video);
  const floating = visible && (config.mode !== 'inline' || surface === 'video');
  return <>
    {visible && !acknowledged && <section role="alert" data-sensory-essential="true" className="fixed bottom-28 right-4 z-[590] max-w-sm rounded-2xl border border-outline-variant bg-background p-4 text-on-surface"><p>{t('visualizer.advisory')}</p><button type="button" className="mt-2 rounded-full border border-outline-variant px-3 py-2" onClick={openVisualizerCustomizer}>{t('visualizer.review')}</button></section>}
    {floating && <section aria-label={t('visualizer.title')} data-sensory-essential="true"
      style={config.mode === 'fullscreen' ? undefined : { left: miniSurface.layout.x, top: miniSurface.layout.y, width: miniSurface.layout.width, height: miniSurface.layout.height }}
      className={config.mode === 'fullscreen' ? 'fixed inset-0 z-[580] bg-background p-4 text-on-surface' : 'fixed z-[80] overflow-hidden rounded-2xl border border-outline-variant bg-background p-2 text-on-surface'}>
      <div className="absolute right-5 top-5 z-10 flex max-w-[90vw] flex-wrap gap-2 rounded-full border border-outline-variant bg-surface-container p-2">
        {config.mode !== 'fullscreen' && <>
          <button type="button" aria-label={t('surface.drag')} title={t('surface.drag')} onPointerDown={miniSurface.beginMove} onKeyDown={miniSurface.keyboardMove} className="grid h-8 w-8 touch-none place-items-center rounded-full"><GripHorizontal size={18} /></button>
          <button type="button" aria-label={t('surface.reset')} title={t('surface.reset')} onClick={miniSurface.reset} className="grid h-8 w-8 place-items-center rounded-full"><RotateCcw size={17} /></button>
        </>}
        <PlayerTransportControls
          isPlaying={activePlaying}
          onPrevious={() => surface === 'music' ? useMusicPlayerStore.getState().previous() : usePlayerStore.getState().playPrevious()}
          onTogglePlay={() => surface === 'music' ? useMusicPlayerStore.getState().togglePlay() : usePlayerStore.getState().setIsPlaying(!usePlayerStore.getState().isPlaying)}
          onNext={() => surface === 'music' ? useMusicPlayerStore.getState().next() : usePlayerStore.getState().playNext(true)}
          labels={{ previous: t('sensory.player.previous'), play: t('sensory.player.play'), pause: t('sensory.player.pause'), next: t('sensory.player.next') }}
        />
        <div className="w-24" data-player-control="seek">
          <Slider aria-label={t('sensory.player.seek')} min={0} max={Math.max(1, activeDuration)} step={1} value={Math.min(activeProgress, Math.max(1, activeDuration))} onChange={seek} />
        </div>
        <PlayerVolumeControl
          volume={activeVolume}
          muted={activeMuted}
          onToggleMute={() => surface === 'music' ? useMusicPlayerStore.getState().toggleMute() : usePlayerStore.getState().setMuted((value) => !value)}
          onVolumeChange={(value) => {
            if (surface === 'music') {
              const player = useMusicPlayerStore.getState();
              player.setVolume(value);
              if (player.isMuted && value > 0) player.toggleMute();
            } else {
              const player = usePlayerStore.getState();
              player.setVolume(value);
              player.setMuted(value === 0);
            }
          }}
          labels={{ mute: t('sensory.player.mute'), unmute: t('sensory.player.unmute'), volume: t('sensory.player.volume') }}
        />
        <button type="button" data-player-control="queue" aria-label={t('sensory.player.queue')} className="grid h-8 w-8 place-items-center rounded-full" onClick={openQueue}><ListMusic size={18} /></button>
        <button type="button" data-player-control="fullscreen" aria-label={t('visualizer.fullscreen')} aria-pressed={surface === 'music' ? musicFullscreen : videoFullscreen} className="grid h-8 w-8 place-items-center rounded-full" onClick={() => { if (surface === 'music') void toggleMusicFullscreen(); else usePlayerStore.getState().setIsVideoFullscreen(!usePlayerStore.getState().isVideoFullscreen); }}><Maximize2 size={18} /></button>
        <button type="button" data-player-control="deviant-controls" aria-label={t('sensory.controls')} aria-haspopup="dialog" className="grid h-8 w-8 place-items-center rounded-full" onClick={() => document.querySelector<HTMLButtonElement>('[aria-controls="deviant-controls-dialog"]')?.click()}><Brain size={18} /></button>
        <button type="button" data-player-control="visualizer" aria-label={t('visualizer.customize')} aria-haspopup="dialog" className="grid h-8 w-8 place-items-center rounded-full" onClick={openVisualizerCustomizer}><SlidersHorizontal size={18} /></button>
        <button type="button" aria-label={t('visualizer.close')} onClick={() => update({ ...config, enabled: false })}><X size={18} /></button>
      </div>
      <VisualizerCanvas config={config} />
      {config.mode !== 'fullscreen' && <div role="separator" tabIndex={0} aria-label={t('surface.resize')} onPointerDown={miniSurface.beginResize} onKeyDown={miniSurface.keyboardResize} className="absolute bottom-0 right-0 z-20 h-5 w-5 cursor-nwse-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />}
    </section>}
    {open && <Suspense fallback={<p role="status" className="fixed right-4 top-4 z-[620] rounded-lg bg-surface-container p-3 text-on-surface">{t('visualizer.loading')}</p>}>
      <VisualizerCustomizerPanel config={config} openerRef={opener} onChange={saveConfig} onClose={close} />
    </Suspense>}
  </>;
}
