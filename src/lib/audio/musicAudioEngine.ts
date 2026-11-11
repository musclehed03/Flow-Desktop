import { loudnessFactor, MUSIC_MAX_CUT_DB } from "../loudness";
import { IS_LINUX_RUNTIME, IS_MACOS_RUNTIME } from "../platform";
import { createAudioContext, keepRunning, resumeWithin, suspendAfterIdle, webAudioSupported } from "./audioContext";
import { fadeInGain, fadeOutGain, resetFade, scheduleFade, steppedFade } from "./crossfadeRamp";
import { EQ_GRAPH_OFF, type EqGraphSpec } from "./eq/graphPlan";
import { EqChain, RAMP_TIME_CONSTANT } from "./eqChain";
import { defaultAudioProcessingConfig, normalizeAudioProcessingConfig, type AudioProcessingConfig } from "./eqConfig";
import { pastListedEnd, playableLength } from "./listedLength";
import { volumeGain } from "./volumeCurve";
import { webAudioHears } from "./webAudioFormats";

/**
 * One of the two <audio> elements. While one plays, the other can hold the next
 * track already buffered, so the change at a track boundary is a swap rather
 * than a fresh load.
 */
interface Slot {
  el: HTMLAudioElement | null;
  source: MediaElementAudioSourceNode | null;
  normGain: GainNode | null;
  /** The crossfade's share of this element, on the audio clock. */
  fadeGain: GainNode | null;
  /** The same share when WebAudio is not in use, applied to the element's volume. */
  fade: number;
  loudnessDb: number | null;
  /** The loaded file's MIME type, which decides whether WebAudio can hear it. */
  mime: string | null;
  /** The song's listed length in seconds, for when the element reports a wrong one. */
  listed: number | null;
  /** Set once the end at the listed length has been handed to the player. */
  listedEndTaken: boolean;
  /** The track a standby slot holds, so a swap only ever plays the right one. */
  key: string | null;
  /** The loaded file's format, for the honest source badge. */
  format: { mimeType: string; bitrate: number | null; sampleRate: number | null } | null;
}

const emptySlot = (): Slot => ({
  el: null,
  source: null,
  normGain: null,
  fadeGain: null,
  fade: 1,
  loudnessDb: null,
  mime: null,
  listed: null,
  listedEndTaken: false,
  key: null,
  format: null,
});

function unload(el: HTMLAudioElement): void {
  el.pause();
  el.removeAttribute("src");
  try {
    el.load();
  } catch {
  }
}

interface Fade {
  previous: Slot;
  done: ReturnType<typeof setTimeout>;
  cancelSteps: (() => void) | null;
}

export class MusicAudioEngine {
  private slots: [Slot, Slot] = [emptySlot(), emptySlot()];
  private activeIndex: 0 | 1 = 0;
  private ctx: AudioContext | null = null;
  private chain: EqChain | null = null;
  private volGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  /** Deviants dynamics stage (preamp / balance / compressor / limiter), after the EQ chain. */
  private preampGain: GainNode | null = null;
  private balanceNode: StereoPannerNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private processing: AudioProcessingConfig = defaultAudioProcessingConfig();
  private volumeBoostEnabled = false;
  private skipSilenceEnabled = false;
  private silentSince = 0;

  private graphReady = false;
  private webAudioFailed = false;
  private availabilityListeners = new Set<(available: boolean) => void>();
  /** Elements already wired with play/pause listeners for the idle suspend. */
  private watchedElements = new WeakSet<HTMLAudioElement>();
  /** Cancels the pending idle suspend when playback resumes. */
  private cancelIdleSuspend: (() => void) | null = null;

  private volume = 1;
  private muted = false;
  /** The sleep timer's fade-out, from 1 (none) down to 0. */
  private fadeLevel = 1;
  private normalizationEnabled = true;
  private eqSpec: EqGraphSpec = EQ_GRAPH_OFF;
  private eqEngaged = false;
  private speed = 1;
  private crossfadeEnabled = false;
  private armedFadeSeconds: number | null = null;
  private fading: Fade | null = null;

  private get active(): Slot {
    return this.slots[this.activeIndex];
  }

  private get standby(): Slot {
    return this.slots[this.activeIndex === 0 ? 1 : 0];
  }

  // --- lifecycle ----------------------------------------------------------

