import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { GripHorizontal, PanelLeft, PanelRight, PictureInPicture2, RotateCcw, Undo2, X } from "lucide-react";
import { getString } from "../../lib/i18n/index";
import {
  clampPanelLayout,
  movePanelLayout,
  readPanelLayout,
  resizePanelLayout,
  writePanelLayout,
  type PanelLayout,
  type PanelPlacement,
  type PanelResizeEdge,
} from "../../lib/panelLayout";
import { SETTINGS } from "../../lib/settings/schema";
import { usePreference } from "../../lib/usePreference";
import { getSettingValue } from "../../store/useAppSettingsStore";

interface DockablePanelProps {
  panelId: string;
  title: string;
  description?: string;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
  children: ReactNode;
}

const edges: PanelResizeEdge[] = ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-left", "bottom-right"];
const edgeClasses: Record<PanelResizeEdge, string> = {
  top: "left-3 right-3 top-0 h-2 cursor-ns-resize",
  right: "bottom-3 right-0 top-3 w-2 cursor-ew-resize",
  bottom: "bottom-0 left-3 right-3 h-2 cursor-ns-resize",
  left: "bottom-3 left-0 top-3 w-2 cursor-ew-resize",
  "top-left": "left-0 top-0 h-3 w-3 cursor-nwse-resize",
  "top-right": "right-0 top-0 h-3 w-3 cursor-nesw-resize",
  "bottom-left": "bottom-0 left-0 h-3 w-3 cursor-nesw-resize",
  "bottom-right": "bottom-0 right-0 h-3 w-3 cursor-nwse-resize",
};

function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }

