import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getString } from "../../lib/i18n/index";
import { defaultAudioProcessingConfig } from "../../lib/audio/eqConfig";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { EqPanel } from "./EqPanel";

vi.mock("../../lib/api/db", () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => undefined) }));
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

it("keeps the Deviants dynamics, per-device save and playback tools in the quick panel", async () => {
  useMusicPlayerStore.setState({ audioProcessing: defaultAudioProcessingConfig(), eqEnabled: false });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(EqPanel, { open: true, onClose: vi.fn() })));
  // Upstream EQ base: response graph, preset chips and bass boost.
  expect(document.body.textContent).toContain(getString("music_equalizer"));
  expect(document.body.textContent).toContain(getString("eq_bass_boost"));
  // Deviants dynamics stage: preamp + balance sliders with plain-language explainers.
  expect(document.body.textContent).toContain(getString("eq_dynamics"));
  expect(document.querySelector(`[aria-label="${getString("eq_preamp")}"]`)).not.toBeNull();
  expect(document.querySelector(`[aria-label="${getString("eq_balance")}"]`)).not.toBeNull();
  expect(document.body.textContent).toContain(getString("eq_preamp_desc"));
  // Deviants playback tools and per-device profile save.
  expect(document.body.textContent).toContain(getString("eq_playback_tools"));
  expect(document.body.textContent).toContain(getString("settings_skip_silence"));
  expect(document.body.textContent).toContain(getString("eq_save_device"));
  await act(async () => root.unmount());
});

it("reveals the compressor controls when the compressor is switched on", async () => {
  const processing = defaultAudioProcessingConfig();
  processing.dynamics.compressorEnabled = true;
  useMusicPlayerStore.setState({ audioProcessing: processing, eqEnabled: false });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(EqPanel, { open: true, onClose: vi.fn() })));
  expect(document.querySelector(`[aria-label="${getString("eq_threshold")}"]`)).not.toBeNull();
  expect(document.querySelector(`[aria-label="${getString("eq_ratio")}"]`)).not.toBeNull();
  expect(document.querySelector(`[aria-label="${getString("eq_attack")}"]`)).not.toBeNull();
  expect(document.querySelector(`[aria-label="${getString("eq_release")}"]`)).not.toBeNull();
  await act(async () => root.unmount());
});

it("closes on a click outside it, not on a click inside it (fixes batch #18)", async () => {
  useMusicPlayerStore.setState({ audioProcessing: defaultAudioProcessingConfig(), eqEnabled: false });
  const onClose = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(EqPanel, { open: true, onClose })));
  // A click on a control inside the panel leaves it open.
  const preamp = document.querySelector(`[aria-label="${getString("eq_preamp")}"]`)!;
  await act(async () => { preamp.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  expect(onClose).not.toHaveBeenCalled();
  // A click anywhere else — back to the library, the queue — closes it.
  await act(async () => { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
