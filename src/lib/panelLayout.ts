export type PanelPlacement = "dock-left" | "dock-right" | "floating";
export type PanelResizeEdge = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface PanelLayout {
  placement: PanelPlacement;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelViewport { width: number; height: number }

export const PANEL_MIN_WIDTH = 320;
export const PANEL_MIN_HEIGHT = 280;
const PANEL_MARGIN = 12;

export function createDefaultPanelLayout(viewport: PanelViewport): PanelLayout {
  const width = Math.min(420, Math.max(PANEL_MIN_WIDTH, viewport.width - PANEL_MARGIN * 2));
  const height = Math.min(720, Math.max(PANEL_MIN_HEIGHT, viewport.height - PANEL_MARGIN * 2));
  return {
    placement: "dock-right",
    x: Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN),
    y: PANEL_MARGIN,
    width,
    height,
  };
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validPlacement(value: unknown): value is PanelPlacement {
  return value === "dock-left" || value === "dock-right" || value === "floating";
}

export function clampPanelLayout(layout: PanelLayout, viewport: PanelViewport): PanelLayout {
  const maxWidth = Math.max(PANEL_MIN_WIDTH, viewport.width - PANEL_MARGIN * 2);
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, viewport.height - PANEL_MARGIN * 2);
  const width = Math.min(maxWidth, Math.max(PANEL_MIN_WIDTH, finite(layout.width, PANEL_MIN_WIDTH)));
  const height = Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, finite(layout.height, PANEL_MIN_HEIGHT)));
  return {
    placement: validPlacement(layout.placement) ? layout.placement : "dock-right",
    x: Math.min(Math.max(PANEL_MARGIN, finite(layout.x, PANEL_MARGIN)), Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN)),
    y: Math.min(Math.max(PANEL_MARGIN, finite(layout.y, PANEL_MARGIN)), Math.max(PANEL_MARGIN, viewport.height - height - PANEL_MARGIN)),
    width,
    height,
  };
}

function parsePanelLayouts(raw: string): Record<string, PanelLayout> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, PanelLayout>;
  } catch {
    return {};
  }
}

export function readPanelLayout(raw: string, panelId: string, viewport: PanelViewport): PanelLayout {
  const fallback = createDefaultPanelLayout(viewport);
  const value = parsePanelLayouts(raw)[panelId];
  if (!value || typeof value !== "object") return fallback;
  return clampPanelLayout({
    placement: validPlacement(value.placement) ? value.placement : fallback.placement,
    x: finite(value.x, fallback.x),
    y: finite(value.y, fallback.y),
    width: finite(value.width, fallback.width),
    height: finite(value.height, fallback.height),
  }, viewport);
}

export function writePanelLayout(raw: string, panelId: string, layout: PanelLayout): string {
  return JSON.stringify({ ...parsePanelLayouts(raw), [panelId]: layout });
}

export function movePanelLayout(layout: PanelLayout, deltaX: number, deltaY: number, viewport: PanelViewport): PanelLayout {
  if (layout.placement !== "floating") return layout;
  return clampPanelLayout({ ...layout, x: layout.x + deltaX, y: layout.y + deltaY }, viewport);
}

export function resizePanelLayout(layout: PanelLayout, edge: PanelResizeEdge, deltaX: number, deltaY: number, viewport: PanelViewport): PanelLayout {
  if (layout.placement !== "floating") return layout;
  let { x, y, width, height } = layout;
  if (edge.includes("right")) width += deltaX;
  if (edge.includes("bottom")) height += deltaY;
  if (edge.includes("left")) { x += deltaX; width -= deltaX; }
  if (edge.includes("top")) { y += deltaY; height -= deltaY; }
  if (width < PANEL_MIN_WIDTH) { if (edge.includes("left")) x -= PANEL_MIN_WIDTH - width; width = PANEL_MIN_WIDTH; }
  if (height < PANEL_MIN_HEIGHT) { if (edge.includes("top")) y -= PANEL_MIN_HEIGHT - height; height = PANEL_MIN_HEIGHT; }
  return clampPanelLayout({ ...layout, x, y, width, height }, viewport);
}
