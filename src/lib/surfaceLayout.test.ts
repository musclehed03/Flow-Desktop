import { describe, expect, it } from "vitest";
import { clampSurfaceLayout, intersectsDockBand, readSurfaceLayout, snapSurfaceLayout, SURFACE_DOCK_KEEP_OUT, writeSurfaceLayout } from "./surfaceLayout";

const viewport = { width: 1000, height: 700 };
const constraints = { minWidth: 120, minHeight: 48, margin: 12 };

describe("player surface layout", () => {
  it("keeps restored surfaces fully on screen", () => {
    expect(clampSurfaceLayout({ x: 980, y: -40, width: 200, height: 80 }, viewport, constraints)).toEqual({ x: 788, y: 12, width: 200, height: 80 });
  });

  it("snaps to the nearest horizontal edge", () => {
    expect(snapSurfaceLayout({ x: 400, y: 90, width: 160, height: 60 }, viewport, constraints)).toMatchObject({ x: 12, y: 90 });
    expect(snapSurfaceLayout({ x: 700, y: 90, width: 160, height: 60 }, viewport, constraints)).toMatchObject({ x: 828, y: 90 });
  });

  it("stores one surface without losing others and rejects malformed JSON", () => {
    const raw = writeSurfaceLayout('{"pip":{"x":1,"y":2,"width":3,"height":4}}', "visualizer", { x: 10, y: 20, width: 320, height: 160 });
    expect(Object.keys(JSON.parse(raw))).toEqual(["pip", "visualizer"]);
    expect(readSurfaceLayout("bad", "x", { x: 20, y: 30, width: 200, height: 100 }, viewport, constraints)).toEqual({ x: 20, y: 30, width: 200, height: 100 });
  });

  it("never lets a surface rest on the music dock", () => {
    // The dock is 72px tall at bottom-6, so its lane starts 96px up; surfaces
    // keep 12px clear of it. The old bottom-right park (y = H - 112, 52 tall)
    // sat squarely in that lane.
    expect(SURFACE_DOCK_KEEP_OUT).toBe(108);
    const parked = { x: 768, y: 588, width: 220, height: 52 };
    expect(intersectsDockBand(parked, viewport)).toBe(true);
    expect(clampSurfaceLayout(parked, viewport, constraints)).toEqual({ x: 768, y: 540, width: 220, height: 52 });
    // A surface already clear of the lane is left alone.
    expect(clampSurfaceLayout({ x: 768, y: 44, width: 220, height: 52 }, viewport, constraints)).toEqual({ x: 768, y: 44, width: 220, height: 52 });
    // A surface taller than the room above the lane stays reachable instead
    // of being pushed off-screen.
    const tall = clampSurfaceLayout({ x: 100, y: 12, width: 200, height: 600 }, { width: 1000, height: 700 }, constraints);
    expect(tall.y).toBe(12);
  });

  it("re-parks a position saved over the dock to the current default", () => {
    const raw = writeSurfaceLayout("{}", "deviant-controls", { x: 768, y: 588, width: 220, height: 52 });
    expect(readSurfaceLayout(raw, "deviant-controls", { x: 768, y: 44, width: 220, height: 52 }, viewport, constraints))
      .toEqual({ x: 768, y: 44, width: 220, height: 52 });
    // A saved position clear of the lane survives untouched.
    const clear = writeSurfaceLayout("{}", "deviant-controls", { x: 768, y: 44, width: 220, height: 52 });
    expect(readSurfaceLayout(clear, "deviant-controls", { x: 12, y: 12, width: 220, height: 52 }, viewport, constraints))
      .toEqual({ x: 768, y: 44, width: 220, height: 52 });
  });
});
