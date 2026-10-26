import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";

export const MAX_CONCURRENT_TRACERS = 1;
const SELECTABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="slider"], [tabindex]:not([tabindex="-1"])';

export type TracerOrigin = "left" | "center" | "right";

export function tracerDurationMs(width: number, height: number): number {
  const perimeter = Math.max(0, 2 * (width + height));
  return Math.round(Math.min(2_000, Math.max(1_500, 1_500 + ((perimeter - 120) / 2_880) * 500)));
}

export function tracerOriginFor(justifyContent: string, textAlign: string): TracerOrigin {
  if (/flex-start|start|left/.test(justifyContent)) return "left";
  if (/flex-end|end|right/.test(justifyContent)) return "right";
  if (/center/.test(justifyContent)) return "center";
  if (/start|left/.test(textAlign)) return "left";
  if (/end|right/.test(textAlign)) return "right";
  return "center";
}

interface TracerView {
  key: number;
  target: HTMLElement;
  origin: TracerOrigin;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: string;
  duration: number;
}

function targetFrom(value: EventTarget | null): HTMLElement | null {
  if (!(value instanceof Element)) return null;
  const target = value.closest<HTMLElement>(SELECTABLE);
  if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return null;
  return target;
}

export function DeviantTracer() {
  const safeMotion = useAppSettingsStore((state) => state.values[SETTINGS.SAFE_MOTION_ENABLED] === "true");
  const reducedFlash = useAppSettingsStore((state) => state.values[SETTINGS.REDUCED_FLASH_ENABLED] === "true");
  const [osReduced, setOsReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [view, setView] = useState<TracerView | null>(null);
  const activeTarget = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    activeTarget.current = null;
    setView(null);
  }, []);

  const ignite = useCallback((target: HTMLElement) => {
    if (safeMotion || reducedFlash || osReduced || activeTarget.current === target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    clear();
    const style = getComputedStyle(target);
    const duration = tracerDurationMs(rect.width, rect.height);
    activeTarget.current = target;
    setView({
      key: ++sequence.current,
      target,
      origin: tracerOriginFor(style.justifyContent, style.textAlign),
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      radius: style.borderRadius || "0px",
      duration,
    });
    timer.current = setTimeout(clear, duration + 80);
  }, [clear, osReduced, reducedFlash, safeMotion]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const change = () => setOsReduced(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);

  useEffect(() => {
    if (safeMotion || reducedFlash || osReduced) { clear(); return undefined; }
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = targetFrom(event.target);
      if (target) ignite(target);
    };
    const pointerOut = (event: PointerEvent) => {
      const target = activeTarget.current;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      clear();
    };
    const focusIn = (event: FocusEvent) => { const target = targetFrom(event.target); if (target) ignite(target); };
    const focusOut = (event: FocusEvent) => {
      const target = activeTarget.current;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      clear();
    };
    const pointerDown = (event: PointerEvent) => { if (event.pointerType === "touch") { const target = targetFrom(event.target); if (target) ignite(target); } };
    document.addEventListener("pointerover", pointerOver);
    document.addEventListener("pointerout", pointerOut);
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("pointerover", pointerOver);
      document.removeEventListener("pointerout", pointerOut);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, [clear, ignite, osReduced, reducedFlash, safeMotion]);

  if (!view || !view.target.isConnected) return null;
  const style = {
    left: view.x,
    top: view.y,
    width: view.width,
    height: view.height,
    borderRadius: view.radius,
    "--dd-tracer-width": `${view.width}px`,
    "--dd-tracer-height": `${view.height}px`,
    "--dd-tracer-half-width": `${view.width / 2}px`,
    "--dd-tracer-duration": `${view.duration}ms`,
  } as CSSProperties;
  return <div key={view.key} aria-hidden="true" data-origin={view.origin} style={style} className="deviant-tracer">
    <span className="deviant-spark deviant-spark--forward" />
    <span className="deviant-spark deviant-spark--reverse" />
  </div>;
}
