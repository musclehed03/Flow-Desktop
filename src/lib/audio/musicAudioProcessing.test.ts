import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicAudioEngine } from "./musicAudioEngine";
import { defaultAudioProcessingConfig } from "./eqConfig";

const parameter = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: parameter(), frequency: parameter(), Q: parameter(), pan: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), getFloatTimeDomainData: (values: Float32Array) => values.fill(0) });
const filters: ReturnType<typeof node>[] = [];
const compressors: ReturnType<typeof node>[] = [];
class Context {
  currentTime = 0; state = "running"; destination = node(); sampleRate = 48000;
  createGain() { return node(); }
  createBiquadFilter() { const value = node(); filters.push(value); return value; }
  createStereoPanner() { return node(); }
  createAnalyser() { return node(); }
  createMediaElementSource() { return node(); }
  createDynamicsCompressor() { const value = node(); compressors.push(value); return value; }
  resume() { return Promise.resolve(); }
}

afterEach(() => vi.unstubAllGlobals());

describe("music audio processing graph", () => {
  it("applies 31-band and dynamics parameters live", async () => {
    filters.length = 0; compressors.length = 0; vi.stubGlobal("AudioContext", Context);
    const pair = [document.createElement("audio"), document.createElement("audio")] as [HTMLAudioElement, HTMLAudioElement];
    for (const element of pair) { element.load = vi.fn(); element.play = vi.fn(async () => {}); Object.defineProperty(element, "paused", { value: false, configurable: true }); }
    const engine = new MusicAudioEngine(); engine.attach(pair); await engine.load("track"); await engine.play();
    const config = defaultAudioProcessingConfig(); config.enabled = true; config.bandCount = 31; config.graphicGains[31][0] = 6; config.dynamics.compressorEnabled = true; config.dynamics.compressorRatio = 4;
    engine.setProcessingConfig(config);
    expect(filters).toHaveLength(31);
    expect(filters[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(6, 0, .012);
    expect(compressors[0]!.ratio.setTargetAtTime).toHaveBeenLastCalledWith(4, 0, .012);
  });

  it("skips only after sustained analysed silence", async () => {
    vi.stubGlobal("AudioContext", Context);
    const pair = [document.createElement("audio"), document.createElement("audio")] as [HTMLAudioElement, HTMLAudioElement];
    for (const element of pair) { element.load = vi.fn(); element.play = vi.fn(async () => {}); Object.defineProperty(element, "paused", { value: false, configurable: true }); Object.defineProperty(element, "duration", { value: 100, configurable: true }); }
    const engine = new MusicAudioEngine(); engine.attach(pair); await engine.load("track"); await engine.play(); engine.setSkipSilenceEnabled(true);
    expect(engine.tickSilenceSkip(1)).toBe(false);
    expect(engine.tickSilenceSkip(1502)).toBe(true);
    expect(pair[0].currentTime).toBe(3);
  });
});