  /** Bind the two hidden <audio> elements. Safe to call again on HMR. */
  attach(elements: [HTMLAudioElement, HTMLAudioElement]): void {
    if (this.slots[0].el === elements[0] && this.slots[1].el === elements[1]) return;
    // A re-bind abandons the previous elements: their sources and the old
    // EQ/dynamics chain are disconnected here instead of staying wired into
    // the live context forever (fixes batch #4).
    this.teardownGraph();
    this.slots = [emptySlot(), emptySlot()];
    this.activeIndex = 0;
    this.fading = null;
    for (const [i, el] of elements.entries()) {
      // Required for WebAudio to receive (non-silent) cross-origin samples.
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.preservesPitch = true;
      this.slots[i as 0 | 1].el = el;
      if (!this.watchedElements.has(el)) {
        this.watchedElements.add(el);
        el.addEventListener("play", this.onElementPlay);
        el.addEventListener("pause", this.onElementIdle);
        el.addEventListener("ended", this.onElementIdle);
      }
    }
    this.graphReady = false;
    this.applySpeed();
    this.engageWhilePlaying();
    this.applyGain();
  }

  /**
   * Disconnects every node the graph built, so a re-bind or a dispose leaves nothing wired
   * into the context. The context itself survives a re-bind; `dispose` closes it.
   */
  private teardownGraph(): void {
    for (const slot of this.slots) {
      slot.source?.disconnect();
      slot.source = null;
      slot.fadeGain?.disconnect();
      slot.fadeGain = null;
      slot.normGain = null;
    }
    this.chain?.output.disconnect();
    this.chain = null;
    this.preampGain?.disconnect();
    this.preampGain = null;
    this.balanceNode?.disconnect();
    this.balanceNode = null;
    this.compressor?.disconnect();
    this.compressor = null;
    this.limiter?.disconnect();
    this.limiter = null;
    this.volGain?.disconnect();
    this.volGain = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.graphReady = false;
  }

