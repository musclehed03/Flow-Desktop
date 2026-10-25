import { describe, expect, it } from "vitest";
import { COLOR_BLIND_PALETTES, COLOR_BLIND_PALETTE_IDS, isColorBlindPalette } from "./colorBlindPalettes";

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

function contrast(a: string, b: string) {
  const first = luminance(a); const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("typed colorblind palettes", () => {
  it("ships every requested palette type", () => {
    expect(COLOR_BLIND_PALETTE_IDS).toEqual([
      "deuteranomaly", "protanomaly", "deuteranopia", "protanopia",
      "tritanomaly", "tritanopia", "achromatopsia",
    ]);
    COLOR_BLIND_PALETTE_IDS.forEach((id) => expect(isColorBlindPalette(id)).toBe(true));
    expect(isColorBlindPalette("unknown")).toBe(false);
  });

  it.each(COLOR_BLIND_PALETTE_IDS)("meets WCAG AA in light and dark for %s", (id) => {
    for (const variant of ["light", "dark"] as const) {
      const colors = COLOR_BLIND_PALETTES[id][variant];
      for (const background of ["background", "surface", "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest"] as const) {
        expect(contrast(colors.onSurface, colors[background]), `${id}/${variant}: text on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.onSurfaceVariant, colors[background]), `${id}/${variant}: secondary text on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(colors.primary, colors.onPrimary), `${id}/${variant}: button text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primary, colors.background), `${id}/${variant}: indicator`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps achromatopsia tokens purely grayscale", () => {
    for (const colors of Object.values(COLOR_BLIND_PALETTES.achromatopsia)) {
      for (const value of Object.values(colors)) {
        const [r, g, b] = value.slice(1).match(/../g)!;
        expect(r).toBe(g); expect(g).toBe(b);
      }
    }
  });
});
