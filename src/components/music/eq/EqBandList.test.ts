import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { band } from "../../../lib/audio/eq/models";
import { getString } from "../../../lib/i18n/index";
import { SETTINGS } from "../../../lib/settings/schema";
import { useAppSettingsStore } from "../../../store/useAppSettingsStore";
import { EqBandList } from "./EqBandList";

vi.mock("../../../lib/api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const originalSettings = useAppSettingsStore.getState().values;

beforeEach(() => {
  useAppSettingsStore.setState({ values: { ...originalSettings, [SETTINGS.EQ_INPUT_MODE]: "text" } });
});

afterEach(() => {
  useAppSettingsStore.setState({ values: originalSettings });
  document.body.replaceChildren();
});

it("spells out each band's shape, drawn and in words, and reads it aloud to the picker", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(EqBandList, {
        bands: [band(1_000, 0, 10, "NOTCH"), band(100, 3, 0.5, "PEAK")],
        selected: 0,
        canAdd: true,
        onSelect: vi.fn(),
        onChange: vi.fn(),
        onRemove: vi.fn(),
        onAdd: vi.fn(),
      }),
    ),
  );

  // The notch's shape line, in plain words, with its dip drawn beside it.
  expect(host.textContent).toContain(getString("eq_shape_notch"));
  expect(host.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  // A wide bell names itself wide.
  expect(host.textContent).toContain(getString("eq_shape_peak_wide"));
  // The legend explains every control once, visibly.
  expect(host.textContent).toContain(getString("eq_frequency_desc"));
  expect(host.textContent).toContain(getString("eq_q_desc"));

  // The type picker is described by its own band's shape line and the legend.
  const typeButton = host.querySelector("button[aria-describedby]")!;
  expect(typeButton.getAttribute("aria-describedby")).toContain("eq-band-0-shape-desc");
  expect(typeButton.getAttribute("aria-describedby")).toContain("eq-band-legend-type");
  // The frequency field hears the legend too.
  const frequency = host.querySelector("input[aria-label='Frequency']")!;
  expect(frequency.getAttribute("aria-describedby")).toBe("eq-band-legend-frequency");

  await act(async () => root.unmount());
});
