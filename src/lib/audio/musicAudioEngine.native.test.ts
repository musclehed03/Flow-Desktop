import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeAudioOpenResult } from "./nativeAudio";

const OPUS = 'audio/webm; codecs="opus"';
const AAC = 'audio/mp4; codecs="mp4a.40.2"';

/** Fake web-audio world, mirroring musicAudioEngine.lifecycle.test.ts, plus the worklet tap. */
class FakeParam {
  value = 1;

  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
}

class FakeNode {
  connect = vi.fn(function (this: FakeNode) { return this; });
  disconnect = vi.fn();
}

const workletNodes: FakeWorkletNode[] = [];

class FakeWorkletNode extends FakeNode {
  port = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: vi.fn() };
  constructor() {
    super();
    workletNodes.push(this);
  }
}

class FakeContext extends EventTarget {
  sources: FakeNode[] = [];
  state: AudioContextState = "running";
  sampleRate = 48_000;
  currentTime = 0;
  destination = new FakeNode();
  audioWorklet = { addModule: vi.fn(async () => undefined) };

  createMediaElementSource() {
    const node = new FakeNode();
    this.sources.push(node);
    return node;
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  createAnalyser() {
    return new FakeNode();
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
  createBiquadFilter() {
    return Object.assign(new FakeNode(), {
      frequency: new FakeParam(),
      Q: new FakeParam(),
      gain: new FakeParam(),
    });
  }
  createDelay() {
    return Object.assign(new FakeNode(), { delayTime: new FakeParam() });
  }
  createBufferSource() {
    return Object.assign(new FakeNode(), {
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    });
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(1), length: 1, sampleRate: 48_000 };
  }
  resume = vi.fn(async () => undefined);
  suspend = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
}

const elements = (): [HTMLAudioElement, HTMLAudioElement] => {
  const pair = [document.createElement("audio"), document.createElement("audio")] as [
    HTMLAudioElement,
    HTMLAudioElement,
  ];
  for (const el of pair) {
    Object.defineProperty(el, "currentSrc", { value: "https://example.invalid/track.opus", configurable: true });
    el.load = vi.fn();
    el.pause = vi.fn();
    el.play = vi.fn(async () => undefined);
    Object.defineProperty(el, "paused", { value: false, configurable: true });
  }
  return pair;
};

async function freshEngine() {
  vi.resetModules();
  const { musicAudioEngine } = await import("./musicAudioEngine");
  return musicAudioEngine;
}

function mockSink(openResult: NativeAudioOpenResult = {
  exclusive: true,
  format: { sample_rate: 48000, channels: 2, container_bits: 32, valid_bits: 24, float: false },
  error: null,
}) {
  return {
    isAvailable: () => true,
    open: vi.fn(async () => openResult),
    feed: vi.fn(async () => ({
      active: true, exclusive: true,
      format: { sample_rate: 48000, channels: 2, container_bits: 32, valid_bits: 24, float: false },
      error: null, underrun_frames: 0, queued_frames: 0, pending_device_frames: 0,
    })),
    close: vi.fn(async () => undefined),
  };
}

describe("musicAudioEngine native output (Deviant Audio Engine)", () => {
  let contexts: FakeContext[] = [];

  beforeEach(() => {
    contexts = [];
    workletNodes.length = 0;
    vi.stubGlobal(
      "AudioContext",
      class extends FakeContext {
        constructor() {
          super();
          contexts.push(this);
        }
      },
    );
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  async function setupDirect() {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    const sink = mockSink();
    engine.setNativeSink(sink);
    await engine.play();
    return { engine, pair, sink };
  }

  it("opens the native stream and builds the tap graph for a Direct Opus track", async () => {
    const { engine, sink } = await setupDirect();
    expect(sink.open).toHaveBeenCalledWith(48000, 2);
    expect(contexts.length).toBe(1);
    const ctx = contexts[0]!;
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(workletNodes.length).toBe(1);
    expect(engine.getNativeState()).toMatchObject({ engaged: true, exclusive: true, error: null });
    // The source feeds the tap, not the mixer.
    expect(ctx.sources[0]!.connect).toHaveBeenCalledWith(workletNodes[0]!);
    await engine.dispose();
  });

  it("feeds tapped samples to the engine as bytes", async () => {
    const { engine, sink } = await setupDirect();
    const tap = workletNodes[0]!;
    const samples = new Float32Array([0.25, -0.25, 0.5, -0.5]);
    tap.port.onmessage?.({ data: { type: "pcm", samples } });
    await vi.waitFor(() => expect(sink.feed).toHaveBeenCalledTimes(1));
    const [pcm, rate, channels] = sink.feed.mock.calls[0]! as unknown as [Uint8Array, number, number];
    expect(rate).toBe(48000);
    expect(channels).toBe(2);
    expect(pcm.length).toBe(16);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    expect(view.getFloat32(0, true)).toBeCloseTo(0.25);
    expect(view.getFloat32(4, true)).toBeCloseTo(-0.25);
    await engine.dispose();
  });

  it("never touches the native sink for an AAC track", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(44_100, AAC);
    const sink = mockSink();
    engine.setNativeSink(sink);
    await engine.play();
    expect(sink.open).not.toHaveBeenCalled();
    expect(contexts.length).toBe(0);
    await engine.dispose();
  });

  it("never touches the native sink when Direct mode is off", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(false);
    engine.setSourceSampleRate(48_000, OPUS);
    const sink = mockSink();
    engine.setNativeSink(sink);
    await engine.play();
    expect(sink.open).not.toHaveBeenCalled();
    await engine.dispose();
  });

  it("a failed open still plays through the mixer, with the reason recorded", async () => {
    const engine = await freshEngine();
    const pair = elements();
    engine.attach(pair);
    engine.setDirectMode(true);
    engine.setSourceSampleRate(48_000, OPUS);
    const sink = mockSink({ exclusive: false, format: null, error: "device busy" });
    engine.setNativeSink(sink);
    await engine.play();
    expect(pair[0].play).toHaveBeenCalled();
    expect(engine.getNativeState()).toMatchObject({ engaged: false, error: "device busy" });
    // The tap is detached: the source goes straight to the mixer.
    const ctx = contexts[0]!;
    expect(ctx.sources[0]!.connect).toHaveBeenCalledWith(ctx.destination);
    await engine.dispose();
  });

  it("seek re-opens the stream so pre-seek samples never play", async () => {
    const { engine, sink } = await setupDirect();
    engine.seek(30);
    await vi.waitFor(() => expect(sink.open).toHaveBeenCalledTimes(2));
    expect(sink.close).toHaveBeenCalledTimes(1);
    await engine.dispose();
  });

  it("stop and pause close the stream; the next play re-opens", async () => {
    const { engine, sink } = await setupDirect();
    engine.pause();
    await vi.waitFor(() => expect(sink.close).toHaveBeenCalledTimes(1));
    await engine.play();
    expect(sink.open).toHaveBeenCalledTimes(2);
    engine.stop();
    await vi.waitFor(() => expect(sink.close).toHaveBeenCalledTimes(2));
    await engine.dispose();
  });

  it("three failed feeds detach to the mixer and record the error", async () => {
    const { engine, sink } = await setupDirect();
    sink.feed.mockRejectedValue(new Error("invoke failed"));
    const tap = workletNodes[0]!;
    const samples = new Float32Array(256);
    for (let i = 0; i < 3; i += 1) {
      tap.port.onmessage?.({ data: { type: "pcm", samples } });
      await vi.waitFor(() => expect(sink.feed).toHaveBeenCalledTimes(i + 1));
    }
    await vi.waitFor(() => expect(sink.close).toHaveBeenCalledTimes(1));
    const ctx = contexts[0]!;
    expect(ctx.sources[0]!.connect).toHaveBeenCalledWith(ctx.destination);
    expect(engine.getNativeState()).toMatchObject({ engaged: false });
    expect(engine.getNativeState().error).toContain("invoke failed");
    await engine.dispose();
  });
});
