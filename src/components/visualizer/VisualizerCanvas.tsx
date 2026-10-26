import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { customizeMilkdropPreset, resolveMilkdropRenderer } from "../../lib/audio/milkdrop";
import { musicAudioEngine } from "../../lib/audio/musicAudioEngine";
import {
  VISUALIZER_SILENCE_HOLD_MS,
  VISUALIZER_SILENCE_POLL_MS,
  VISUALIZER_SILENCE_THRESHOLD,
  degradeVisualizer,
  drawMirroredImage,
  drawVisualizer,
  enforceReducedFlash,
  resolveVisualizerColors,
  visualizerSignalLevel,
  type VisualizerConfig,
} from "../../lib/audio/visualizer";
import { SETTINGS } from "../../lib/settings/schema";
import { useBoolPref } from "../../lib/usePreference";
import { useVisualizerUi } from "../../lib/useVisualizer";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { usePlayerStore } from "../../store/usePlayerStore";

type VisualizerStatus = "waiting" | "active" | "idle" | "fallback";

export function VisualizerCanvas({ config, surface: override }: { config: VisualizerConfig; surface?: "music" | "video" }) {
  const { t } = useTranslation("settings");
  const canvas = useRef<HTMLCanvasElement>(null);
  const selected = useVisualizerUi((state) => state.surface);
  const surface = override ?? selected;
  const videoNode = useVisualizerUi((state) => state.analyser);
  const consented = useVisualizerUi((state) => state.consented);
  const musicPlaying = useMusicPlayerStore((state) => state.isPlaying);
  const videoPlaying = usePlayerStore((state) => state.isPlaying);
  const isPlaying = surface === "music" ? musicPlaying : videoPlaying;
  const [safeMotion] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED);
  const [reducedFlash] = useBoolPref(SETTINGS.REDUCED_FLASH_ENABLED);
  const safe = safeMotion || !consented;
  const configKey = JSON.stringify(config);
  const effectiveConfig = useMemo(() => {
    const parsed = JSON.parse(configKey) as VisualizerConfig;
    return reducedFlash ? enforceReducedFlash(parsed) : parsed;
  }, [configKey, reducedFlash]);
  const effectiveKey = JSON.stringify(effectiveConfig);
  const [status, setStatus] = useState<VisualizerStatus>("waiting");
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => setWebglFailed(false), [effectiveConfig.family, effectiveConfig.milkdropPreset]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let stopped = false;
    let frameId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let last = -Infinity;
    let phase = 0;
    let samples = 0;
    let average = 0;
    let quietSince: number | null = null;
    let idle = false;
    let onscreen = true;
    let fps: number = effectiveConfig.fps;
    let density = effectiveConfig.density;
    let quality = 1;
    let milkdrop: { render(): void; setRendererSize(w: number, h: number): void; disconnectAudio(node: AudioNode): void } | null = null;
    let rendererCanvas: HTMLCanvasElement | null = null;
    let connected: AudioNode | null = null;
    let input: GainNode | null = null;
    const context = element.getContext("2d");
    const frequency = new Uint8Array(1024);
    const wave = new Uint8Array(2048);
    const peaks = new Float32Array(160);
    const signal = () => surface === "music" ? musicAudioEngine.getAnalyser() : videoNode;
    const colors = resolveVisualizerColors(effectiveConfig);

    const cancelScheduled = () => {
      cancelAnimationFrame(frameId);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };
    const schedule = (callback: FrameRequestCallback) => {
      if (stopped || document.hidden || !onscreen) return;
      if (idle) idleTimer = setTimeout(() => { frameId = requestAnimationFrame(callback); }, VISUALIZER_SILENCE_POLL_MS);
      else frameId = requestAnimationFrame(callback);
    };

    const frame = (time: number) => {
      if (stopped || document.hidden || !onscreen) return;
      if (time - last < 1000 / fps) { schedule(frame); return; }
      const elapsed = Number.isFinite(last) ? time - last : 1000 / fps;
      last = time;
      const begin = performance.now();
      const node = signal();
      const width = Math.max(1, Math.min(1440, Math.floor(element.clientWidth * quality)));
      const height = Math.max(1, Math.min(900, Math.floor(element.clientHeight * quality)));
      if (element.width !== width || element.height !== height) {
        element.width = width; element.height = height;
        milkdrop?.setRendererSize(width, height);
      }

      if (node && isPlaying && !safe) {
        node.smoothingTimeConstant = effectiveConfig.smoothing;
        node.getByteFrequencyData(frequency);
        node.getByteTimeDomainData(wave);
        const level = visualizerSignalLevel(frequency);
        if (level <= VISUALIZER_SILENCE_THRESHOLD) quietSince ??= time;
        else { quietSince = null; idle = false; }
        if (quietSince !== null && time - quietSince >= VISUALIZER_SILENCE_HOLD_MS) idle = true;
      } else {
        frequency.fill(0); wave.fill(128); idle = !safe;
      }

      if (idle && isPlaying && node && !safe) {
        setStatus((value) => value === "idle" ? value : "idle");
        element.dataset.effectiveFps = "0";
        element.dataset.idle = "true";
        schedule(frame);
        return;
      }

      const fallbackConfig = effectiveConfig.family === "feedback" && !milkdrop
        ? { ...effectiveConfig, family: "radial" as const }
        : effectiveConfig;
      if (milkdrop && rendererCanvas && context && !safe) {
        if (input) input.gain.setTargetAtTime(effectiveConfig.sensitivity * (1 + effectiveConfig.beat * frequency[0]! / 255), input.context.currentTime, 0.03);
        milkdrop.render();
        drawMirroredImage(context, rendererCanvas, width, height, effectiveConfig, phase, reducedFlash);
      } else if (context) {
        drawVisualizer(context, width, height, frequency, wave, { ...fallbackConfig, density, falloff: Math.pow(fallbackConfig.falloff, elapsed / (1000 / 30)) }, peaks, phase, reducedFlash);
      }
      phase += elapsed / 1000;
      if (node && isPlaying && !safe) setStatus((value) => value === "active" ? value : "active");
      else if (!safe) setStatus((value) => value === "idle" ? value : "idle");
      average = average * 0.9 + Math.max(performance.now() - begin, elapsed > 2000 / fps ? Math.min(100, elapsed - 1000 / fps) : 0) * 0.1;
      if (++samples % 60 === 0) {
        if (milkdrop && fps === 15 && quality <= 0.5 && average > 1000 / 15 * 0.65) setWebglFailed(true);
        const reduced = degradeVisualizer(fps, density, average);
        if (reduced.fps < fps) quality = Math.max(0.5, quality * 0.8);
        fps = reduced.fps; density = reduced.density;
      }
      element.dataset.effectiveFps = String(safe || !isPlaying || idle || !node ? 0 : fps);
      element.dataset.effectiveDensity = String(density);
      element.dataset.idle = String(idle || !isPlaying);
      if (safe || !isPlaying) { setStatus(safe ? "fallback" : "idle"); return; }
      schedule(frame);
    };

    const initialize = async () => {
      if (effectiveConfig.family === "feedback" && !webglFailed && !safe && signal()) {
        try {
          const [{ default: butterchurn }, { default: presets }] = await Promise.all([import("butterchurn"), import("butterchurn-presets")]);
          if (stopped) return;
          const node = signal()!;
          const all = presets.getPresets();
          const name = effectiveConfig.milkdropPreset && all[effectiveConfig.milkdropPreset]
            ? effectiveConfig.milkdropPreset
            : Object.keys(all).sort()[0]!;
          rendererCanvas = document.createElement("canvas");
          const visual = resolveMilkdropRenderer(butterchurn).createVisualizer(node.context as AudioContext, rendererCanvas, {
            width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), pixelRatio: 1,
            textureRatio: 0.5, meshWidth: Math.max(16, Math.floor(effectiveConfig.density / 2)), meshHeight: Math.max(12, Math.floor(effectiveConfig.density / 3)),
          });
          input = (node.context as AudioContext).createGain(); input.gain.value = effectiveConfig.sensitivity;
          node.connect(input); visual.connectAudio(input);
          visual.loadPreset(customizeMilkdropPreset(all[name], effectiveConfig, colors.foreground), 0);
          milkdrop = visual; connected = input;
        } catch { setStatus("fallback"); setWebglFailed(true); return; }
      }
      schedule(frame);
    };

    const visibility = () => {
      cancelScheduled();
      if (document.hidden) { setStatus("idle"); element.dataset.idle = "true"; }
      else schedule(frame);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      onscreen = entries[0]?.isIntersecting ?? true;
      cancelScheduled();
      if (onscreen) schedule(frame);
      else { setStatus("idle"); element.dataset.idle = "true"; }
    });
    observer?.observe(element);
    document.addEventListener("visibilitychange", visibility);
    void initialize();
    return () => {
      stopped = true; cancelScheduled(); observer?.disconnect(); document.removeEventListener("visibilitychange", visibility);
      if (connected) {
        try { milkdrop?.disconnectAudio(connected); input?.disconnect(); if (input) signal()?.disconnect(input); }
        catch { /* Renderer may already have released the input. */ }
      }
    };
  }, [effectiveKey, isPlaying, reducedFlash, safe, surface, videoNode, webglFailed]);

  return <figure className="relative h-full w-full overflow-hidden rounded-2xl bg-[var(--dd-near-black)]">
    <canvas key={`${effectiveConfig.family}:${safe}:${webglFailed}`} ref={canvas} aria-hidden="true" className="h-full w-full" />
    <figcaption className="absolute bottom-1 left-2 text-xs text-[var(--dd-light-text)]">
      {t(!consented ? "visualizer.review" : safe ? "visualizer.safeFrame" : status === "waiting" ? "visualizer.waiting" : status === "idle" ? "visualizer.idle" : status === "fallback" ? "visualizer.fallback" : "visualizer.active")}
    </figcaption>
  </figure>;
}
