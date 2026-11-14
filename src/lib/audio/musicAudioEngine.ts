import { loudnessFactor, MUSIC_MAX_CUT_DB } from "../loudness";
import { IS_LINUX_RUNTIME, IS_MACOS_RUNTIME } from "../platform";
import { createAudioContext, keepRunning, resumeWithin, suspendAfterIdle, webAudioSupported } from "./audioContext";
import { QUICK_FADE_IN_SECONDS } from "./crossfade";
import { fadeInGain, fadeOutGain, resetFade, scheduleFade, steppedFade, type CrossfadeCurve } from "./crossfadeRamp";
import { EQ_GRAPH_OFF, type EqGraphSpec } from "./eq/graphPlan";
import { EqChain, RAMP_TIME_CONSTANT } from "./eqChain";
import { defaultAudioProcessingConfig, normalizeAudioProcessingConfig, type AudioProcessingConfig } from "./eqConfig";
import { pastListedEnd, playableLength } from "./listedLength";
import { volumeGain } from "./volumeCurve";
import { webAudioHears } from "./webAudioFormats";
import { NATIVE_TAP_PROCESSOR_NAME } from "./nativeTapProcessor";
import {
  emptyNativeAudioState,
  type NativeAudioSink,
  type NativeAudioState,
} from "./nativeAudio";

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

/** A fade on one element alone: a song fading out with nothing ready to blend into, or the next one coming in after it. */
interface SoloFade {
  slot: Slot;
  cancelSteps: (() => void) | null;
  done: ReturnType<typeof setTimeout> | null;
}

/** The song a skip moved away from, playing on until the next one starts. */
interface HeldSkip {
  previous: Slot;
  seconds: number;
  giveUp: ReturnType<typeof setTimeout>;
}

