import { describe, expect, it } from "vitest";
import {
  BUILTIN_THEMES,
  THEME_VARIANTS,
  createCustomTheme,
  parseCustomThemes,
  resolveTheme,
  themeCssVariables,
} from "./themes";
import { contrastRatio } from "./deviantWheel";

const CURATED_THEME_IDS = [
  "deviant-noir",
  "trevor-sunrise",
  "chrysoprase",
  "spectrolite",
  "rose-gold",
  "abalone",
  "bismuth",
] as const;

describe("themes", () => {
  it("provides every built-in palette in all three variants", () => {
    // 20 standard + 7 curated Dollhouse Deviants presets + 87 wheel themes.
    expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(114);
    expect(new Set(BUILTIN_THEMES.map((theme) => theme.id)).size).toBe(BUILTIN_THEMES.length);

    for (const theme of BUILTIN_THEMES) {
      for (const variant of THEME_VARIANTS) {
        expect(theme.variants[variant]).toBeDefined();
      }
      expect(theme.variants.amoled.background).toBe("#000000");
    }
  });

  it("includes every curated Dollhouse Deviants preset", () => {
    for (const id of CURATED_THEME_IDS) {
      const theme = BUILTIN_THEMES.find((candidate) => candidate.id === id);
      expect(theme).toBeDefined();
      expect(theme?.group).toBe("curated");
    }
  });

  it("keeps primary text legible in every derived and curated theme", () => {
    const checked = BUILTIN_THEMES.filter(
      (theme) => theme.group === "curated" || theme.group?.startsWith("wheel-"),
    );
    expect(checked.length).toBe(94);
    for (const theme of checked) {
      for (const variant of ["light", "dark"] as const) {
        const colors = theme.variants[variant];
        expect(
          contrastRatio(colors.primary, colors.onPrimary),
          `${theme.id} ${variant} primary vs onPrimary`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("round-trips valid custom themes and rejects malformed entries", () => {
    const custom = createCustomTheme("custom-test", "Test palette");
    const parsed = parseCustomThemes(JSON.stringify([
      custom,
      { id: "custom-broken", name: "Broken", custom: true, variants: {} },
    ]));

    expect(parsed).toEqual([custom]);
    expect(resolveTheme(custom.id, parsed)).toEqual(custom);
  });

  it("falls back to Flow Default for an unknown selection", () => {
    expect(resolveTheme("missing", []).id).toBe("default");
  });

  it("maps semantic and chrome variables for the active palette", () => {
    const colors = BUILTIN_THEMES.find((theme) => theme.id === "catppuccin")!.variants.light;
    const variables = themeCssVariables(colors, "light");

    expect(variables["--color-primary"]).toBe(colors.primary);
    expect(variables["--color-background-val"]).toBe(colors.background);
    expect(variables["--color-chrome-neutral-100"]).toBe(colors.onSurface);
    expect(variables["--color-chrome-neutral-500"]).toBe(colors.onSurfaceVariant);
    expect(variables["--color-chrome-neutral-600"]).toBe(colors.onSurfaceVariant);
    expect(variables["--color-chrome-neutral-800"]).toBe(colors.outline);
    expect(variables["--color-chrome-neutral-900"]).toBe(colors.surfaceContainer);
  });
});
