import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { SettingItem } from "./SettingItem";
import { ToggleSwitch } from "../ui/ToggleSwitch";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

async function renderRow(children: React.ReactNode, props: { disabled?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(SettingItem, { title: "Ambient mode", description: "Washes the player in the artwork.", ...props, children }),
    ),
  );
  return { root, host };
}

it("clicking the row title or description toggles its switch", async () => {
  const onChange = vi.fn();
  const { root, host } = await renderRow(createElement(ToggleSwitch, { checked: false, onChange }));
  const title = host.querySelector("div.text-sm")!;
  await act(async () => { title.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(true);
  await act(async () => root.unmount());
});

it("clicking the switch itself toggles exactly once", async () => {
  const onChange = vi.fn();
  const { root, host } = await renderRow(createElement(ToggleSwitch, { checked: false, onChange }));
  const toggle = host.querySelector('button[role="switch"]')!;
  await act(async () => { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onChange).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it("a disabled row does nothing on a row click", async () => {
  const onChange = vi.fn();
  const { root, host } = await renderRow(createElement(ToggleSwitch, { checked: false, onChange }), { disabled: true });
  const title = host.querySelector("div.text-sm")!;
  await act(async () => { title.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it("clicking the row clicks its button and focuses its text field", async () => {
  const onClick = vi.fn();
  const { root, host } = await renderRow(createElement("button", { type: "button", onClick }, "Manage"));
  const title = host.querySelector("div.text-sm")!;
  await act(async () => { title.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());

  const field = await renderRow(createElement("input", { type: "text", defaultValue: "12", "aria-label": "Value" }));
  const fieldTitle = field.host.querySelector("div.text-sm")!;
  await act(async () => { fieldTitle.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const input = field.host.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(2);
  await act(async () => field.root.unmount());
});
