import { describe, expect, it } from "vitest";
import { clampSurfaceLayout, readSurfaceLayout, snapSurfaceLayout, writeSurfaceLayout } from "./surfaceLayout";

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
});
