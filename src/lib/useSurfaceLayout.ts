import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SETTINGS } from "./settings/schema";
import { usePreference } from "./usePreference";
import { getSettingValue } from "../store/useAppSettingsStore";
import { clampSurfaceLayout, readSurfaceLayout, snapSurfaceLayout, writeSurfaceLayout, type SurfaceConstraints, type SurfaceLayout } from "./surfaceLayout";

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

export function useSurfaceLayout(id: string, makeDefault: () => SurfaceLayout, constraints: SurfaceConstraints, snap = false) {
  const [, saveRaw] = usePreference(SETTINGS.PLAYER_SURFACE_LAYOUTS);
  const [layout, setLayout] = useState(() => readSurfaceLayout(getSettingValue(SETTINGS.PLAYER_SURFACE_LAYOUTS), id, makeDefault(), viewport(), constraints));
  const layoutRef = useRef(layout);
  const dragged = useRef(false);
  layoutRef.current = layout;

  const persist = useCallback((next: SurfaceLayout) => {
    const value = clampSurfaceLayout(next, viewport(), constraints);
    layoutRef.current = value; setLayout(value);
    saveRaw(writeSurfaceLayout(getSettingValue(SETTINGS.PLAYER_SURFACE_LAYOUTS), id, value));
  }, [constraints, id, saveRaw]);

  useEffect(() => {
    const resize = () => persist(layoutRef.current);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [persist]);

  const beginMove = (event: ReactPointerEvent, threshold = 0) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, layout: layoutRef.current };
    dragged.current = false;
    const update = (pointer: PointerEvent) => {
      const dx = pointer.clientX - start.x; const dy = pointer.clientY - start.y;
      if (!dragged.current && Math.hypot(dx, dy) < threshold) return;
      dragged.current = true;
      const next = clampSurfaceLayout({ ...start.layout, x: start.layout.x + dx, y: start.layout.y + dy }, viewport(), constraints);
      layoutRef.current = next; setLayout(next);
    };
    const finish = () => {
      window.removeEventListener("pointermove", update); window.removeEventListener("pointerup", finish);
      persist(snap && dragged.current ? snapSurfaceLayout(layoutRef.current, viewport(), constraints) : layoutRef.current);
    };
    window.addEventListener("pointermove", update); window.addEventListener("pointerup", finish, { once: true });
  };

  const beginResize = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, layout: layoutRef.current };
    const update = (pointer: PointerEvent) => {
      const next = clampSurfaceLayout({ ...start.layout, width: start.layout.width + pointer.clientX - start.x, height: start.layout.height + pointer.clientY - start.y }, viewport(), constraints);
      layoutRef.current = next; setLayout(next);
    };
    const finish = () => { window.removeEventListener("pointermove", update); window.removeEventListener("pointerup", finish); persist(layoutRef.current); };
    window.addEventListener("pointermove", update); window.addEventListener("pointerup", finish, { once: true });
  };

  const reset = () => persist(makeDefault());
  const keyboardMove = (event: React.KeyboardEvent) => {
    const amount = event.shiftKey ? 20 : 5;
    const dx = event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0;
    const dy = event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    persist({ ...layoutRef.current, x: layoutRef.current.x + dx, y: layoutRef.current.y + dy });
  };
  const keyboardResize = (event: React.KeyboardEvent) => {
    const amount = event.shiftKey ? 20 : 5;
    const width = layoutRef.current.width + (event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0);
    const height = layoutRef.current.height + (event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0);
    if (width === layoutRef.current.width && height === layoutRef.current.height) return;
    event.preventDefault();
    persist({ ...layoutRef.current, width, height });
  };
  const consumeDragged = () => { const value = dragged.current; dragged.current = false; return value; };
  return { layout, beginMove, beginResize, keyboardMove, keyboardResize, reset, consumeDragged };
}
