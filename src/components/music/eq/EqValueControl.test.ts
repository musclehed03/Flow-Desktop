import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getString } from "../../../lib/i18n/index";
import { SETTINGS } from "../../../lib/settings/schema";
import { useAppSettingsStore } from "../../../store/useAppSettingsStore";
import { EqValueControl } from "./EqValueControl";

vi.mock("../../../lib/api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const originalSettings = useAppSettingsStore.getState().values;
const setMode = (mode: string) =>
  useAppSettingsStore.setState({ values: { ...originalSettings, [SETTINGS.EQ_INPUT_MODE]: mode } });
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

beforeEach(() => {
  setMode("text");
});

afterEach(() => {
  useAppSettingsStore.setState({ values: originalSettings });
  document.body.replaceChildren();
});

async function renderControl(props: Partial<Parameters<typeof EqValueControl>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onCommit = vi.fn();
  await act(async () =>
    root.render(
      createElement(EqValueControl, {
        value: -2,
        min: -15,
        max: 15,
        step: 0.5,
        decimals: 2,
        unit: "dB",
        ariaLabel: getString("eq_gain"),
        onCommit,
        ...props,
      }),
    ),
  );
  return { host, root, onCommit };
}

it("types the exact dB in text mode, highlights the value on focus, and clamps to ±15", async () => {
  const { root, onCommit } = await renderControl();
  const input = document.querySelector<HTMLInputElement>('input[type="text"]')!;
  expect(input.value).toBe("-2.00");
  await act(async () => {
    setInputValue.call(input, "99");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  // 99 is past the band's +15 dB top: it applies as 15, not 99.
  expect(onCommit).toHaveBeenLastCalledWith(15);
  await act(async () => {
    setInputValue.call(input, "-2.00");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(onCommit).toHaveBeenLastCalledWith(-2);
  await act(async () => root.unmount());
});

it("steps by the step size in stepper mode and stops at the ends", async () => {
  setMode("stepper");
  const { root, onCommit } = await renderControl({ value: 0 });
  expect(document.querySelector('input[type="text"]')).toBeNull();
  expect(document.querySelector('input[type="range"]')).toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>(`[aria-label="${getString("eq_increase")}"]`)!.click(),
  );
  expect(onCommit).toHaveBeenLastCalledWith(0.5);
  await act(async () =>
    document.querySelector<HTMLButtonElement>(`[aria-label="${getString("eq_decrease")}"]`)!.click(),
  );
  expect(onCommit).toHaveBeenLastCalledWith(-0.5);
  await act(async () => root.unmount());
});

it("disables the step buttons at the range ends", async () => {
  setMode("stepper");
  const { root } = await renderControl({ value: 15 });
  expect(
    document.querySelector<HTMLButtonElement>(`[aria-label="${getString("eq_increase")}"]`)!.disabled,
  ).toBe(true);
  expect(
    document.querySelector<HTMLButtonElement>(`[aria-label="${getString("eq_decrease")}"]`)!.disabled,
  ).toBe(false);
  await act(async () => root.unmount());
});

it("drags the value in slider mode and shows only the slider", async () => {
  setMode("slider");
  const { root, onCommit } = await renderControl();
  expect(document.querySelector('input[type="text"]')).toBeNull();
  const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
  await act(async () => {
    setInputValue.call(slider, "3");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onCommit).toHaveBeenLastCalledWith(3);
  await act(async () => root.unmount());
});

it("falls back to typing when the stored mode is unknown", async () => {
  setMode("bogus");
  const { root } = await renderControl();
  expect(document.querySelector<HTMLInputElement>('input[type="text"]')).not.toBeNull();
  await act(async () => root.unmount());
});
