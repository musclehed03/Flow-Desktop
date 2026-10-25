import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../lib/i18n";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { GlobalTooltip, tooltipTextFor } from "./GlobalTooltip";

const original = useAppSettingsStore.getState().values;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { useAppSettingsStore.setState({ values: original }); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("global tooltip", () => {
  it("caps generated labels at eight words", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "one two three four five six seven eight nine ten");
    expect(tooltipTextFor(button)).toBe("one two three four five six seven eight…");
  });

  it("opens after the delay, connects aria-describedby, and dismisses on Escape", async () => {
    vi.useFakeTimers();
    useAppSettingsStore.setState({ values: { ...original, [SETTINGS.TOOLTIPS_ENABLED]: "true" } });
    const host = document.createElement("div"); document.body.appendChild(host);
    const button = document.createElement("button"); button.setAttribute("aria-label", "Play"); button.setAttribute("title", "Play"); button.dataset.playerControl = "play-pause"; host.appendChild(button);
    const reactHost = document.createElement("div"); document.body.appendChild(reactHost);
    const root = createRoot(reactHost);
    await act(async () => root.render(createElement(GlobalTooltip)));
    await act(async () => button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(400));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Play");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("K");
    expect(button.getAttribute("aria-describedby")).toContain("flow-global-tooltip");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(button.getAttribute("title")).toBe("Play");
    await act(async () => root.unmount());
  });

  it("stays disabled when the preference is off", async () => {
    vi.useFakeTimers();
    useAppSettingsStore.setState({ values: { ...original, [SETTINGS.TOOLTIPS_ENABLED]: "false" } });
    const button = document.createElement("button"); button.setAttribute("aria-label", "Play"); document.body.appendChild(button);
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(GlobalTooltip)));
    await act(async () => button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    await act(async () => root.unmount());
  });
});
