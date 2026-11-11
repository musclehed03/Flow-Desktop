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
      x: 1104,
      y: 0,
      width: 900,
      height: 776,
      collapsed: false,
    });
  });

  it("lets a floating panel sit mostly off-viewport but keeps a grab strip visible", () => {
    // Fixes batch #3: panels may be pushed past the app footprint; 96px stays
    // on screen so the panel can always be dragged back, and the header (y >= 0)
    // never leaves the top edge.
    const offRight = clampPanelLayout({ placement: "floating", x: 1150, y: 100, width: 400, height: 500 }, viewport);
    expect(offRight.x).toBe(1104);
    const offLeft = clampPanelLayout({ placement: "floating", x: -500, y: 100, width: 400, height: 500 }, viewport);
    expect(offLeft.x).toBe(-304);
    const offTop = clampPanelLayout({ placement: "floating", x: 100, y: -500, width: 400, height: 500 }, viewport);
    expect(offTop.y).toBe(0);
  });

  it("keeps the collapsed flag through clamp and read", () => {
    expect(clampPanelLayout({ placement: "floating", x: 100, y: 100, width: 400, height: 500, collapsed: true }, viewport).collapsed).toBe(true);
    const raw = JSON.stringify({ theme: { placement: "floating", x: 100, y: 100, width: 400, height: 500, collapsed: true } });
    expect(readPanelLayout(raw, "theme", viewport).collapsed).toBe(true);
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
