import { describe, expect, it } from "vitest";
import {
  clampPanelLayout,
  createDefaultPanelLayout,
  movePanelLayout,
  readPanelLayout,
  resizePanelLayout,
  writePanelLayout,
} from "./panelLayout";

const viewport = { width: 1200, height: 800 };

describe("dockable panel layout", () => {
  it("falls back for malformed settings and keeps a floating panel on screen", () => {
    expect(readPanelLayout("not-json", "theme", viewport)).toEqual(createDefaultPanelLayout(viewport));
    expect(clampPanelLayout({ placement: "floating", x: 3000, y: -50, width: 900, height: 900 }, viewport)).toEqual({
      placement: "floating",
      x: 288,
      y: 12,
      width: 900,
      height: 776,
    });
  });

  it("moves floating panels but leaves docked panels anchored", () => {
    const floating = { placement: "floating" as const, x: 100, y: 100, width: 400, height: 500 };
    expect(movePanelLayout(floating, 50, -30, viewport)).toMatchObject({ x: 150, y: 70 });
    expect(movePanelLayout({ ...floating, placement: "dock-right" }, 50, -30, viewport)).toEqual({ ...floating, placement: "dock-right" });
  });

  it.each([
    ["right", 80, 0, { width: 480 }],
    ["left", 80, 0, { x: 180, width: 320 }],
    ["bottom", 0, 60, { height: 560 }],
    ["top", 0, 60, { y: 160, height: 440 }],
    ["bottom-right", 80, 60, { width: 480, height: 560 }],
  ] as const)("resizes from the %s edge", (edge, dx, dy, expected) => {
    const layout = { placement: "floating" as const, x: 100, y: 100, width: 400, height: 500 };
    expect(resizePanelLayout(layout, edge, dx, dy, viewport)).toMatchObject(expected);
  });

  it("writes one panel without losing other panel layouts", () => {
    const existing = JSON.stringify({ visualizer: { placement: "dock-left", x: 0, y: 0, width: 380, height: 700 } });
    const next = writePanelLayout(existing, "theme", createDefaultPanelLayout(viewport));
    expect(Object.keys(JSON.parse(next))).toEqual(["visualizer", "theme"]);
  });
});
