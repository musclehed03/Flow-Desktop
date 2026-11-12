import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getString } from "../../lib/i18n/index";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { DockablePanel } from "./DockablePanel";

vi.mock("../../lib/api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const original = useAppSettingsStore.getState().values;

afterEach(() => {
  useAppSettingsStore.setState({ values: original });
  document.body.replaceChildren();
});

it("is non-modal, persists placement, and returns focus to its opener on Escape", async () => {
  const host = document.createElement("div");
  const opener = document.createElement("button");
  document.body.append(opener, host);
  opener.focus();
  const openerRef = { current: opener };
  const onClose = vi.fn();
  const root = createRoot(host);

  await act(async () => root.render(createElement(DockablePanel, {
    panelId: "test-editor",
    title: "Editor",
    openerRef,
    onClose,
    onUndo: vi.fn(),
    onReset: vi.fn(),
    canUndo: false,
    children: createElement("input", { "aria-label": "Live field" }),
  })));

  const panel = document.querySelector<HTMLElement>('[data-dockable-panel="test-editor"]')!;
  expect(panel.getAttribute("aria-modal")).toBe("false");
  expect(panel.dataset.panelPlacement).toBe("dock-right");

  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${getString("panel_dock_left")}"]`)!.click());
  expect(panel.dataset.panelPlacement).toBe("dock-left");
  expect(JSON.parse(useAppSettingsStore.getState().values[SETTINGS.EDITOR_PANEL_LAYOUTS] ?? "{}")["test-editor"].placement).toBe("dock-left");

  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await act(async () => Promise.resolve());
  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(opener);
  await act(async () => root.unmount());
});

it("closes a floating panel on a click outside it, and leaves a docked one alone (fixes batch #18)", async () => {
  const renderPanel = async () => {
    const host = document.createElement("div");
    const opener = document.createElement("button");
    document.body.append(opener, host);
    opener.focus();
    const onClose = vi.fn();
    const root = createRoot(host);
    await act(async () => root.render(createElement(DockablePanel, {
      panelId: "test-editor-float",
      title: "Editor",
      openerRef: { current: opener },
      onClose,
      onUndo: vi.fn(),
      onReset: vi.fn(),
      canUndo: false,
      children: createElement("input", { "aria-label": "Live field" }),
    })));
    return { host, root, onClose };
  };

  // Docked (the default): a click on the page behind it does nothing.
  const docked = await renderPanel();
  await act(async () => { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  expect(docked.onClose).not.toHaveBeenCalled();
  await act(async () => docked.root.unmount());

  // Floating: the same click closes it, so the X is never the only way out.
  const floating = await renderPanel();
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${getString("panel_float")}"]`)!.click());
  expect(document.querySelector<HTMLElement>('[data-dockable-panel="test-editor-float"]')!.dataset.panelPlacement).toBe("floating");
  await act(async () => { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  expect(floating.onClose).toHaveBeenCalledTimes(1);
  await act(async () => floating.root.unmount());
});
