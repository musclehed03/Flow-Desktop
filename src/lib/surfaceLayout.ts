export interface SurfaceLayout { x: number; y: number; width: number; height: number }
export interface SurfaceViewport { width: number; height: number }
export interface SurfaceConstraints { minWidth: number; minHeight: number; margin?: number; maxWidth?: number; maxHeight?: number }

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function clampSurfaceLayout(layout: SurfaceLayout, viewport: SurfaceViewport, constraints: SurfaceConstraints): SurfaceLayout {
  const margin = constraints.margin ?? 12;
  const availableWidth = Math.max(1, viewport.width - margin * 2);
  const availableHeight = Math.max(1, viewport.height - margin * 2);
  const minWidth = Math.min(constraints.minWidth, availableWidth);
  const minHeight = Math.min(constraints.minHeight, availableHeight);
  const width = Math.min(constraints.maxWidth ?? availableWidth, availableWidth, Math.max(minWidth, finite(layout.width, minWidth)));
  const height = Math.min(constraints.maxHeight ?? availableHeight, availableHeight, Math.max(minHeight, finite(layout.height, minHeight)));
  return {
    x: Math.min(Math.max(margin, finite(layout.x, margin)), Math.max(margin, viewport.width - width - margin)),
    y: Math.min(Math.max(margin, finite(layout.y, margin)), Math.max(margin, viewport.height - height - margin)),
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
  return clampSurfaceLayout({
    x: finite(saved.x, fallback.x), y: finite(saved.y, fallback.y),
    width: finite(saved.width, fallback.width), height: finite(saved.height, fallback.height),
  }, viewport, constraints);
}

export function writeSurfaceLayout(raw: string, id: string, layout: SurfaceLayout): string {
  return JSON.stringify({ ...parse(raw), [id]: layout });
}