/** A skip whose next song hasn't started by then lets the old one go. */
const SKIP_HOLD_LIMIT_MS = 10_000;

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
  /**
   * Direct mode (fixes batch #8): the user asked for the music untouched by
   * Flow. While it holds for the track now playing, no graph is built and no
   * gain stage runs — but it is NOT bit-perfect, and must never be labelled
   * so: the source is lossy YouTube audio, the browser still decodes it, and
   * the OS mixer still applies. It only holds for Opus at 48 kHz (see
   * `isDirect`); anything else falls back to Standard for that track.
   */
  private directMode = false;
  /** The native output sink (the Deviant Audio Engine), set once at startup; null in tests and where the engine cannot run. */
  private nativeSink: NativeAudioSink | null = null;
  /** The native stream is open for the track now playing. */
  private nativeActive = false;
  /** The element URL the native stream was opened for; a new track re-opens, flushing the old queue. */
  private nativeOpenKey: string | null = null;
  /** The tap feeding the engine, and the silent sink it drains into. */
  private nativeTap: AudioWorkletNode | null = null;
  private nativeZero: GainNode | null = null;
  /** Consecutive feed failures; the tap detaches to the mixer after three. */
  private nativeFeedFailures = 0;
  /** One in-flight tap-graph + open, so concurrent plays never open twice. */
  private nativeEngagePromise: Promise<void> | null = null;
  private nativeState: NativeAudioState = emptyNativeAudioState();
  private nativeStateListeners = new Set<(state: NativeAudioState) => void>();
  private eqSpec: EqGraphSpec = EQ_GRAPH_OFF;
  private eqEngaged = false;
  private speed = 1;
  private crossfadeEnabled = false;
  private crossfadeCurve: CrossfadeCurve = "EQUAL_POWER";
  private armedFadeSeconds: number | null = null;
  private fading: Fade | null = null;
  private solo: SoloFade | null = null;
  private held: HeldSkip | null = null;
  /** Set once a song faded out on its own: the next one to play comes in over `QUICK_FADE_IN_SECONDS`. */
  private quickFadeIn = false;
  /** Bumped by every load, so a fade-in waiting for one song never starts on a later one. */
  private loadToken = 0;
  private preloadAfterFade: (() => void) | null = null;

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
    this.solo = null;
    this.held = null;
    this.quickFadeIn = false;
    this.preloadAfterFade = null;
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
    try {
      this.nativeTap?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.nativeTap = null;
    try {
      this.nativeZero?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.nativeZero = null;
    this.graphReady = false;
    void this.closeNativeStream();
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
    if (this.isDirect() && this.shouldUseNative()) {
      // The tap graph loads its worklet module asynchronously; play() awaits
      // the same setup, so this is only the fire-and-forget path from a
      // mid-song settings change.
      void this.engageNative();
      return;
    }
    try {
      if (!this.ctx) {
        // Opus — the preferred codec — is natively 48 kHz, so the Standard
        // path runs its context at that rate instead of the device default;
        // an AAC track still gets resampled by the browser either way.
        const ctx = createAudioContext({ sampleRate: 48_000 });
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

  async load(url: string, mime: string | null, listedSeconds: number | null = null, format: Slot["format"] = null): Promise<void> {
    const el = this.active.el;
    if (!el) return;
    this.loadToken += 1;
    this.prepareEntrance(this.active);
    this.active.key = null;
    this.active.mime = mime;
    this.active.listed = listedSeconds;
    this.active.listedEndTaken = false;
    if (format) this.active.format = format;
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
   * that track. While it is still fading out the last one, this waits for that fade to run its course.
   */
  preload(
    key: string,
    url: string,
    loudnessDb: number | null,
    mime: string | null,
    listedSeconds: number | null = null,
    format: Slot["format"] = null,
  ): void {
    if (this.fading || this.held) {
      this.preloadAfterFade = () => this.preload(key, url, loudnessDb, mime, listedSeconds);
      return;
    }
    const slot = this.standby;
    if (!slot.el || slot.key === key) return;
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
    // A crossfade sums two tracks through gain stages — by definition not
    // untouched — and it touches BOTH sides: the outgoing tail fades out and
    // the incoming head fades in. So it is judged on the incoming track (the
    // standby slot holds the preloaded next track) as well as the outgoing
    // one; either side being Direct makes the advance a clean cut instead,
    // and the arm is dropped, not held for a later track.
    const incoming = this.standby.format ?? this.active.format;
    if (this.directMode && (this.formatIsDirect(incoming) || this.formatIsDirect(this.active.format))) return;
    this.armedFadeSeconds = seconds > 0 ? seconds : null;
  }

  /**
   * Makes the next `load` play on the other element while the song now playing carries on, and
   * fades the two over `seconds` once the new one plays, as Android's skip does: the old song
   * never goes quiet while the next one resolves and buffers. A second skip before then only
   * changes what loads.
   */
  holdForSkip(seconds: number): void {
    if (this.held) return;
    this.finishFade();
    this.quickFadeIn = false;
    this.endSolo();
    const previous = this.active;
    if (seconds <= 0 || !previous.el || previous.el.paused) return;
    this.activeIndex = this.activeIndex === 0 ? 1 : 0;
    const next = this.active;
    this.release(next);
    this.silence(next);
    const el = next.el;
    const token = this.loadToken + 1;
    el?.addEventListener("playing", () => {
      if (this.loadToken >= token) this.startHeldFade();
    }, { once: true });
    this.held = { previous, seconds, giveUp: setTimeout(() => this.dropHeld(), SKIP_HOLD_LIMIT_MS) };
    this.applyGain();
  }

  private startHeldFade(): void {
    const held = this.held;
    if (!held) return;
    clearTimeout(held.giveUp);
    this.held = null;
    if (!held.previous.el || held.previous.el.paused) {
      this.release(held.previous);
      this.restore(this.active);
      return;
    }
    this.startFade(held.previous, held.seconds);
  }

  /** Lets the song a skip held go at once: the next one didn't start, or playback stopped. */
  private dropHeld(): void {
    const held = this.held;
    if (!held) return;
    clearTimeout(held.giveUp);
    this.held = null;
    this.release(held.previous);
    this.restore(this.active);
    const preload = this.preloadAfterFade;
    this.preloadAfterFade = null;
    preload?.();
  }

  /**
   * Fades the song out on its own over `seconds` when no next song is ready to blend with, as
   * Android does rather than dropping the fade; the next song to play then comes in over
   * `QUICK_FADE_IN_SECONDS`. A seek or a pause puts the song back to full volume.
   */
  fadeThrough(seconds: number): void {
    if (this.solo || this.fading || this.held || seconds <= 0 || !this.active.el) return;
    this.soloFade(this.active, "out", seconds);
    this.quickFadeIn = true;
  }

  /** Whether the song is fading out on its own, so it isn't started again on every tick. */
  isFadingThrough(): boolean {
    return !!this.solo && !this.solo.done;
  }

  /** Repeat one after a song faded out on its own: back to the start, coming in quickly. */
  replay(): void {
    const quick = this.quickFadeIn;
    this.seek(0);
    if (quick) {
      this.loadToken += 1;
      this.quickFadeIn = true;
      this.prepareEntrance(this.active);
    }
  }

  /** A song loading after one that faded out on its own starts silent and comes in quickly; any other starts at full. */
  private prepareEntrance(slot: Slot): void {
    const quick = this.quickFadeIn;
    this.quickFadeIn = false;
    // A song that faded out on another element is emptied by the caller, so it isn't turned back up here.
    const solo = this.solo;
    this.solo = null;
    solo?.cancelSteps?.();
    if (solo?.done) clearTimeout(solo.done);
    if (!quick) {
      // A song a skip loads stays silent until the fade brings it in.
      if (slot.fade !== 1 && !this.held) this.restore(slot);
      return;
    }
    this.silence(slot);
    const el = slot.el;
    const token = this.loadToken;
    const begin = () => {
      if (this.loadToken === token && this.active === slot) this.soloFade(slot, "in", QUICK_FADE_IN_SECONDS);
    };
    if (el && !el.paused && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) begin();
    else el?.addEventListener("playing", begin, { once: true });
  }

  private soloFade(slot: Slot, direction: "in" | "out", seconds: number): void {
    this.endSolo();
    let cancelSteps: (() => void) | null = null;
    if (this.ctx && this.routes(slot) && slot.fadeGain) {
      scheduleFade(slot.fadeGain.gain, direction, this.ctx.currentTime, seconds, this.crossfadeCurve);
    } else {
      const gain = direction === "in" ? fadeInGain : fadeOutGain;
      cancelSteps = steppedFade(seconds, (progress) => {
        slot.fade = gain(progress, this.crossfadeCurve);
        this.applyGain();
      });
    }
    // A fade out holds until the song ends or loads another; a fade in hands back full volume.
    const done = direction === "in" ? setTimeout(() => this.endSolo(), seconds * 1_000 + 50) : null;
    this.solo = { slot, cancelSteps, done };
  }

  /** Puts the element a solo fade moved back at full volume. */
  private endSolo(): void {
    const solo = this.solo;
    if (!solo) return;
    this.solo = null;
    solo.cancelSteps?.();
    if (solo.done) clearTimeout(solo.done);
    this.restore(solo.slot);
  }

  private silence(slot: Slot): void {
    slot.fade = 0;
    if (this.ctx && slot.fadeGain) {
      slot.fadeGain.gain.cancelScheduledValues(this.ctx.currentTime);
      slot.fadeGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    this.applyGain();
  }

  private restore(slot: Slot): void {
    slot.fade = 1;
    if (this.ctx && slot.fadeGain) resetFade(slot.fadeGain.gain, this.ctx.currentTime);
    this.applyGain();
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
    this.loadToken += 1;
    this.prepareEntrance(this.active);
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
    if (slot.fade !== 1) this.restore(slot);
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
      scheduleFade(previous.fadeGain.gain, "out", t, seconds, this.crossfadeCurve);
      scheduleFade(next.fadeGain.gain, "in", t, seconds, this.crossfadeCurve);
    } else {
      cancelSteps = steppedFade(seconds, (progress) => {
        previous.fade = fadeOutGain(progress, this.crossfadeCurve);
        next.fade = fadeInGain(progress, this.crossfadeCurve);
        this.applyGain();
      });
    }
    const done = setTimeout(() => {
      const preload = this.preloadAfterFade;
      this.finishFade();
      preload?.();
    }, seconds * 1_000 + 50);
    this.fading = { previous, done, cancelSteps };
  }

  /** Ends a crossfade now: the outgoing element is emptied and both gains return to full. */
  private finishFade(): void {
    const fading = this.fading;
    if (!fading) return;
    this.fading = null;
    this.preloadAfterFade = null;
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
    if (this.held?.previous === slot) return null;
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

  /**
   * Whether the track now playing runs Direct: the mode is on AND the track's
   * format is one Flow can leave alone — Opus at its native 48 kHz, so the
   * browser decodes it at the rate it was served and nothing resamples it.
   * AAC (typically 44.1 kHz) and an unknown rate are never Direct.
   */
  isDirect(): boolean {
    return this.directMode && this.formatIsDirect(this.active.format);
  }

  private formatIsDirect(format: Slot["format"]): boolean {
    return (
      format !== null &&
      format.mimeType.toLowerCase().includes("opus") &&
      format.sampleRate === 48_000
    );
  }

  /** Direct mode is decided before the first graph build of the session (the toggle says restart to switch); a graph already built cannot be un-routed, so flipping this mid-session only stops new builds. */
  setDirectMode(enabled: boolean): void {
    this.directMode = enabled;
  }

  // --- native output (Deviant Audio Engine) --------------------------------

  /** The native output sink the engine feeds when Direct mode can use it. */
  setNativeSink(sink: NativeAudioSink | null): void {
    this.nativeSink = sink;
  }

  /** The native output state the badge reads: engaged, exclusive, or why it fell back. */
  getNativeState(): NativeAudioState {
    return { ...this.nativeState, supported: this.nativeSink?.isAvailable() ?? false };
  }

  onNativeStateChange(listener: (state: NativeAudioState) => void): () => void {
    this.nativeStateListeners.add(listener);
    return () => {
      this.nativeStateListeners.delete(listener);
    };
  }

  private setNativeState(patch: Partial<NativeAudioState>): void {
    this.nativeState = { ...this.nativeState, ...patch };
    const snapshot = this.getNativeState();
    for (const listener of this.nativeStateListeners) listener(snapshot);
  }

  /** Direct mode can hand this track to the native engine: the mode is on, a sink is set, this machine can open exclusive, and the track is Opus at 48 kHz. */
  private shouldUseNative(): boolean {
    return (
      this.directMode &&
      this.nativeSink !== null &&
      this.nativeSink.isAvailable() &&
      this.formatIsDirect(this.active.format)
    );
  }

  /** Builds the tap graph and opens the exclusive stream (one in-flight attempt at a time). A failure anywhere leaves the element playing through the OS mixer with the reason recorded — never silence. */
  private engageNative(): Promise<void> {
    if (!this.nativeEngagePromise) {
      this.nativeEngagePromise = (async () => {
        await this.ensureNativeTapGraph();
        await this.openNativeForActive();
      })().finally(() => {
        this.nativeEngagePromise = null;
      });
    }
    return this.nativeEngagePromise;
  }

  /** The tap-only graph: source -> worklet tap -> silent gain -> destination, so the element's samples reach the engine and nothing reaches the mixer. No EQ, no dynamics, no analyser — Direct semantics. */
  private async ensureNativeTapGraph(): Promise<void> {
    if (this.graphReady) return;
    if (!this.ctx) {
      const ctx = createAudioContext({ sampleRate: 48_000 });
      if (!ctx) {
        // No Web Audio at all: the element still plays straight to the mixer
        // (plain Direct), and the badge says the native path never started.
        this.setNativeState({ engaged: false, exclusive: false, error: "Web Audio unavailable" });
        this.webAudioFailed = true;
        this.notifyAvailability();
        return;
      }
      this.ctx = ctx;
      keepRunning(ctx, () => !!this.active.el && !this.active.el.paused);
    }
    const ctx = this.ctx;
    try {
      await ctx.audioWorklet.addModule(new URL("./nativeTapProcessor.ts", import.meta.url));
    } catch (err) {
      console.warn("[musicAudioEngine] native tap unavailable, playing through the OS mixer", err);
      this.setNativeState({ engaged: false, exclusive: false, error: "tap module failed to load" });
      return;
    }
    if (!this.attachNativeTap()) {
      this.setNativeState({ engaged: false, exclusive: false, error: "tap node failed to start" });
      return;
    }
    this.graphReady = true;
    this.applyGain();
    if (this.active.el && !this.active.el.paused) void resumeWithin(ctx);
  }

  /** Creates the tap node and wires both elements' sources into it. Returns false when the node cannot be made. */
  private attachNativeTap(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    try {
      const tap = new AudioWorkletNode(ctx, NATIVE_TAP_PROCESSOR_NAME);
      tap.port.onmessage = (event: MessageEvent) => this.onNativeTapMessage(event);
      const zero = ctx.createGain();
      zero.gain.value = 0;
      tap.connect(zero);
      zero.connect(ctx.destination);
      for (const slot of this.slots) {
        if (!slot.el) continue;
        if (!slot.source) slot.source = ctx.createMediaElementSource(slot.el);
        slot.source.disconnect();
        slot.source.connect(tap);
      }
      this.nativeTap = tap;
      this.nativeZero = zero;
      return true;
    } catch (err) {
      console.warn("[musicAudioEngine] native tap failed to attach", err);
      return false;
    }
  }

  /** Moves the element sources back to the mixer, silently dropping the tap. The track keeps playing; only the native path ends. */
  private detachNativeToMixer(): void {
    const ctx = this.ctx;
    if (ctx) {
      for (const slot of this.slots) {
        if (!slot.source) continue;
        try {
          slot.source.disconnect();
        } catch {
          // Already disconnected.
        }
        try {
          slot.source.connect(ctx.destination);
        } catch {
          // Context closed underneath.
        }
      }
    }
    try {
      this.nativeTap?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.nativeTap = null;
    try {
      this.nativeZero?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.nativeZero = null;
    this.nativeActive = false;
    this.nativeFeedFailures = 0;
  }

  /** The element URL the native stream belongs to; a new track re-opens, flushing the old queue. */
  private nativeOpenKeyFor(): string | null {
    const src = this.active.el?.currentSrc || this.active.el?.src || "";
    return src === "" ? null : src;
  }

  /** Opens the exclusive stream for the track now playing, unless the same stream is already open for it. A failure detaches the tap to the mixer and records the engine's reason — the track still plays. */
  private async openNativeForActive(): Promise<void> {
    const sink = this.nativeSink;
    if (!sink || !this.shouldUseNative()) return;
    const key = this.nativeOpenKeyFor();
    if (key === null) return;
    if (this.nativeActive && this.nativeOpenKey === key) return;
    // No tap, no stream: opening exclusive with nothing feeding it would hold
    // the device while the sound came from the mixer. Re-attach first when
    // the graph is live but the tap was detached after a failure.
    if (!this.graphReady) return;
    if (!this.nativeTap && !this.attachNativeTap()) {
      this.setNativeState({ engaged: false, exclusive: false, error: "tap node failed to start" });
      return;
    }
    const rate = this.active.format?.sampleRate ?? 48_000;
    try {
      const result = await sink.open(rate, 2);
      if (!result.exclusive || !result.format) {
        this.nativeActive = false;
        this.nativeOpenKey = null;
        this.setNativeState({ engaged: false, exclusive: false, error: result.error ?? "exclusive open failed" });
        this.detachNativeToMixer();
        return;
      }
      this.nativeActive = true;
      this.nativeOpenKey = key;
      this.setNativeState({ engaged: true, exclusive: true, format: result.format, error: null });
      if (this.graphReady && !this.nativeTap) this.attachNativeTap();
    } catch (err) {
      this.nativeActive = false;
      this.nativeOpenKey = null;
      this.setNativeState({ engaged: false, exclusive: false, error: err instanceof Error ? err.message : "native open failed" });
      this.detachNativeToMixer();
    }
  }

  /** Closes the native stream, releasing exclusive control. A failure reason from the last open or feed stays until the next open succeeds. */
  private async closeNativeStream(): Promise<void> {
    if (!this.nativeActive && this.nativeOpenKey === null) return;
    this.nativeActive = false;
    this.nativeOpenKey = null;
    this.nativeFeedFailures = 0;
    const sink = this.nativeSink;
    if (sink) await sink.close();
    this.setNativeState({ engaged: false, exclusive: false, format: null });
  }

  /** Re-opens the stream after a seek, so pre-seek samples queued in the engine never play. */
  private async reopenNativeForSeek(): Promise<void> {
    if (!this.nativeActive) return;
    await this.closeNativeStream();
    await this.openNativeForActive();
  }

  /** A tap chunk, forwarded to the engine. Dropped while paused or with no stream open; three consecutive failures detach to the mixer rather than letting the track go silent. */
  private onNativeTapMessage(event: MessageEvent): void {
    const data = event.data as { type?: unknown; samples?: unknown } | null;
    if (!data || data.type !== "pcm" || !(data.samples instanceof Float32Array)) return;
    if (!this.nativeActive || !this.active.el || this.active.el.paused) return;
    const rate = this.active.format?.sampleRate ?? 48_000;
    const bytes = new Uint8Array(data.samples.buffer, data.samples.byteOffset, data.samples.byteLength);
    void this.feedNative(bytes, rate, 2);
  }

  private async feedNative(bytes: Uint8Array, rate: number, channels: number): Promise<void> {
    const sink = this.nativeSink;
    if (!sink || !this.nativeActive) return;
    try {
      await sink.feed(bytes, rate, channels);
      this.nativeFeedFailures = 0;
    } catch (err) {
      this.nativeFeedFailures += 1;
      if (this.nativeFeedFailures >= 3) {
        console.warn("[musicAudioEngine] native feed failed repeatedly, falling back to the OS mixer", err);
        this.setNativeState({ engaged: false, exclusive: false, error: err instanceof Error ? err.message : "native feed failed" });
        this.detachNativeToMixer();
        void this.closeNativeStream();
      }
    }
  }

  setSourceSampleRate(sampleRate: number | null, mimeType?: string): void {
    // Records the resolved track's format on the active slot, so `isDirect`
    // answers for this track before `load()` runs. The rate alone cannot
    // decide it — AAC at 48 kHz would still be resampled by the decoder path,
    // so the codec has to come with it.
    const mime = mimeType ?? this.active.format?.mimeType ?? "";
    this.active.format = { mimeType: mime, bitrate: this.active.format?.bitrate ?? null, sampleRate };
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
    if (this.shouldUseNative()) await this.engageNative();
    else if (this.needsGraph()) this.ensureGraph();
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
    this.dropHeld();
    this.quickFadeIn = false;
    this.endSolo();
    this.active.el?.pause();
    // Holding exclusive while paused would lock the device for nothing; the next play re-opens.
    void this.closeNativeStream();
  }

  stop(): void {
    this.finishFade();
    this.dropHeld();
    this.quickFadeIn = false;
    this.endSolo();
    for (const slot of this.slots) this.release(slot);
    void this.closeNativeStream();
  }

  seek(seconds: number): void {
    if (this.solo && !this.solo.done) {
      this.quickFadeIn = false;
      this.endSolo();
    }
    const el = this.active.el;
    if (el && Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
      this.active.listedEndTaken = false;
    }
    // The engine queue holds pre-seek samples; re-open so they never play.
    void this.reopenNativeForSeek();
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

  getSpeed(): number {
    return this.speed;
  }

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
    // A speed other than 1.0 resamples the track in the element: not untouched.
    const rate = this.isDirect() ? 1 : this.speed;
    for (const slot of this.slots) {
      const el = slot.el;
      if (!el) continue;
      if (el.defaultPlaybackRate !== rate) el.defaultPlaybackRate = rate;
      if (el.playbackRate !== rate) el.playbackRate = rate;
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
    // Direct ignores the normalization flag no matter who set it last: the
    // engine's loudness flag used to have two writers (the saved setting and
    // a video setting fed in by the audio controller), and a toggle of
    // skip-silence or volume-boost could silently switch it. The saved music
    // setting is now the only writer, and Direct overrides even that.
    if (this.isDirect()) return 1;
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
    const scheduledSolo = this.solo && !this.solo.cancelSteps ? this.solo.slot : null;
    for (const slot of this.slots) {
      if (!slot.el) continue;
      const norm = this.normalizationFactor(slot.loudnessDb);
      if (this.routes(slot)) {
        slot.normGain?.gain.setTargetAtTime(norm, t, RAMP_TIME_CONSTANT);
        if (!scheduledFade && slot !== scheduledSolo) slot.fadeGain?.gain.setTargetAtTime(slot.fade, t, RAMP_TIME_CONSTANT);
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

  setCrossfadeCurve(curve: CrossfadeCurve): void {
    this.crossfadeCurve = curve;
  }

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
    // Direct runs the element straight to the OS mixer: no graph, no gain
    // stages, no analyser — unless the native engine is taking the samples,
    // in which case a tap-only graph carries them to the engine.
    if (this.isDirect()) return this.shouldUseNative();
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
