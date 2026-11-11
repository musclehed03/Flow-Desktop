import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeParam {
  value = 1;
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setValueCurveAtTime = vi.fn();
}
class FakeNode {
  connect = vi.fn(function (this: FakeNode) {
    return this;
  });
  disconnect = vi.fn();
}
const contexts: FakeContext[] = [];
class FakeContext extends EventTarget {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 48_000;
  destination = new FakeNode();
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    super();
    contexts.push(this);
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), {
      type: "peaking",
      frequency: new FakeParam(),
      Q: new FakeParam(),
      gain: new FakeParam(),
    });
  }
  createWaveShaper() {
    return Object.assign(new FakeNode(), { curve: null, oversample: "none" });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(), { pan: new FakeParam() });
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), {
      fftSize: 64,
      smoothingTimeConstant: 0,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    });
  }
  createMediaElementSource(_el: HTMLMediaElement) {
    const node = new FakeNode();
    this.sources.push(node);
    return node;
  }
  sources: FakeNode[] = [];
}

const elements = (): [HTMLAudioElement, HTMLAudioElement] => {
  const pair = [document.createElement("audio"), document.createElement("audio")] as [
    HTMLAudioElement,
    HTMLAudioElement,
  ];
  for (const el of pair) {
    el.load = vi.fn();
    el.pause = vi.fn();
    Object.defineProperty(el, "paused", { value: false, configurable: true });
  }
  return pair;
};

async function freshEngine() {
  vi.resetModules();
  const module = await import("./musicAudioEngine");
  return module.musicAudioEngine;
}

beforeEach(() => {
  vi.useFakeTimers();
  contexts.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("musicAudioEngine graph lifecycle (fixes batch #4)", () => {
  it("disconnects the old graph when re-bound to new elements, on the same context", async () => {
    const engine = await freshEngine();
    const first = elements();
    engine.attach(first);
    engine.setCrossfadeEnabled(true);
    expect(contexts).toHaveLength(1);
    const ctx = contexts[0]!;
    // Snapshot: the context records every source it ever made, including the
    // two the re-bind creates after the teardown.
    const firstSources = [...(ctx.sources ?? [])];
    expect(engine.getContextState()).toBe("running");

    const second = elements();
    engine.attach(second);
    // The old slot sources were disconnected; the context survives the re-bind.
    for (const source of firstSources) expect(source.disconnect).toHaveBeenCalled();
    expect(engine.getContextState()).toBe("running");
    expect(contexts).toHaveLength(1);
  });

  it("suspends the context after five idle seconds and resumes on play", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setCrossfadeEnabled(true);
    const ctx = contexts[0]!;
    expect(ctx.suspend).not.toHaveBeenCalled();

    for (const el of pair) Object.defineProperty(el, "paused", { value: true, configurable: true });
    pair[0].dispatchEvent(new Event("pause"));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(ctx.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);

    pair[0].dispatchEvent(new Event("play"));
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("dispose closes the context and the next play rebuilds it", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setCrossfadeEnabled(true);
    const ctx = contexts[0]!;
    await engine.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(engine.getContextState()).toBe("none");

    engine.attach(elements());
    engine.setCrossfadeEnabled(true);
    expect(contexts).toHaveLength(2);
    expect(engine.getContextState()).toBe("running");
  });
});

describe("musicAudioEngine Direct mode (fixes batch #8)", () => {
  const OPUS = 'audio/webm; codecs="opus"';
  const AAC = 'audio/mp4; codecs="mp4a.40.2"';

  it("never builds a graph for an Opus 48 kHz track, even with crossfade on", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    engine.setCrossfadeEnabled(true);
    expect(contexts).toHaveLength(0);
    expect(engine.getAnalyser()).toBeNull();
    expect(engine.isDirect()).toBe(true);
    await engine.play();
    expect(contexts).toHaveLength(0);
    expect(engine.getAnalyser()).toBeNull();
  });

  it("falls back to Standard for AAC, and the graph builds", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(44_100, AAC);
    expect(engine.isDirect()).toBe(false);
    engine.setCrossfadeEnabled(true);
    expect(contexts).toHaveLength(1);
    expect(engine.getAnalyser()).not.toBeNull();
  });

  it("falls back to Standard when the rate is unknown", async () => {
    const engine = await freshEngine();
    engine.attach(elements());
    engine.setDirectMode(true);
    engine.setSourceSampleRate(null, OPUS);
    expect(engine.isDirect()).toBe(false);
  });

  it("never arms a crossfade into or out of a Direct track", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    engine.armCrossfade(6);
    expect((engine as unknown as { armedFadeSeconds: number | null }).armedFadeSeconds).toBeNull();
    engine.setDirectMode(false);
    engine.armCrossfade(6);
    expect((engine as unknown as { armedFadeSeconds: number | null }).armedFadeSeconds).toBe(6);
  });

  it("forces playback speed to 1.0 while Direct", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setSpeed(1.5);
    expect(pair[0].playbackRate).toBe(1.5);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    engine.setSpeed(1.5);
    expect(pair[0].playbackRate).toBe(1);
    engine.setDirectMode(false);
    engine.setSpeed(1.5);
    expect(pair[0].playbackRate).toBe(1.5);
  });

  it("keeps normalization on its own flag: other setters never switch it", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setVolume(1);
    // No graph: the element volume carries the normalization cut directly.
    engine.setLoudness(8, true);
    const normalized = pair[0].volume;
    expect(normalized).toBeGreaterThan(0);
    expect(normalized).toBeLessThan(1);
    // Skip-silence must not touch the gain at all.
    engine.setSkipSilenceEnabled(true);
    expect(pair[0].volume).toBe(normalized);
    // Volume boost scales the gain, but the normalization flag survives it:
    // switching the boost back off returns to exactly the normalized value.
    engine.setVolumeBoostEnabled(true);
    expect(pair[0].volume).toBeGreaterThan(normalized);
    engine.setVolumeBoostEnabled(false);
    expect(pair[0].volume).toBe(normalized);
    // And Direct overrides the flag entirely.
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    engine.setLoudness(8, true);
    expect(pair[0].volume).toBe(1);
    // Turning normalization off returns the element to full volume.
    engine.setDirectMode(false);
    engine.setLoudness(8, false);
    expect(pair[0].volume).toBe(1);
  });
});
