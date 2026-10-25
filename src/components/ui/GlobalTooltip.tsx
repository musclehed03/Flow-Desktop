import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";

const TOOLTIP_ID = "flow-global-tooltip";
const HOVER_DELAY_MS = 400;
const TOUCH_DELAY_MS = 650;
const TOUCH_VISIBLE_MS = 2_500;
const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="slider"], [role="separator"][tabindex], [tabindex]:not([tabindex="-1"])';

function eightWords(value: string): string {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return words.length <= 8 ? words.join(" ") : `${words.slice(0, 8).join(" ")}…`;
}

function labelledText(target: HTMLElement): string {
  const labelledBy = target.getAttribute("aria-labelledby");
  if (labelledBy) {
    const value = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (value) return value;
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
    const label = target.labels?.[0]?.textContent?.trim();
    if (label) return label;
    if ("placeholder" in target && target.placeholder) return target.placeholder;
  }
  return target.textContent?.trim() ?? "";
}

export function tooltipTextFor(target: HTMLElement): string {
  const value = target.dataset.tooltip
    || target.getAttribute("aria-label")
    || target.getAttribute("title")
    || labelledText(target);
  return eightWords(value || "");
}

function interactiveTarget(value: EventTarget | null): HTMLElement | null {
  if (!(value instanceof Element)) return null;
  const target = value.closest<HTMLElement>(INTERACTIVE);
  if (!target || target.dataset.tooltipDisabled === "true") return null;
  return target;
}

function shortcutKey(target: HTMLElement): string | null {
  const control = target.dataset.playerControl
    || target.closest<HTMLElement>("[data-player-control]")?.dataset.playerControl;
  const keys: Record<string, string> = {
    "play-pause": "playPause",
    previous: "previous",
    next: "next",
    seek: "seek",
    "volume-mute": "mute",
    volume: "volume",
    fullscreen: "fullscreen",
    pip: "pip",
    captions: "captions",
    "mini-player": "miniPlayer",
  };
  if (control) return keys[control] ?? null;
  if (target.matches("[data-progress-track]")) return "seek";
  return null;
}

interface TooltipView {
  text: string;
  detail: string | null;
  shortcut: string | null;
  left: number;
  top: number;
  below: boolean;
}

interface TooltipSession {
  target: HTMLElement;
  text: string;
  title: string | null;
  describedBy: string | null;
  shown: boolean;
}

export function GlobalTooltip() {
  const { t } = useTranslation("settings");
  const enabled = useAppSettingsStore((state) => state.values[SETTINGS.TOOLTIPS_ENABLED] !== "false");
  const [view, setView] = useState<TooltipView | null>(null);
  const session = useRef<TooltipSession | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null; hideTimer.current = null;
    const current = session.current;
    if (current) {
      if (current.title !== null) current.target.setAttribute("title", current.title);
      if (current.shown) {
        if (current.describedBy) current.target.setAttribute("aria-describedby", current.describedBy);
        else current.target.removeAttribute("aria-describedby");
      }
    }
    session.current = null;
    setView(null);
  }, []);

  const show = useCallback((current: TooltipSession, touch: boolean) => {
    if (session.current !== current || !current.target.isConnected) return;
    const text = current.text;
    if (!text) { clear(); return; }
    const rect = current.target.getBoundingClientRect();
    const describedBy = current.describedBy ? `${current.describedBy} ${TOOLTIP_ID}` : TOOLTIP_ID;
    current.target.setAttribute("aria-describedby", describedBy);
    current.shown = true;
    const control = shortcutKey(current.target);
    const translatedShortcut = control ? t(`sensory.tooltips.shortcuts.${control}`) : "";
    setView({
      text,
      detail: current.target.dataset.tooltipDetail
        || current.target.closest<HTMLElement>("[data-tooltip-detail]")?.dataset.tooltipDetail
        || null,
      shortcut: translatedShortcut || null,
      left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
      top: rect.top < 88 ? rect.bottom + 8 : rect.top - 8,
      below: rect.top < 88,
    });
    if (touch) hideTimer.current = setTimeout(clear, TOUCH_VISIBLE_MS);
  }, [clear, t]);

  const schedule = useCallback((target: HTMLElement, delay: number, touch = false) => {
    if (session.current?.target === target) return;
    clear();
    const text = tooltipTextFor(target);
    if (!text) return;
    const title = target.getAttribute("title");
    const current: TooltipSession = {
      target,
      text,
      title,
      describedBy: target.getAttribute("aria-describedby"),
      shown: false,
    };
    if (title !== null) target.removeAttribute("title");
    session.current = current;
    showTimer.current = setTimeout(() => show(current, touch), delay);
  }, [clear, show]);

  useEffect(() => {
    if (!enabled) { clear(); return undefined; }
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = interactiveTarget(event.target);
      if (target) schedule(target, HOVER_DELAY_MS);
    };
    const pointerOut = (event: PointerEvent) => {
      const current = session.current?.target;
      if (!current) return;
      if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
      clear();
    };
    const focusIn = (event: FocusEvent) => { const target = interactiveTarget(event.target); if (target) schedule(target, HOVER_DELAY_MS); };
    const focusOut = (event: FocusEvent) => {
      const current = session.current?.target;
      if (!current || (event.relatedTarget instanceof Node && current.contains(event.relatedTarget))) return;
      clear();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = interactiveTarget(event.target);
      if (target) schedule(target, TOUCH_DELAY_MS, true);
    };
    const pointerUp = () => { if (session.current && !session.current.shown) clear(); };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    document.addEventListener("pointerover", pointerOver);
    document.addEventListener("pointerout", pointerOut);
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("pointerup", pointerUp);
    document.addEventListener("pointercancel", pointerUp);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("pointerover", pointerOver);
      document.removeEventListener("pointerout", pointerOut);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("pointercancel", pointerUp);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, [clear, enabled, schedule]);

  if (!view) return null;
  const style = {
    left: view.left,
    top: view.top,
    transform: view.below ? "translateX(-50%)" : "translate(-50%, -100%)",
  } satisfies CSSProperties;
  return createPortal(
    <div id={TOOLTIP_ID} role="tooltip" style={style} className="pointer-events-none fixed z-[900] max-w-xs rounded-lg border-2 border-outline-variant bg-surface-container-highest px-3 py-2 text-center text-xs text-on-surface">
      <span className="font-semibold">{view.text}</span>
      {view.shortcut && <kbd className="ml-2 rounded border-2 border-outline-variant px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">{view.shortcut}</kbd>}
      {view.detail && <span className="mt-1 block text-on-surface-variant">{view.detail}</span>}
    </div>,
    document.body,
  );
}
