import { equalPowerCurves, type CrossfadePlan } from "./crossfade";
import {
  EQ_BANDS,
  EQ_PEAKING_Q,
  normalizeEqGains,
} from "./eqBands";
import { defaultAudioProcessingConfig, graphicFrequencies, normalizeAudioProcessingConfig, type AudioProcessingConfig } from "./eqConfig";

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

/**
 * One of the two <audio> elements. While one plays, the other can hold the next
 * track already buffered, so the change at a track boundary is a swap rather
 * than a fresh load.
 */
interface Slot {
  el: HTMLAudioElement | null;
  source: MediaElementAudioSourceNode | null;
  normGain: GainNode | null;
  fadeGain: GainNode | null;
  loudnessDb: number | null;
  /** The track a standby slot holds, so a swap only ever plays the right one. */
  key: string | null;
  format: { mimeType: string; bitrate: number | null; sampleRate: number | null } | null;
}

const emptySlot = (): Slot => ({ el: null, source: null, normGain: null, fadeGain: null, loudnessDb: null, key: null, format: null });

function unload(el: HTMLAudioElement): void {
  el.pause();
  el.removeAttribute("src");
  try {
    el.load();
  } catch {
  }
}

export class MusicAudioEngine {
  private slots: [Slot, Slot] = [emptySlot(), emptySlot()];
  private activeIndex: 0 | 1 = 0;
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private preampGain: GainNode | null = null;
  private balanceNode: StereoPannerNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeWait: (() => void) | null = null;
  private overlapLimiter: DynamicsCompressorNode | null = null;
  private fadeGeneration = 0;
  private fading = false;
  isCrossfading(): boolean { return this.fading; }
  getAnalyser(): AnalyserNode | null { return this.analyser; }
  cancelCrossfade(): void {
    this.fadeGeneration++;
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.fadeWait?.(); this.fadeWait = null;
    if (!this.fading) return;
    this.fading = false;
    this.setOverlapLimiter(false);
    const time = this.ctx?.currentTime ?? 0;
    for (const slot of this.slots) {
      slot.fadeGain?.gain.cancelScheduledValues(time);
      slot.fadeGain?.gain.setTargetAtTime(slot === this.active ? 1 : 0, time, .012);
    }
    if (this.standby.el) unload(this.standby.el);
    this.standby.key = null;
    this.applyGain();
  }