  /** Closes the audio context and drops the graph; the next play rebuilds it lazily. */
  async dispose(): Promise<void> {
    this.teardownGraph();
    if (this.cancelIdleSuspend) { this.cancelIdleSuspend(); this.cancelIdleSuspend = null; }
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // Already closed.
      }
    }
  }

  /** Playback resumed: cancel any pending idle suspend and wake the context. */
  private onElementPlay = (): void => {
    if (this.cancelIdleSuspend) { this.cancelIdleSuspend(); this.cancelIdleSuspend = null; }
    if (this.ctx && this.graphReady) void resumeWithin(this.ctx);
  };

  /** Nothing playing: suspend the context shortly, so its PipeWire stream goes idle. */
  private onElementIdle = (): void => {
    if (this.cancelIdleSuspend || !this.ctx || !this.graphReady) return;
    this.cancelIdleSuspend = suspendAfterIdle(
      this.ctx,
      () => this.slots.some((slot) => slot.el && !slot.el.paused) || this.fading !== null,
    );
  };

  /** The element currently playing — the one whose events the player follows. */
  getActiveElement(): HTMLAudioElement | null {
    return this.active.el;
  }

  /**
   * Routes both elements through WebAudio. Done only once the equalizer changes the sound or
   * crossfade is on: a media element taken over by WebAudio can never play on its own again, and
   * loudness normalization only ever turns down, which the element's own volume does.
   */
  private ensureGraph(): void {
    if (this.graphReady || this.webAudioFailed || !this.slots[0].el || !this.slots[1].el) return;
    try {
      if (!this.ctx) {
        const ctx = createAudioContext();
        if (!ctx) throw new Error("No AudioContext");
        this.ctx = ctx;
        keepRunning(ctx, () => !!this.active.el && !this.active.el.paused);
      }
      const ctx = this.ctx;

      this.chain = new EqChain(ctx);
      this.volGain = ctx.createGain();
      // Deviants dynamics stage sits between the EQ chain and the volume gain:
      // preamp -> balance -> compressor -> limiter. Neutral while disabled.
      this.preampGain = ctx.createGain();
      this.compressor = ctx.createDynamicsCompressor();
      this.limiter = ctx.createDynamicsCompressor();
      this.balanceNode = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      this.compressor.connect(this.limiter);
      this.limiter.connect(this.volGain);
      const dynamicsStart: AudioNode = this.balanceNode ?? this.compressor;
      if (this.balanceNode) this.balanceNode.connect(this.compressor);
      this.preampGain.connect(dynamicsStart);
      this.chain.output.connect(this.preampGain);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.volGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      // Each element keeps its own loudness and crossfade gains, since the two
      // hold different tracks; both feed the one shared EQ and volume chain.
      for (const slot of this.slots) {
        if (!slot.el) continue;
        slot.source = ctx.createMediaElementSource(slot.el);
        slot.normGain = ctx.createGain();
        slot.fadeGain = ctx.createGain();
        slot.fadeGain.gain.value = slot.fade;
        slot.source.connect(slot.normGain);
        slot.normGain.connect(slot.fadeGain);
        slot.fadeGain.connect(this.chain.input);
      }

      this.graphReady = true;
      this.applyGain();
      this.chain.apply(this.eqSpec);
      this.applyProcessing();
      // Turned on mid-song: the context has to run for the element to be heard.
      if (this.active.el && !this.active.el.paused) void resumeWithin(ctx);
    } catch (err) {
      console.warn("[musicAudioEngine] WebAudio graph unavailable, playing without the equalizer", err);
      this.webAudioFailed = true;
      this.notifyAvailability();
      this.applyGain();
    }
  }

  // --- transport ----------------------------------------------------------

  async load(url: string, mime: string | null, listedSeconds: number | null = null): Promise<void> {
    const el = this.active.el;
    if (!el) return;
    this.active.key = null;
    this.active.mime = mime;
    this.active.listed = listedSeconds;
    this.active.listedEndTaken = false;
    this.applyGain();
    el.src = url;
    try {
      el.load();
    } catch {
    }
  }

  /**
   * Start buffering `url` on the standby element for the track `key`, so it can
   * take over the moment the current track ends. A no-op when it already holds
   * that track, or while it is still fading out the last one.
   */
  preload(
    key: string,
    url: string,
    loudnessDb: number | null,
    mime: string | null,
    listedSeconds: number | null = null,
    format: Slot["format"] = null,
  ): void {
    const slot = this.standby;
    if (!slot.el || slot.key === key || this.fading) return;
    slot.key = key;
    slot.loudnessDb = loudnessDb;
    slot.mime = mime;
    slot.listed = listedSeconds;
    slot.listedEndTaken = false;
    slot.format = format;
    slot.el.src = url;
    try {
      slot.el.load();
    } catch {
    }
    this.applyGain();
  }

  /** Whether the standby element holds `key` (buffered or still buffering). */
  hasPreloaded(key: string): boolean {
    return this.standby.key === key && !!this.standby.el?.getAttribute("src");
  }

  /**
   * Whether the standby element holds `key` with audio it can play right now.
   * One whose fetch failed or never delivered anything would stall forever if
   * swapped in, so it is skipped and the track loads the normal way.
   */
  canPlayPreloaded(key: string): boolean {
    const el = this.standby.el;
    return (
      this.hasPreloaded(key) &&
      !!el &&
      !el.error &&
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  }

  /** Makes the next `activatePreloaded` a crossfade of `seconds` instead of a cut. */
  armCrossfade(seconds: number): void {
    this.armedFadeSeconds = seconds > 0 ? seconds : null;
  }

  /**
   * Make the standby element the active one when it holds `key`. The caller
   * then plays it; the element that was playing is emptied, at once or at the
   * end of an armed crossfade.
   */
  activatePreloaded(key: string): boolean {
    const fadeSeconds = this.armedFadeSeconds;
    this.armedFadeSeconds = null;
    if (!this.canPlayPreloaded(key)) return false;
    this.finishFade();
    const previous = this.active;
    this.activeIndex = this.activeIndex === 0 ? 1 : 0;
    this.active.key = null;
    if (fadeSeconds !== null && previous.el && !previous.el.paused) {
      this.startFade(previous, fadeSeconds);
    } else {
      this.release(previous);
    }
    this.applyGain();
    return true;
  }

  private release(slot: Slot): void {
    if (slot.el) unload(slot.el);
    slot.key = null;
    slot.loudnessDb = null;
    slot.mime = null;
    slot.listed = null;
    slot.listedEndTaken = false;
    slot.format = null;
  }

  // The two elements play together while their gains move in opposite directions; the one
  // fading out is emptied when the fade ends.
  private startFade(previous: Slot, seconds: number): void {
    const next = this.active;
    let cancelSteps: (() => void) | null = null;
    if (this.ctx && this.routes(previous) && this.routes(next) && previous.fadeGain && next.fadeGain) {
      const t = this.ctx.currentTime;
      scheduleFade(previous.fadeGain.gain, "out", t, seconds);
      scheduleFade(next.fadeGain.gain, "in", t, seconds);
    } else {
      cancelSteps = steppedFade(seconds, (progress) => {
        previous.fade = fadeOutGain(progress);
        next.fade = fadeInGain(progress);
        this.applyGain();
      });
    }
    const done = setTimeout(() => this.finishFade(), seconds * 1_000 + 50);
    this.fading = { previous, done, cancelSteps };
  }

  /** Ends a crossfade now: the outgoing element is emptied and both gains return to full. */
  private finishFade(): void {
    const fading = this.fading;
    if (!fading) return;
    this.fading = null;
    clearTimeout(fading.done);
    fading.cancelSteps?.();
    this.release(fading.previous);
    for (const slot of this.slots) {
      slot.fade = 1;
      if (this.ctx && slot.fadeGain) resetFade(slot.fadeGain.gain, this.ctx.currentTime);
    }
    this.applyGain();
    // A speed change made during the fade was held back on Linux; apply it now.
    this.applySpeed();
  }

  /** Drop whatever the standby element holds, returning the track it was. */
  clearPreload(): string | null {
    this.finishFade();
    const slot = this.standby;
    const key = slot.key;
    if (key === null) return null;
    this.release(slot);
    return key;
  }

  /** Loudness of the track now playing, as recorded when it was loaded. */
  getActiveLoudness(): number | null {
    return this.active.loudnessDb;
  }

  /** The playing track's format, for the honest source badge. */
  getActiveFormat(): Slot["format"] {
    return this.active.format ? { ...this.active.format } : null;
  }

  /** The shared analyser the visualizer reads; null while the graph is not built. */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  // --- Deviants audio processing (dynamics + per-device profiles) -----------

  setProcessingConfig(config: AudioProcessingConfig): void {
    this.processing = normalizeAudioProcessingConfig(config);
    this.engageWhilePlaying();
    this.applyProcessing();
  }

  getProcessingConfig(): AudioProcessingConfig {
    return structuredClone(this.processing);
  }

  setVolumeBoostEnabled(enabled: boolean): void {
    this.volumeBoostEnabled = enabled;
    this.applyGain();
  }

  setSkipSilenceEnabled(enabled: boolean): void {
    this.skipSilenceEnabled = enabled;
    this.silentSince = 0;
  }

  setSourceSampleRate(_sampleRate: number | null): void {
    // Upstream's createAudioContext() takes no options, so the source rate
    // cannot size the context; kept as a no-op so callers need no branch.
  }

  /**
   * Skips a long silence (intro/outro dead air) once it has lasted 1.4 s.
   * Called from the player's time-update path while skip-silence is on.
   */
  tickSilenceSkip(now = performance.now()): boolean {
    if (!this.skipSilenceEnabled || !this.analyser || !this.active.el || this.active.el.paused) {
      this.silentSince = 0;
      return false;
    }
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (rms >= 0.003) {
      this.silentSince = 0;
      return false;
    }
    if (!this.silentSince) this.silentSince = now;
    if (now - this.silentSince < 1400) return false;
    const duration = this.getDuration();
    this.seek(Math.min(Math.max(0, duration - 0.25), this.getCurrentTime() + 3));
    this.silentSince = now;
    return true;
  }

  /** Applies the dynamics half of the processing config (the EQ half lives in EqChain). */
  private applyProcessing(): void {
    if (!this.graphReady || !this.ctx) return;
    const t = this.ctx.currentTime;
    const config = this.processing;
    this.preampGain?.gain.setTargetAtTime(Math.pow(10, config.dynamics.preampDb / 20), t, 0.012);
    this.balanceNode?.pan.setTargetAtTime(config.dynamics.balance, t, 0.012);
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(config.dynamics.compressorEnabled ? config.dynamics.compressorThreshold : 0, t, 0.012);
      this.compressor.ratio.setTargetAtTime(config.dynamics.compressorEnabled ? config.dynamics.compressorRatio : 1, t, 0.012);
      this.compressor.knee.setTargetAtTime(config.dynamics.compressorEnabled ? 12 : 0, t, 0.012);
      this.compressor.attack.setTargetAtTime(config.dynamics.compressorAttack, t, 0.012);
      this.compressor.release.setTargetAtTime(config.dynamics.compressorRelease, t, 0.012);
    }
    if (this.limiter) {
      this.limiter.threshold.setTargetAtTime(config.dynamics.limiterEnabled ? -0.8 : 0, t, 0.012);
      this.limiter.ratio.setTargetAtTime(config.dynamics.limiterEnabled ? 20 : 1, t, 0.012);
      this.limiter.knee.setTargetAtTime(0, t, 0.012);
      this.limiter.attack.setTargetAtTime(0.002, t, 0.012);
      this.limiter.release.setTargetAtTime(0.08, t, 0.012);
    }
  }

  /**
   * Seek once the element knows its duration. Setting `currentTime` on an
   * element still fetching metadata is ignored by WebKit.
   */
  seekWhenReady(seconds: number): void {
    const el = this.active.el;
    if (!el || !Number.isFinite(seconds) || seconds <= 0) return;
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      el.currentTime = seconds;
      return;
    }
    el.addEventListener("loadedmetadata", () => {
      if (this.active.el === el) el.currentTime = seconds;
    }, { once: true });
  }

  async play(): Promise<void> {
    const el = this.active.el;
    if (!el) return;
    if (this.needsGraph()) this.ensureGraph();
    if (this.ctx) await resumeWithin(this.ctx);
    try {
      await el.play();
    } catch (err) {
      console.warn("[musicAudioEngine] play() rejected", err);
    }
  }

  /** The audio context's state, for start-up diagnostics. */
  getContextState(): AudioContextState | "none" {
    return this.ctx?.state ?? "none";
  }

  pause(): void {
    this.finishFade();
    this.active.el?.pause();
  }

  stop(): void {
    this.finishFade();
    for (const slot of this.slots) this.release(slot);
  }

  seek(seconds: number): void {
    const el = this.active.el;
    if (el && Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
      this.active.listedEndTaken = false;
    }
  }

  getCurrentTime(): number {
    return this.active.el?.currentTime ?? 0;
  }

  /** Seconds buffered ahead on the playing element, for stall detection. */
  getBufferedEnd(): number {
    const el = this.active.el;
    if (!el || el.buffered.length === 0) return 0;
    return el.buffered.end(el.buffered.length - 1);
  }

  /** The playing element's `MediaError` code, or null while it has none. */
  getErrorCode(): number | null {
    return this.active.el?.error?.code ?? null;
  }

  getDuration(): number {
    return playableLength(this.active.el?.duration ?? Number.NaN, this.active.listed);
  }

  /**
   * True once, when the playing song passes its listed length on an element that reports more
   * than it holds. The element would play silence until its own end and fire `ended` only then,
   * so it is paused here and the caller ends the song instead.
   */
  takeListedEnd(): boolean {
    const slot = this.active;
    const el = slot.el;
    if (!el || slot.listedEndTaken || !pastListedEnd(el.currentTime, el.duration, slot.listed)) return false;
    slot.listedEndTaken = true;
    el.pause();
    return true;
  }

  // --- speed --------------------------------------------------------------

  setSpeed(rate: number): void {
    this.speed = Math.max(0.5, Math.min(2, rate));
    this.applySpeed();
  }

  /**
   * WebKitGTK flushes its GStreamer pipeline on every `playbackRate` write, so the rate is only
   * written when it differs, and on Linux not while two elements are crossfading. The default
   * rate carries it across loads, which reset `playbackRate` to it.
   */
  private applySpeed(): void {
    if (IS_LINUX_RUNTIME && this.fading) return;
    for (const slot of this.slots) {
      const el = slot.el;
      if (!el) continue;
      if (el.defaultPlaybackRate !== this.speed) el.defaultPlaybackRate = this.speed;
      if (el.playbackRate !== this.speed) el.playbackRate = this.speed;
    }
  }

  // --- gain (volume + loudness normalization) -----------------------------

  /** `volume` is the slider position; it plays on a perceptual curve. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  /** Loudness of the track now playing, and whether to normalize to it. */
  setLoudness(loudnessDb: number | null, enabled: boolean): void {
    this.active.loudnessDb = loudnessDb;
    this.normalizationEnabled = enabled;
    this.applyGain();
  }

  private normalizationFactor(loudnessDb: number | null): number {
    return loudnessFactor(loudnessDb, this.normalizationEnabled, MUSIC_MAX_CUT_DB);
  }

  /**
   * Fades the music to silence by the time `remainingSeconds` have passed,
   * from `level` now. With WebAudio the ramp runs on the audio clock, so it
   * keeps going while timers are throttled in a hidden window; without it the
   * element's volume steps down each time this is called again.
   */
  fadeOut(level: number, remainingSeconds: number): void {
    this.fadeLevel = Math.max(0, Math.min(1, level));
    if (this.graphReady && this.ctx && this.volGain) {
      const gain = this.volGain.gain;
      const t = this.ctx.currentTime;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime((this.muted ? 0 : volumeGain(this.volume)) * this.fadeLevel, t);
      gain.linearRampToValueAtTime(0, t + Math.max(0, remainingSeconds));
      return;
    }
    this.applyGain();
  }

  /** Back to full volume after a fade-out stopped or was cancelled. */
  resetFade(): void {
    if (this.fadeLevel === 1) return;
    this.fadeLevel = 1;
    if (this.graphReady && this.ctx && this.volGain) this.volGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.applyGain();
  }

  private applyGain(): void {
    const vol = (this.muted ? 0 : volumeGain(this.volume) * (this.volumeBoostEnabled ? 1.35 : 1)) * this.fadeLevel;

    const t = this.ctx?.currentTime ?? 0;
    if (this.graphReady && this.volGain) this.volGain.gain.setTargetAtTime(vol, t, RAMP_TIME_CONSTANT);
    // A scheduled crossfade owns the fade gains until it ends; a stepped one moves `slot.fade`.
    const scheduledFade = !!this.fading && !this.fading.cancelSteps;
    for (const slot of this.slots) {
      if (!slot.el) continue;
      const norm = this.normalizationFactor(slot.loudnessDb);
      if (this.routes(slot)) {
        slot.normGain?.gain.setTargetAtTime(norm, t, RAMP_TIME_CONSTANT);
        if (!scheduledFade) slot.fadeGain?.gain.setTargetAtTime(slot.fade, t, RAMP_TIME_CONSTANT);
        slot.el.volume = 1;
        slot.el.muted = false;
      } else {
        slot.el.volume = Math.max(0, Math.min(1, vol * norm * slot.fade));
        slot.el.muted = this.muted;
      }
    }
  }

  /** Whether `slot` plays through the graph, rather than past it on its own volume. */
  private routes(slot: Slot): boolean {
    return this.graphReady && !!slot.source && webAudioHears(slot.mime);
  }

  // --- crossfade ----------------------------------------------------------

  /** Crossfades are timed on the audio clock, so turning them on brings WebAudio in. */
  setCrossfadeEnabled(enabled: boolean): void {
    this.crossfadeEnabled = enabled;
    this.engageWhilePlaying();
  }

  // --- equalizer ----------------------------------------------------------

  /**
   * The curve to run, and whether it changes the sound. The graph is built the first time it
   * does; after that every change, including switching off, only glides the filters.
   */
  setEq(spec: EqGraphSpec, engaged: boolean): void {
    this.eqSpec = spec;
    this.eqEngaged = engaged;
    this.engageWhilePlaying();
    this.chain?.apply(spec);
  }

  private needsGraph(): boolean {
    return this.eqEngaged || this.crossfadeEnabled || this.processing.enabled;
  }

  /**
   * Builds the graph now when music is playing (a change the user just made), otherwise on the
   * next play: a context made at startup, outside any click, may never be allowed to run.
   */
  private engageWhilePlaying(): void {
    if (this.needsGraph() && this.active.el && !this.active.el.paused) this.ensureGraph();
  }

  /**
   * Whether streams should come as AAC: on macOS only MP4 audio reaches the graph, and a song
   * already playing when the equalizer or crossfade comes on must be heard through it.
   */
  wantsAac(): boolean {
    return IS_MACOS_RUNTIME;
  }

  /** False once WebAudio failed here, so the equalizer cannot be heard. */
  isEqAvailable(): boolean {
    return !this.webAudioFailed && webAudioSupported();
  }

  onEqAvailabilityChange(listener: (available: boolean) => void): () => void {
    this.availabilityListeners.add(listener);
    return () => this.availabilityListeners.delete(listener);
  }

  private notifyAvailability(): void {
    for (const listener of this.availabilityListeners) listener(this.isEqAvailable());
  }
}

// Module singleton — survives route changes (lives outside the React tree).
export const musicAudioEngine = new MusicAudioEngine();
