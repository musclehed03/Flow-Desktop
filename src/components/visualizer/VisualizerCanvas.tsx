import { customizeMilkdropPreset } from "../../lib/audio/milkdrop";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { musicAudioEngine } from '../../lib/audio/musicAudioEngine';
import { drawVisualizer, degradeVisualizer, type VisualizerConfig } from '../../lib/audio/visualizer';
import { useVisualizerUi } from '../../lib/useVisualizer';
import { useBoolPref } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';

export function VisualizerCanvas({ config, surface: override }: { config: VisualizerConfig; surface?: 'music' | 'video' }) {
  const { t } = useTranslation('settings');
  const canvas = useRef<HTMLCanvasElement>(null);
  const selected = useVisualizerUi((state) => state.surface);
  const surface = override ?? selected;
  const videoNode = useVisualizerUi((state) => state.analyser);
  const [safeMotion] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED);
  const consented = useVisualizerUi((state) => state.consented);
  const safe = safeMotion || !consented;
  const [status, setStatus] = useState<'waiting' | 'active' | 'fallback'>('waiting');
  const [webglFailed, setWebglFailed] = useState(false);
  useEffect(() => setWebglFailed(false), [config.family, config.milkdropPreset]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let stopped = false, raf = 0, last = -Infinity, phase = 0, samples = 0, average = 0;
    let fps: number = config.fps, density = config.density, quality = 1;
    let milkdrop: { render(): void; setRendererSize(w: number,h: number): void; disconnectAudio(node: AudioNode): void } | null = null;
    let connected: AudioNode | null = null;
    let input: GainNode | null = null;
    let context: CanvasRenderingContext2D | null = null;
    const frequency = new Uint8Array(1024), wave = new Uint8Array(2048), peaks = new Float32Array(160);
    const signal = () => surface === 'music' ? musicAudioEngine.getAnalyser() : videoNode;
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue(config.palette === 'mono' ? '--dd-light-text' : config.palette === 'cyan' ? '--dd-cyan' : '--dd-pink').trim();
    const utility = style.getPropertyValue(config.palette === 'mono' ? '--dd-light-text' : '--dd-cyan').trim();
    const background = style.getPropertyValue('--dd-near-black').trim();
    const frame = (time: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden || time - last < 1000 / fps) return;
      const elapsed = Number.isFinite(last) ? time - last : 1000 / fps; last = time;
      const begin = performance.now();
      const node = signal();
      const width = Math.max(1, Math.min(1440, Math.floor(element.clientWidth * quality)));
      const height = Math.max(1, Math.min(900, Math.floor(element.clientHeight * quality)));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; milkdrop?.setRendererSize(width,height); }
      if (node && !safe) { node.smoothingTimeConstant = config.smoothing; node.getByteFrequencyData(frequency); node.getByteTimeDomainData(wave); if (!webglFailed) setStatus((value) => value === 'active' ? value : 'active'); }
      else { frequency.fill(0); wave.fill(128); }
      if (milkdrop && !safe) { if (input) input.gain.setTargetAtTime(config.sensitivity * (1 + config.beat * frequency[0]! / 255), input.context.currentTime, .03); milkdrop.render(); }
      else if (context) drawVisualizer(context, width, height, frequency, wave, { ...config, family: config.family === 'feedback' ? 'radial' : config.family, density, falloff: Math.pow(config.falloff, elapsed / (1000/30)) }, [primary,utility,background], peaks, phase);
      phase += elapsed / 1000;
      average = average * .9 + Math.max(performance.now() - begin, elapsed > 2000 / fps ? Math.min(100,elapsed - 1000/fps) : 0) * .1;
      if (++samples % 60 === 0) { if (milkdrop && fps === 15 && quality <= .5 && average > 1000/15*.65) setWebglFailed(true); const reduced = degradeVisualizer(fps,density,average); if (reduced.fps < fps) quality = Math.max(.5,quality*.8); fps = reduced.fps; density = reduced.density; }
      element.dataset.effectiveFps = String(safe ? 0 : fps); element.dataset.effectiveDensity = String(density);
      if (safe) { cancelAnimationFrame(raf); setStatus('fallback'); }
    };
    const initialize = async () => {
      if (config.family === 'feedback' && !webglFailed && !safe && signal()) {
        try {
          const [{ default: butterchurn }, { default: presets }] = await Promise.all([import('butterchurn'), import('butterchurn-presets')]);
          if (stopped) return;
          const node = signal()!;
          const all = presets.getPresets(); const name = config.milkdropPreset && all[config.milkdropPreset] ? config.milkdropPreset : Object.keys(all).sort()[0]!;
          const visual = butterchurn.createVisualizer(node.context as AudioContext, element, { width: Math.max(1,element.clientWidth), height: Math.max(1,element.clientHeight), pixelRatio: 1, textureRatio: .5, meshWidth: Math.max(16,Math.floor(config.density/2)), meshHeight: Math.max(12,Math.floor(config.density/3)) });
          input = (node.context as AudioContext).createGain(); input.gain.value = config.sensitivity;
          node.connect(input); visual.connectAudio(input); visual.loadPreset(customizeMilkdropPreset(all[name], config, primary), 0); milkdrop = visual; connected = input;
        } catch { setStatus('fallback'); setWebglFailed(true); return; }
      }
      if (!milkdrop) context = element.getContext('2d');
      raf = requestAnimationFrame(frame);
    };
    void initialize();
    return () => { stopped = true; cancelAnimationFrame(raf); if (connected) { try { milkdrop?.disconnectAudio(connected); input?.disconnect(); if (input) signal()?.disconnect(input); } catch { /* Older renderer versions may already have released the input. */ } } };
  }, [config.family, config.milkdropPreset, config.palette, config.sensitivity, config.smoothing, config.density, config.falloff, config.beat, config.fps, safe, surface, videoNode, webglFailed]);
  return <figure className="relative h-full w-full overflow-hidden rounded-2xl bg-[var(--dd-near-black)]">
    <canvas key={`${config.family}:${safe}:${webglFailed}`} ref={canvas} aria-hidden="true" className="h-full w-full" />
    <figcaption className="absolute bottom-1 left-2 text-xs text-[var(--dd-light-text)]">{t(!consented ? 'visualizer.review' : safe ? 'visualizer.safeFrame' : status === 'waiting' ? 'visualizer.waiting' : status === 'fallback' ? 'visualizer.fallback' : 'visualizer.active')}</figcaption>
  </figure>;
}
