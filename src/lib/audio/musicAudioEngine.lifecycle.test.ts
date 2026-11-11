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
