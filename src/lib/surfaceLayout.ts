export interface SurfaceLayout { x: number; y: number; width: number; height: number }
export interface SurfaceViewport { width: number; height: number }
export interface SurfaceConstraints { minWidth: number; minHeight: number; margin?: number; maxWidth?: number; maxHeight?: number }

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * The music dock's lane (fixes batch #17): GlobalMusicDock is fixed bottom-6
 * (24px) and 72px tall, so its top edge sits 96px up from the viewport bottom.
 * Floating surfaces keep 12px clear of it and never rest on it — a surface
 * parked over the dock covers the dock's right end, and the dock in turn
 * covers the last row of page content. The lane is reserved even when the
 * dock is hidden, because it appears the moment music plays.
 */
export const SURFACE_DOCK_KEEP_OUT = 96 + 12;

/** True when the rect's bottom edge dips into the dock's lane. */
export function intersectsDockBand(layout: SurfaceLayout, viewport: SurfaceViewport): boolean {
  return layout.y + layout.height > viewport.height - SURFACE_DOCK_KEEP_OUT;
}

export function clampSurfaceLayout(layout: SurfaceLayout, viewport: SurfaceViewport, constraints: SurfaceConstraints): SurfaceLayout {
  const margin = constraints.margin ?? 12;
  const availableWidth = Math.max(1, viewport.width - margin * 2);
  const availableHeight = Math.max(1, viewport.height - margin * 2);
  const minWidth = Math.min(constraints.minWidth, availableWidth);
  const minHeight = Math.min(constraints.minHeight, availableHeight);
  const width = Math.min(constraints.maxWidth ?? availableWidth, availableWidth, Math.max(minWidth, finite(layout.width, minWidth)));
  const height = Math.min(constraints.maxHeight ?? availableHeight, availableHeight, Math.max(minHeight, finite(layout.height, minHeight)));
  let y = Math.min(Math.max(margin, finite(layout.y, margin)), Math.max(margin, viewport.height - height - margin));
  // Lift a surface out of the dock's lane when there is room above it; on a
  // viewport too short to hold the surface clear, the plain clamp above wins
  // and the surface stays reachable instead of being pushed off-screen.
  const dockTop = viewport.height - SURFACE_DOCK_KEEP_OUT;
  if (height <= dockTop - margin && y + height > dockTop) y = dockTop - height;
  return {
    x: Math.min(Math.max(margin, finite(layout.x, margin)), Math.max(margin, viewport.width - width - margin)),
    y,
    width,
    height,
  };
}

export function snapSurfaceLayout(layout: SurfaceLayout, viewport: SurfaceViewport, constraints: SurfaceConstraints): SurfaceLayout {
  const value = clampSurfaceLayout(layout, viewport, constraints);
  const margin = constraints.margin ?? 12;
  const leftDistance = value.x - margin;
  const rightX = viewport.width - value.width - margin;
  return { ...value, x: leftDistance <= rightX - value.x ? margin : rightX };
}

function parse(raw: string): Record<string, SurfaceLayout> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, SurfaceLayout> : {};
  } catch { return {}; }
}

export function readSurfaceLayout(raw: string, id: string, fallback: SurfaceLayout, viewport: SurfaceViewport, constraints: SurfaceConstraints): SurfaceLayout {
  const saved = parse(raw)[id];
  if (!saved || typeof saved !== "object") return clampSurfaceLayout(fallback, viewport, constraints);
  const stored = {
    x: finite(saved.x, fallback.x), y: finite(saved.y, fallback.y),
    width: finite(saved.width, fallback.width), height: finite(saved.height, fallback.height),
  };
  // A position saved before the dock lane existed can sit parked over the dock
  // (the old bottom-right default did). It re-parks to the current default
  // instead of just lifting — the lift would leave it over the last row of
  // page content, which is the overlap the default move exists to fix.
  if (intersectsDockBand(stored, viewport)) return clampSurfaceLayout(fallback, viewport, constraints);
  return clampSurfaceLayout(stored, viewport, constraints);
}

export function writeSurfaceLayout(raw: string, id: string, layout: SurfaceLayout): string {
  return JSON.stringify({ ...parse(raw), [id]: layout });
}