export function DockablePanel({ panelId, title, description, openerRef, onClose, onUndo, onReset, canUndo, children }: DockablePanelProps) {
  const [, saveLayouts] = usePreference(SETTINGS.EDITOR_PANEL_LAYOUTS);
  const [layout, setLayout] = useState(() => readPanelLayout(getSettingValue(SETTINGS.EDITOR_PANEL_LAYOUTS), panelId, viewport()));
  const layoutRef = useRef(layout);
  const panelRef = useRef<HTMLElement>(null);
  layoutRef.current = layout;

  const persist = useCallback((next: PanelLayout) => {
    const clamped = clampPanelLayout(next, viewport());
    layoutRef.current = clamped;
    setLayout(clamped);
    saveLayouts(writePanelLayout(getSettingValue(SETTINGS.EDITOR_PANEL_LAYOUTS), panelId, clamped));
  }, [panelId, saveLayouts]);

  const close = useCallback(() => {
    onClose();
    queueMicrotask(() => openerRef.current?.focus());
  }, [onClose, openerRef]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-panel-initial-focus]")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const resize = () => persist(clampPanelLayout(layoutRef.current, viewport()));
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("resize", resize); };
  }, [close, persist]);

  const beginPointerOperation = (event: ReactPointerEvent, operation: "move" | PanelResizeEdge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, layout: layoutRef.current };
    const update = (pointer: PointerEvent) => {
      const dx = pointer.clientX - start.x;
      const dy = pointer.clientY - start.y;
      let next = operation === "move"
        ? movePanelLayout(start.layout, dx, dy, viewport())
        : resizePanelLayout(start.layout, operation, dx, dy, viewport());
      if (operation !== "move" && start.layout.placement !== "floating") {
        const signed = start.layout.placement === "dock-left" ? dx : -dx;
        next = clampPanelLayout({ ...start.layout, width: start.layout.width + signed }, viewport());
      }
      layoutRef.current = next;
      setLayout(next);
    };
    const finish = () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", finish);
      persist(layoutRef.current);
    };
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", finish, { once: true });
  };

  const place = (placement: PanelPlacement) => {
    const next = placement === "floating"
      ? clampPanelLayout({ ...layout, placement, x: Math.max(12, (window.innerWidth - layout.width) / 2), y: Math.max(12, (window.innerHeight - layout.height) / 2) }, viewport())
      : { ...layout, placement };
    persist(next);
  };

  const keyboardResize = (edge: PanelResizeEdge, event: React.KeyboardEvent) => {
    const amount = event.shiftKey ? 20 : 5;
    const dx = event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0;
    const dy = event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    if (layout.placement === "floating") persist(resizePanelLayout(layout, edge, dx, dy, viewport()));
    else persist(clampPanelLayout({ ...layout, width: layout.width + (layout.placement === "dock-left" ? dx : -dx) }, viewport()));
  };

  const style = layout.placement === "floating"
    ? { left: layout.x, top: layout.y, width: layout.width, height: layout.height }
    : { [layout.placement === "dock-left" ? "left" : "right"]: 0, top: 0, bottom: 0, width: layout.width };

  return createPortal(
    <section ref={panelRef} role="dialog" aria-modal="false" aria-labelledby={`${panelId}-panel-title`} data-dockable-panel={panelId} data-panel-placement={layout.placement} data-sensory-essential="true"
      style={style} className="fixed z-[620] flex min-h-0 flex-col border border-outline-variant bg-background text-on-surface">
      <header className="flex shrink-0 items-start gap-2 border-b border-outline-variant bg-surface-container px-3 py-3">
        <button type="button" data-panel-initial-focus aria-label={getString("panel_drag")} title={getString("panel_drag")}
          onPointerDown={(event) => beginPointerOperation(event, "move")}
          onKeyDown={(event) => {
            if (layout.placement !== "floating") return;
            const amount = event.shiftKey ? 20 : 5;
            const dx = event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0;
            const dy = event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0;
            if (dx || dy) { event.preventDefault(); persist(movePanelLayout(layout, dx, dy, viewport())); }
          }}
          className="mt-1 rounded-md p-1 text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><GripHorizontal size={18} /></button>
        <div className="min-w-0 flex-1">
          <h2 id={`${panelId}-panel-title`} className="truncate text-base font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-on-surface-variant">{description}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <button type="button" aria-label={getString("panel_undo")} title={getString("panel_undo")} disabled={!canUndo} onClick={onUndo} className="rounded-md p-2 disabled:opacity-40"><Undo2 size={16} /></button>
          <button type="button" aria-label={getString("panel_reset")} title={getString("panel_reset")} onClick={onReset} className="rounded-md p-2"><RotateCcw size={16} /></button>
          <button type="button" aria-label={getString("panel_dock_left")} title={getString("panel_dock_left")} aria-pressed={layout.placement === "dock-left"} onClick={() => place("dock-left")} className="rounded-md p-2"><PanelLeft size={16} /></button>
          <button type="button" aria-label={getString("panel_float")} title={getString("panel_float")} aria-pressed={layout.placement === "floating"} onClick={() => place("floating")} className="rounded-md p-2"><PictureInPicture2 size={16} /></button>
          <button type="button" aria-label={getString("panel_dock_right")} title={getString("panel_dock_right")} aria-pressed={layout.placement === "dock-right"} onClick={() => place("dock-right")} className="rounded-md p-2"><PanelRight size={16} /></button>
          <button type="button" aria-label={getString("panel_close")} title={getString("panel_close")} onClick={close} className="rounded-md p-2"><X size={17} /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {(layout.placement === "floating" ? edges : [layout.placement === "dock-left" ? "right" : "left"] as PanelResizeEdge[]).map((edge) => (
        <div key={edge} role="separator" tabIndex={0} aria-label={getString(`panel_resize_${edge.replace(/-/g, "_")}` as Parameters<typeof getString>[0])}
          aria-orientation={edge.includes("left") || edge.includes("right") ? "vertical" : "horizontal"}
          onPointerDown={(event) => beginPointerOperation(event, edge)} onKeyDown={(event) => keyboardResize(edge, event)}
          className={`absolute z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${edgeClasses[edge]}`} />
      ))}
    </section>, document.body,
  );
}
