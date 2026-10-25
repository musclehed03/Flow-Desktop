import { describe, expect, it } from "vitest";
import { MAX_CONCURRENT_TRACERS, tracerDurationMs, tracerOriginFor } from "./DeviantTracer";

describe("Deviant spark tracer budget", () => {
  it("caps the system at one transform-only tracer", () => {
    expect(MAX_CONCURRENT_TRACERS).toBe(1);
    expect(tracerDurationMs(20, 20)).toBe(1500);
    expect(tracerDurationMs(1920, 1080)).toBe(2000);
    expect(tracerDurationMs(400, 100)).toBeGreaterThanOrEqual(1500);
    expect(tracerDurationMs(400, 100)).toBeLessThanOrEqual(2000);
  });

  it("chooses the ignition point from justification", () => {
    expect(tracerOriginFor("flex-start", "start")).toBe("left");
    expect(tracerOriginFor("center", "center")).toBe("center");
    expect(tracerOriginFor("flex-end", "right")).toBe("right");
  });
});
