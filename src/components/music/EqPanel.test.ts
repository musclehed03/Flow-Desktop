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

it("uses a dockable live panel with synchronized graphic controls and explainers", async () => {
  useMusicPlayerStore.setState({ audioProcessing: defaultAudioProcessingConfig(), eqEnabled: false });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(EqPanel, { open: true, onClose: vi.fn(), triggerRef: { current: null } })));
  expect(document.querySelector('[data-dockable-panel="equalizer-editor"]')).not.toBeNull();
  const button31 = [...document.querySelectorAll("button")].find((button) => button.textContent === "31")!;
  await act(async () => button31.click());
  expect(document.querySelectorAll(`[aria-label$="${getString("eq_slider")}"]`)).toHaveLength(31);
  expect(document.querySelectorAll(`[aria-label$="${getString("eq_dial")}"]`)).toHaveLength(31);
  expect([...document.querySelectorAll<HTMLInputElement>('input[type="number"]')].filter((input) => input.getAttribute("aria-label") !== getString("eq_gain_db"))).toHaveLength(31);
  expect(document.body.textContent).toContain(getString("eq_band_control_desc"));
  await act(async () => root.unmount());
});
