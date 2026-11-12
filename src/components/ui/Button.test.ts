import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { HapticButton } from "../music/HapticButton";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

async function renderButton(props: Parameters<typeof Button>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(Button, props, "Press me")));
  return { root, button: host.querySelector("button")! };
}

it("gives enabled buttons the positive press and fires the click", async () => {
  const onClick = vi.fn();
  const { root, button } = await renderButton({ onClick });
  expect(button.className).toContain("press-positive");
  expect(button.className).not.toContain("press-noop");
  await act(async () => button.click());
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it("gives destructive buttons the heavier negative press", async () => {
  const { root, button } = await renderButton({ variant: "destructive", onClick: vi.fn() });
  expect(button.className).toContain("press-negative");
  expect(button.className).not.toContain("press-positive");
  await act(async () => root.unmount());
});

it("gives disabled buttons the no-action nudge, keeps pointer events, and blocks the click", async () => {
  const onClick = vi.fn();
  const { root, button } = await renderButton({ disabled: true, onClick });
  expect(button.className).toContain("press-noop");
  expect(button.className).not.toContain("pointer-events-none");
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(onClick).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it("gives transport buttons the same positive press, and the nudge when disabled", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClick = vi.fn();
  await act(async () =>
    root.render(createElement(HapticButton, { onClick, "aria-label": "Play" }, "Play")),
  );
  const enabled = host.querySelector("button")!;
  expect(enabled.className).toContain("press-positive");
  await act(async () => enabled.click());
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(createElement(HapticButton, { disabled: true, "aria-label": "Play" }, "Play")),
  );
  const disabledButton = host.querySelector("button")!;
  expect(disabledButton.className).toContain("press-noop");
  expect(disabledButton.disabled).toBe(true);
  await act(async () => root.unmount());
});
