import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerTransportControls, PlayerVolumeControl } from "./SharedPlayerControls";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(element: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
  return host;
}

describe("shared player controls", () => {
  it("keeps transport actions keyboard-labelled and wired", async () => {
    const previous = vi.fn();
    const toggle = vi.fn();
    const next = vi.fn();
    const view = await render(createElement(PlayerTransportControls, {
      isPlaying: false,
      onPrevious: previous,
      onTogglePlay: toggle,
      onNext: next,
      labels: { previous: "Previous", play: "Play", pause: "Pause", next: "Next" },
    }));

    const buttons = view.querySelectorAll<HTMLButtonElement>("button");
    expect([...buttons].map((button) => button.getAttribute("aria-label"))).toEqual([
      "Previous",
      "Play",
      "Next",
    ]);
    await act(async () => buttons.forEach((button) => button.click()));
    expect(previous).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("opens volume for focus and closes it on Escape", async () => {
    const view = await render(createElement(PlayerVolumeControl, {
      volume: 0.75,
      muted: false,
      onToggleMute: vi.fn(),
      onVolumeChange: vi.fn(),
      labels: { mute: "Mute", unmute: "Unmute", volume: "Volume" },
    }));
    const trigger = view.querySelector<HTMLButtonElement>('button[aria-label="Mute"]')!;

    await act(async () => trigger.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(view.querySelector<HTMLInputElement>('input[aria-label="Volume"]')).not.toBeNull();

    await act(async () => document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
