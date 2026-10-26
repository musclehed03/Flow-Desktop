import { describe, expect, it } from "vitest";
import { VISUALIZER_DEFAULT } from "./visualizer";
import { DDVIZ_FORMAT, DDVIZ_VERSION, encodeDdviz, mergeVisualizerPresets, parseDdviz } from "./visualizerPresetFile";

const preset = (name: string) => ({ name, category: "custom" as const, flashRisk: false, config: VISUALIZER_DEFAULT });

describe(".ddviz preset packages", () => {
  it("round-trips a versioned package", () => {
    const raw = encodeDdviz([preset("Noir")], "2026-10-25T12:00:00.000Z");
    expect(JSON.parse(raw)).toMatchObject({ format: DDVIZ_FORMAT, version: DDVIZ_VERSION, exportedAt: "2026-10-25T12:00:00.000Z" });
    expect(parseDdviz(raw)).toEqual([preset("Noir")]);
  });

  it("rejects unrelated JSON and replaces duplicate names on import", () => {
    expect(() => parseDdviz("{}")).toThrow("unsupported-package");
    const replacement = { ...preset("NOIR"), flashRisk: true };
    expect(mergeVisualizerPresets([preset("Noir"), preset("Orbit")], [replacement])).toEqual([replacement, preset("Orbit")]);
  });
});
