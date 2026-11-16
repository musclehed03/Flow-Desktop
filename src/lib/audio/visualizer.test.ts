import { describe, expect, it, vi } from "vitest";
import {
  VISUALIZER_DEFAULT,
  VISUALIZER_DEFAULTS,
  animatedVisualizerStops,
  degradeVisualizer,
  drawVisualizer,
  enforceReducedFlash,
  parseVisualizerConfig,
  parseVisualizerPresets,
  resolveVisualizerColors,
  visualizerSignalLevel,
} from "./visualizer";

describe("visualizer configuration and performance guard", () => {
  it("bounds untrusted values and migrates the old three-value palette", () => {
    expect(parseVisualizerConfig("{}").enabled).toBe(false);
    const config = parseVisualizerConfig('{"sensitivity":999,"density":99999,"fps":999,"family":"unknown","smoothing":-1,"palette":"cyan"}');
    expect(config).toMatchObject({ sensitivity: 3, density: 160, fps: 30, family: "spectrum", smoothing: 0 });
    expect(config.colors.foreground).toBe("#66d9e8");
    expect("palette" in config).toBe(false);
    const tooManyStops = Array.from({ length: 12 }, (_, index) => ({ offset: index / 11, color: "#ffffff" }));
    expect(parseVisualizerConfig(JSON.stringify({ colors: { stops: tooManyStops } })).colors.stops).toHaveLength(10);
    expect(parseVisualizerPresets("null")).toEqual([]);
    expect(parseVisualizerPresets('[{"name":"Quiet","config":{"family":"waveform"}}]')[0]).toMatchObject({ name: "Quiet", category: "custom", flashRisk: false, config: { family: "waveform" } });
  });

  it("ships twelve categorized presets and labels flashing choices", () => {
    expect(VISUALIZER_DEFAULTS).toHaveLength(12);
    expect(new Set(VISUALIZER_DEFAULTS.map((preset) => preset.category))).toEqual(new Set(["calm", "energetic", "experimental"]));
    expect(VISUALIZER_DEFAULTS.filter((preset) => preset.flashRisk).length).toBeGreaterThanOrEqual(3);
  });

  it("enforces Reduced Flash at the render boundary", () => {
    const unsafe = {
      ...VISUALIZER_DEFAULT,
      family: "feedback" as const,
      mirror: "kaleidoscope" as const,
      fps: 60 as const,
      beat: 1,
      sensitivity: 3,
      smoothing: 0,
      falloff: 0.1,
      colors: { ...VISUALIZER_DEFAULT.colors, cycleMode: "hue" as const, cycleSeconds: 2 },
    };
    const safe = enforceReducedFlash(unsafe);
    expect(safe).toMatchObject({ family: "radial", mirror: "none", fps: 30, beat: 0.35, sensitivity: 1.4, smoothing: 0.82, falloff: 0.78 });
    expect(resolveVisualizerColors(safe)).toMatchObject({ cycleMode: "off", cycleSeconds: 8 });
    expect(animatedVisualizerStops(resolveVisualizerColors(unsafe), 5, true)).toEqual(resolveVisualizerColors(unsafe).stops);
    expect(animatedVisualizerStops(resolveVisualizerColors(unsafe), 1, false)).not.toEqual(resolveVisualizerColors(unsafe).stops);
  });

  it("constrains all strobing and flashing parameters under Reduced Flash enforcement", () => {
    // 1. Safe parameters within acceptable bounds are preserved
    const alreadySafe = {
      ...VISUALIZER_DEFAULT,
      family: "spectrum" as const,
      mirror: "horizontal" as const,
      fps: 15 as const,
      sensitivity: 1.0,
      smoothing: 0.85,
      falloff: 0.80,
      beat: 0.2,
      colors: { ...VISUALIZER_DEFAULT.colors, cycleMode: "off" as const, cycleSeconds: 12 },
    };
    const preserved = enforceReducedFlash(alreadySafe);
    expect(preserved.family).toBe("spectrum");
    expect(preserved.mirror).toBe("horizontal");
    expect(preserved.fps).toBe(15);
    expect(preserved.sensitivity).toBe(1.0);
    expect(preserved.smoothing).toBe(0.85);
    expect(preserved.falloff).toBe(0.80);
    expect(preserved.beat).toBe(0.2);

    // 2. All built-in presets marked with flashRisk are fail-safe constrained
    const flashRiskPresets = VISUALIZER_DEFAULTS.filter((preset) => preset.flashRisk);
    expect(flashRiskPresets.length).toBeGreaterThan(0);
    for (const preset of flashRiskPresets) {
      const enforced = enforceReducedFlash(preset.config);
      expect(enforced.family).not.toBe("feedback");
      expect(enforced.mirror).not.toBe("kaleidoscope");
      expect(enforced.fps).toBeLessThanOrEqual(30);
      expect(enforced.sensitivity).toBeLessThanOrEqual(1.4);
      expect(enforced.smoothing).toBeGreaterThanOrEqual(0.82);
      expect(enforced.falloff).toBeGreaterThanOrEqual(0.78);
      expect(enforced.beat).toBeLessThanOrEqual(0.35);
      expect(resolveVisualizerColors(enforced).cycleMode).toBe("off");
    }
  });

  it("reduces frame rate and density under sustained drawing pressure", () => {
    expect(degradeVisualizer(60, 160, 20)).toEqual({ fps: 30, density: 120 });
    expect(degradeVisualizer(30, 64, 30)).toEqual({ fps: 15, density: 48 });
    expect(degradeVisualizer(30, 64, 3)).toEqual({ fps: 30, density: 64 });
  });

  it("measures silence and draws mirrored copies without extra FFT reads", () => {
    expect(visualizerSignalLevel(new Uint8Array(32))).toBe(0);
    expect(visualizerSignalLevel(Uint8Array.from([255, 255]))).toBe(1);
    const context = {
      fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
    drawVisualizer(context, 640, 360, new Uint8Array(64), new Uint8Array(128).fill(128), { ...VISUALIZER_DEFAULT, mirror: "quad" }, new Float32Array(160), 0);
    expect(context.save).toHaveBeenCalledTimes(4);
    expect(context.scale).toHaveBeenCalledTimes(4);
  });
});