  async crossfadeToPreloaded(key: string, planInput: CrossfadePlan | (() => CrossfadePlan), complete: () => void): Promise<boolean> {
    const ticket = this.fadeGeneration;
    const slot = this.standby;
    if (!this.hasPreloaded(key) || !slot.el) return false;
    if (!this.preloadIsPlayable(key)) {
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); slot.el?.removeEventListener('loadeddata', finish); slot.el?.removeEventListener('error', finish); resolve(); };
        const timer = setTimeout(finish, 5000);
        slot.el!.addEventListener('loadeddata', finish, { once: true });
        slot.el!.addEventListener('error', finish, { once: true });
      });
    }
    if (ticket !== this.fadeGeneration || !this.preloadIsPlayable(key) || this.active.el?.ended || this.active.el?.paused) return false;
    this.ensureGraph();
    if (!this.ctx || !this.graphReady || !slot.fadeGain || !this.active.fadeGain) return false;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (ticket !== this.fadeGeneration) return false;
    const plan = typeof planInput === "function" ? planInput() : planInput;
    this.fading = true;
    if (plan.delay > 0) {
      await new Promise<void>((resolve) => { this.fadeWait = resolve; this.fadeTimer = setTimeout(resolve, plan.delay * 1000); });
      this.fadeWait = null; this.fadeTimer = null;
      if (ticket !== this.fadeGeneration) return false;
    }
    const previous = this.active;
    const [outgoing, incoming] = equalPowerCurves();
    const start = this.ctx.currentTime;
    previous.fadeGain!.gain.cancelScheduledValues(this.ctx.currentTime);
    previous.fadeGain!.gain.setValueAtTime(1, this.ctx.currentTime);
    previous.fadeGain!.gain.setValueCurveAtTime(outgoing, start, plan.seconds);
    slot.fadeGain.gain.cancelScheduledValues(this.ctx.currentTime);
    slot.fadeGain.gain.setValueAtTime(0, this.ctx.currentTime);
    slot.fadeGain.gain.setValueCurveAtTime(incoming, start, plan.seconds);
    if (plan.incomingStart > 0) slot.el.currentTime = plan.incomingStart;
    this.fading = true;
    this.setOverlapLimiter(true);
    this.applyGain();
    try { await slot.el.play(); }
    catch { this.cancelCrossfade(); return false; }
    if (ticket !== this.fadeGeneration) return false;
    this.activeIndex = this.activeIndex === 0 ? 1 : 0;
    this.active.key = null;
    this.fadeTimer = setTimeout(() => {
      if (ticket !== this.fadeGeneration) return;
      this.fading = false; this.fadeTimer = null;
      this.setOverlapLimiter(false);
      if (previous.el) unload(previous.el);
      previous.key = null; previous.loudnessDb = null; previous.format = null;
      this.active.fadeGain?.gain.setValueAtTime(1, this.ctx!.currentTime);
      this.applyGain(); complete();
    }, plan.seconds * 1000);
    return true;
  }

  private setOverlapLimiter(enabled: boolean): void {
    if (!this.volGain || !this.analyser || !this.ctx) return;
    if (enabled && !this.overlapLimiter) {
      this.overlapLimiter = this.ctx.createDynamicsCompressor();
      this.overlapLimiter.threshold.value = -1;
      this.overlapLimiter.knee.value = 0;
      this.overlapLimiter.ratio.value = 20;
      this.overlapLimiter.attack.value = .003;
      this.overlapLimiter.release.value = .12;
    }
    this.volGain.disconnect(); this.overlapLimiter?.disconnect();
    if (enabled && this.overlapLimiter) { this.volGain.connect(this.overlapLimiter); this.overlapLimiter.connect(this.analyser); }
    else this.volGain.connect(this.analyser);
  }

  private graphReady = false;
  private webAudioFailed = false;

  private volume = 1;
  private muted = false;
  private eqGains: number[] = normalizeEqGains(null);
  private normalizationEnabled = true;
  private processing = defaultAudioProcessingConfig();
  private volumeBoostEnabled = false;
  private skipSilenceEnabled = false;
  private silentSince = 0;
  private sourceSampleRate: number | null = null;

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
    this.cancelCrossfade();
    this.slots = [emptySlot(), emptySlot()];
    this.activeIndex = 0;
    for (const [i, el] of elements.entries()) {
      // Required for WebAudio to receive (non-silent) cross-origin samples.
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      this.slots[i as 0 | 1].el = el;
    }
    // Rebuild the graph lazily on the next play()
    this.graphReady = false;
    this.applyGain();
  }

  /** The element currently playing — the one whose events the player follows. */
  getActiveElement(): HTMLAudioElement | null {
    return this.active.el;
  }

  private ensureGraph(): void {
    if (this.graphReady || this.webAudioFailed || !this.active.el) return;
    try {
      const Ctor = getAudioContextCtor();
      if (!Ctor) {
        this.webAudioFailed = true;
        return;
      }
      if (!this.ctx) this.ctx = this.sourceSampleRate ? new Ctor({ sampleRate: this.sourceSampleRate }) : new Ctor();
      const ctx = this.ctx;

      this.filters = Array.from({ length: 31 }, (_, index) => {
        const f = ctx.createBiquadFilter();
        const band = EQ_BANDS[index] ?? EQ_BANDS[EQ_BANDS.length - 1]!;
        f.type = index < EQ_BANDS.length ? band.type : "allpass";
        f.frequency.value = band.frequency;
        f.Q.value = EQ_PEAKING_Q;
        f.gain.value = 0;
        return f;
      });
      this.preampGain = ctx.createGain();
      this.volGain = ctx.createGain();
      this.compressor = ctx.createDynamicsCompressor();
      this.limiter = ctx.createDynamicsCompressor();
      this.balanceNode = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      this.compressor.connect(this.limiter);
      this.limiter.connect(this.volGain);
      const dynamicsStart: AudioNode = this.balanceNode ?? this.compressor;
      if (this.balanceNode) this.balanceNode.connect(this.compressor);
      const chainStart = this.filters.reduceRight<AudioNode>((next, filter) => {
        filter.connect(next);
        return filter;
      }, dynamicsStart);
      this.preampGain.connect(chainStart);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.volGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      // Each element keeps its own loudness gain, since the two hold different
      // tracks; both feed the one shared EQ and volume chain.
      for (const slot of this.slots) {
        if (!slot.el) continue;
        slot.source = ctx.createMediaElementSource(slot.el);
        slot.normGain = ctx.createGain();
        slot.source.connect(slot.normGain);
        slot.fadeGain = ctx.createGain();
        slot.normGain.connect(slot.fadeGain);
        slot.fadeGain.connect(this.preampGain);
      }

      this.graphReady = true;
      this.applyGain();
      this.applyEq();
      this.applyProcessing();
    } catch (err) {
      console.warn(
        "[musicAudioEngine] WebAudio graph unavailable — degrading to element volume",
        err,
      );
      this.webAudioFailed = true;
      this.applyGain();
    }
  }

  // --- transport ----------------------------------------------------------

  async load(url: string): Promise<void> {
    this.cancelCrossfade();
    const el = this.active.el;
    if (!el) return;
    this.active.key = null;
    el.src = url;
    try {
      el.load();
    } catch {
    }
  }

  /**
   * Start buffering `url` on the standby element for the track `key`, so it can
   * take over the moment the current track ends. A no-op when it already holds
   * that track.
   */
  preload(key: string, url: string, loudnessDb: number | null, format: Slot["format"] = null): void {
    if (this.fading) return;
    const slot = this.standby;
    if (!slot.el || slot.key === key) return;
    slot.key = key;
    slot.loudnessDb = loudnessDb;
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
  private preloadIsPlayable(key: string): boolean {
    const el = this.standby.el;
    return (
      this.hasPreloaded(key) &&
      !!el &&
      !el.error &&
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  }

  /**
   * Make the standby element the active one when it holds `key`. The caller
   * then plays it; the element that was playing is emptied.
   */
  activatePreloaded(key: string): boolean {
    if (!this.preloadIsPlayable(key)) return false;
    const previous = this.active;
    this.activeIndex = this.activeIndex === 0 ? 1 : 0;
    this.active.key = null;
    if (previous.el) unload(previous.el);
    previous.key = null;
    previous.loudnessDb = null;
    previous.format = null;
    this.applyGain();
    return true;
  }

  /** Drop whatever the standby element holds, returning the track it was. */
  clearPreload(): string | null {
    const slot = this.standby;
    const key = slot.key;
    if (key === null) return null;
    slot.key = null;
    slot.loudnessDb = null;
    slot.format = null;
    if (slot.el) unload(slot.el);
    return key;
  }

  /** Loudness of the track now playing, as recorded when it was loaded. */
  getActiveLoudness(): number | null {
    return this.active.loudnessDb;
  }
  getActiveFormat(): Slot["format"] { return this.active.format ? { ...this.active.format } : null; }

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
    this.ensureGraph();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
      }
    }
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
    this.cancelCrossfade();
    this.active.el?.pause();
  }

  stop(): void {
    this.cancelCrossfade();
    for (const slot of this.slots) {
      slot.key = null;
      slot.loudnessDb = null;
      slot.format = null;
      if (slot.el) unload(slot.el);
    }
  }

  seek(seconds: number): void {
    this.cancelCrossfade();
    const el = this.active.el;
    if (el && Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
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

  getDuration(): number {
    const d = this.active.el?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  // --- gain (volume + loudness normalization) -----------------------------

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
    if ((!this.normalizationEnabled && !this.fading) || loudnessDb == null) return 1;
    return Math.min(1, Math.pow(10, -loudnessDb / 20));
  }

  private applyGain(): void {
    const vol = this.muted ? 0 : this.volume * (this.volumeBoostEnabled ? 1.35 : 1);

    if (this.graphReady && this.ctx && this.volGain) {
      const t = this.ctx.currentTime;
      this.volGain.gain.setTargetAtTime(vol, t, 0.012);
      for (const slot of this.slots) {
        if (!this.fading) {
          slot.fadeGain?.gain.cancelScheduledValues(t);
          slot.fadeGain?.gain.setTargetAtTime(1, t, .012);
        }
        slot.normGain?.gain.setTargetAtTime(this.normalizationFactor(slot.loudnessDb), t, 0.012);
        if (slot.el) {
          slot.el.volume = 1;
          slot.el.muted = false;
        }
      }
    } else {
      for (const slot of this.slots) {
        if (!slot.el) continue;
        const norm = this.normalizationFactor(slot.loudnessDb);
        slot.el.volume = Math.max(0, Math.min(1, vol * norm));
        slot.el.muted = this.muted;
      }
    }
  }

  // --- equalizer ----------------------------------------------------------

  setEqEnabled(enabled: boolean): void {
    this.processing = { ...this.processing, enabled };
    this.applyEq();
  }

  setEqGains(gains: number[]): void {
    this.eqGains = normalizeEqGains(gains);
    this.processing = { ...this.processing, mode: "graphic", bandCount: 10, graphicGains: { ...this.processing.graphicGains, 10: [...this.eqGains] } };
    this.applyEq();
  }

  setEqBand(index: number, gainDb: number): void {
    if (index < 0 || index >= this.eqGains.length) return;
    const next = [...this.eqGains];
    next[index] = gainDb;
    this.eqGains = normalizeEqGains(next);
    this.applyEq();
  }

  private applyEq(): void {
    this.applyProcessing();
  }

  setProcessingConfig(config: AudioProcessingConfig): void {
    this.processing = normalizeAudioProcessingConfig(config);
    if (this.processing.mode === "graphic" && this.processing.bandCount === 10) this.eqGains = normalizeEqGains(this.processing.graphicGains[10]);
    this.applyProcessing();
  }

  getProcessingConfig(): AudioProcessingConfig { return structuredClone(this.processing); }

  setVolumeBoostEnabled(enabled: boolean): void { this.volumeBoostEnabled = enabled; this.applyGain(); }
  setSkipSilenceEnabled(enabled: boolean): void { this.skipSilenceEnabled = enabled; this.silentSince = 0; }
  setSourceSampleRate(sampleRate: number | null): void {
    if (sampleRate && sampleRate >= 8000 && sampleRate <= 192000 && !this.ctx) this.sourceSampleRate = sampleRate;
  }

  tickSilenceSkip(now = performance.now()): boolean {
    if (!this.skipSilenceEnabled || !this.analyser || !this.active.el || this.active.el.paused) { this.silentSince = 0; return false; }
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (rms >= .003) { this.silentSince = 0; return false; }
    if (!this.silentSince) this.silentSince = now;
    if (now - this.silentSince < 1400) return false;
    const duration = this.getDuration();
    this.seek(Math.min(Math.max(0, duration - .25), this.getCurrentTime() + 3));
    this.silentSince = now;
    return true;
  }

  private applyProcessing(): void {
    if (!this.graphReady || !this.ctx) return;
    const t = this.ctx.currentTime;
    const config = this.processing;
    const graphic = config.mode === "graphic" ? graphicFrequencies(config.bandCount).map((frequency, index) => ({ frequency, gain: config.graphicGains[config.bandCount][index] ?? 0, q: 1.41, type: index === 0 ? "lowshelf" as const : index === config.bandCount - 1 ? "highshelf" as const : "peaking" as const })) : config.parametricBands;
    this.filters.forEach((filter, index) => {
      const band = config.enabled ? graphic[index] : undefined;
      filter.type = band?.type ?? "allpass";
      filter.frequency.setTargetAtTime(band?.frequency ?? 1000, t, .012);
      filter.Q.setTargetAtTime(band?.q ?? .7, t, .012);
      filter.gain.setTargetAtTime(band?.gain ?? 0, t, .012);
    });
    this.preampGain?.gain.setTargetAtTime(Math.pow(10, config.dynamics.preampDb / 20), t, .012);
    this.balanceNode?.pan.setTargetAtTime(config.dynamics.balance, t, .012);
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(config.dynamics.compressorEnabled ? config.dynamics.compressorThreshold : 0, t, .012);
      this.compressor.ratio.setTargetAtTime(config.dynamics.compressorEnabled ? config.dynamics.compressorRatio : 1, t, .012);
      this.compressor.knee.setTargetAtTime(config.dynamics.compressorEnabled ? 12 : 0, t, .012);
      this.compressor.attack.setTargetAtTime(config.dynamics.compressorAttack, t, .012);
      this.compressor.release.setTargetAtTime(config.dynamics.compressorRelease, t, .012);
    }
    if (this.limiter) {
      this.limiter.threshold.setTargetAtTime(config.dynamics.limiterEnabled ? -.8 : 0, t, .012);
      this.limiter.ratio.setTargetAtTime(config.dynamics.limiterEnabled ? 20 : 1, t, .012);
      this.limiter.knee.setTargetAtTime(0, t, .012);
      this.limiter.attack.setTargetAtTime(.002, t, .012);
      this.limiter.release.setTargetAtTime(.08, t, .012);
    }
  }
}

// Module singleton — survives route changes (lives outside the React tree).
export const musicAudioEngine = new MusicAudioEngine();
