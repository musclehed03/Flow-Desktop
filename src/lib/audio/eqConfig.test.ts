import { describe, expect, it } from "vitest";
import { defaultAudioProcessingConfig, normalizeAudioProcessingConfig, parseAutoEq, resampleGraphicCurve, responsePath } from "./eqConfig";

describe("expanded equalizer config", () => {
  it("resamples without discarding the curve", () => {
    const source = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3];
    const expanded = resampleGraphicCurve(source, 10, 31);
    expect(expanded).toHaveLength(31);
    expect(expanded[0]).toBe(6);
    expect(expanded[30]).toBe(-3);
  });

  it("parses GraphicEQ and parametric AutoEq text", () => {
    expect(parseAutoEq("GraphicEQ: 20 1.5; 1000 -2; 20000 0")).toHaveLength(3);
    expect(parseAutoEq("Filter 1: ON PK Fc 105 Hz Gain -3.2 dB Q 1.4")[0]).toMatchObject({ frequency: 105, gain: -3.2, q: 1.4, type: "peaking" });
  });

  it("clamps unsafe values and produces a graph path", () => {
    const config = defaultAudioProcessingConfig();
    config.dynamics.preampDb = 99;
    const safe = normalizeAudioProcessingConfig(config);
    expect(safe.dynamics.preampDb).toBe(15);
    expect(responsePath(safe)).toMatch(/^M/);
  });
});
