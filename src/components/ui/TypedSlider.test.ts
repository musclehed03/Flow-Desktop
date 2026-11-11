import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { TypedSlider } from "./TypedSlider";

vi.mock("../../lib/api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

async function renderSlider(props: Partial<Parameters<typeof TypedSlider>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onCommit = vi.fn();
  await act(async () =>
    root.render(
      createElement(TypedSlider, {
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        decimals: 0,
        unit: "%",
        displayScale: 100,
        "aria-label": "Volume",
        onCommit,
        ...props,
      }),
    ),
  );
  const text = host.querySelector("input[type='text']")!;
  const range = host.querySelector("input[type='range']")!;
  return { root, host, onCommit, text, range };
}

async function typeValue(input: HTMLInputElement, typed: string) {
  await act(async () => {
    input.focus();
    setInputValue.call(input, typed);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

it("shows the same value in the slider and the type-in field", async () => {
  const { root, text, range } = await renderSlider();
  expect((text as HTMLInputElement).value).toBe("50");
  expect((range as HTMLInputElement).value).toBe("0.5");
  await act(async () => root.unmount());
});

it("types the exact value: 75 types to 0.75, and 137 degrees types to 137", async () => {
  const { root, text, onCommit } = await renderSlider();
  await typeValue(text, "75");
  expect(onCommit).toHaveBeenLastCalledWith(0.75);
  await act(async () => root.unmount());

  const angle = await renderSlider({
    value: 45,
    min: 0,
    max: 360,
    step: 1,
    decimals: 0,
    unit: "°",
    displayScale: 1,
  });
  await typeValue(angle.text, "137");
  expect(angle.onCommit).toHaveBeenLastCalledWith(137);
  await act(async () => angle.root.unmount());
});

it("clamps a typed value instead of applying it out of range", async () => {
  const { root, text, onCommit } = await renderSlider();
  await typeValue(text, "150");
  expect(onCommit).toHaveBeenLastCalledWith(1);
  await typeValue(text, "-20");
  expect(onCommit).toHaveBeenLastCalledWith(0);
  await act(async () => root.unmount());
});

it("drags live on the slider and maps a stepped scale both ways", async () => {
  const scales = [50, 75, 100, 150, 200, 300, 400];
  const { root, range, onCommit } = await renderSlider({
    value: 100,
    min: 50,
    max: 400,
    step: 25,
    decimals: 0,
    unit: "%",
    displayScale: 1,
    toSlider: (fontScale) => scales.indexOf(fontScale),
    fromSlider: (index) => scales[index] ?? 100,
    sliderMin: 0,
    sliderMax: scales.length - 1,
    sliderStep: 1,
  });
  expect((range as HTMLInputElement).value).toBe("2");
  await act(async () => {
    setInputValue.call(range, "3");
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onCommit).toHaveBeenLastCalledWith(150);
  await act(async () => root.unmount());
});
