import { describe, expect, it } from "vitest";
import {
  WHEEL_ENTRIES,
  contrastRatio,
  deriveWheelTheme,
  mixHex,
  relativeLuminance,
} from "./deviantWheel";

describe("deviantWheel", () => {
  it("carries all 87 wheel entries with unique ids", () => {
    expect(WHEEL_ENTRIES.length).toBe(87);
    expect(new Set(WHEEL_ENTRIES.map((entry) => entry.id)).size).toBe(87);
    expect(new Set(WHEEL_ENTRIES.map((entry) => entry.group)).size).toBe(5);
  });

  it("derives legible light and dark palettes from a saturated base", () => {
    const theme = deriveWheelTheme({
      group: "base",
      id: "wheel-base-neon-pink",
      name: "Neon Pink",
      hex: "#FF1E89",
    });
    expect(theme.light.primary).toBe("#FF1E89");
    expect(theme.dark.primary).toBe("#FF1E89");
    expect(contrastRatio(theme.light.primary, theme.light.onPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.dark.primary, theme.dark.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every wheel entry legible in both variants", () => {
    for (const entry of WHEEL_ENTRIES) {
      const theme = deriveWheelTheme(entry);
      for (const variant of ["light", "dark"] as const) {
        const colors = theme[variant];
        expect(
          contrastRatio(colors.primary, colors.onPrimary),
          `${entry.id} ${variant}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps grayscale entries on a pure neutral ramp", () => {
    const black = deriveWheelTheme({
      group: "base",
      id: "wheel-base-true-black",
      name: "True Black",
      hex: "#000000",
    });
    const white = deriveWheelTheme({
      group: "base",
      id: "wheel-base-white",
      name: "White",
      hex: "#FFFFFF",
    });
    // No color tint anywhere: surfaces are pure gray in both variants.
    expect(black.light.background).toBe("#FFFFFF");
    expect(black.dark.background).toBe("#0F0F0F");
    expect(white.light.background).toBe("#FFFFFF");
    expect(white.dark.background).toBe("#0F0F0F");
    // The accent itself is pushed to a legible gray in each variant.
    expect(relativeLuminance(black.dark.primary)).toBeGreaterThanOrEqual(0.12);
    expect(relativeLuminance(white.light.primary)).toBeLessThanOrEqual(0.35);
    expect(contrastRatio(white.light.primary, white.light.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("computes WCAG contrast and mixes as expected", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 5);
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#FF0000", "#000000", 1)).toBe("#000000");
  });
});
