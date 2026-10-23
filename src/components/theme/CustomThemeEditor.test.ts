import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getString } from "../../lib/i18n/index";
import { createCustomTheme } from "../../lib/themes";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { CustomThemeEditor } from "./CustomThemeEditor";

vi.mock("../../lib/api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const originalSettings = useAppSettingsStore.getState().values;

afterEach(() => {
  useAppSettingsStore.setState({ values: originalSettings });
  document.body.replaceChildren();
});

it("previews color edits immediately and exposes live undo and reset", async () => {
  const host = document.createElement("div");
  const opener = document.createElement("button");
  document.body.append(opener, host);
  const root = createRoot(host);
  const theme = createCustomTheme("custom-live-preview", "Preview");
  const onChange = vi.fn();

  await act(async () => root.render(createElement(CustomThemeEditor, {
    theme,
    openerRef: { current: opener },
    onClose: vi.fn(),
    onChange,
  })));
  const primary = document.querySelector<HTMLInputElement>('input[type="color"]')!;
  const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setInputValue.call(primary, "#123456");
    primary.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    variants: expect.objectContaining({ dark: expect.objectContaining({ primary: "#123456" }) }),
  }));

  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${getString("panel_undo")}"]`)!.click());
  expect(onChange).toHaveBeenLastCalledWith(theme);

  await act(async () => {
    setInputValue.call(primary, "#654321");
    primary.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${getString("panel_reset")}"]`)!.click());
  expect(onChange).toHaveBeenLastCalledWith(theme);
  await act(async () => root.unmount());
});
