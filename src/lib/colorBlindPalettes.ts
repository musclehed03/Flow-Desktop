import type { ThemeColors } from "./themes";

export const COLOR_BLIND_PALETTE_IDS = [
  "deuteranomaly",
  "protanomaly",
  "deuteranopia",
  "protanopia",
  "tritanomaly",
  "tritanopia",
  "achromatopsia",
] as const;

export type ColorBlindPalette = (typeof COLOR_BLIND_PALETTE_IDS)[number];
export type ColorBlindPaletteSet = Record<"light" | "dark", ThemeColors>;

const light = (primary: string, secondary: string, background = "#ffffff"): ThemeColors => ({
  primary,
  onPrimary: "#ffffff",
  secondary,
  background,
  surface: "#f4f6f8",
  surfaceContainerLow: "#f8fafc",
  surfaceContainer: "#eceff3",
  surfaceContainerHigh: "#e3e7ec",
  surfaceContainerHighest: "#d8dde4",
  outline: "#69717e",
  onSurface: "#111318",
  onSurfaceVariant: "#454b55",
  error: "#8f1d1d",
});

const dark = (primary: string, secondary: string, background = "#0a0d12"): ThemeColors => ({
  primary,
  onPrimary: "#0a0d12",
  secondary,
  background,
  surface: "#111722",
  surfaceContainerLow: "#0e131b",
  surfaceContainer: "#171d28",
  surfaceContainerHigh: "#1f2633",
  surfaceContainerHighest: "#293140",
  outline: "#8993a3",
  onSurface: "#f8fafc",
  onSurfaceVariant: "#c9d0da",
  error: "#ffb4ab",
});

export const COLOR_BLIND_PALETTES: Record<ColorBlindPalette, ColorBlindPaletteSet> = {
  deuteranomaly: {
    light: light("#0057a6", "#675800", "#fafdff"),
    dark: dark("#72b7ff", "#f4d35e", "#090e14"),
  },
  protanomaly: {
    light: light("#5740a6", "#00676c", "#fcfbff"),
    dark: dark("#c2b2ff", "#70d6d8", "#0e0b15"),
  },
  deuteranopia: {
    light: light("#005274", "#6a5200", "#f8fcff"),
    dark: dark("#5fd0ff", "#ffd166", "#071018"),
  },
  protanopia: {
    light: light("#514a9b", "#00636b", "#fbfaff"),
    dark: dark("#b8b4ff", "#73d7df", "#0d0b16"),
  },
  tritanomaly: {
    light: light("#824000", "#005f73", "#fffbf7"),
    dark: dark("#ffb16e", "#70d6e0", "#130d08"),
  },
  tritanopia: {
    light: light("#73377f", "#00675f", "#fff9fe"),
    dark: dark("#e7a6f4", "#79dccf", "#120a12"),
  },
  achromatopsia: {
    light: {
      primary: "#1a1a1a", onPrimary: "#ffffff", secondary: "#3f3f3f",
      background: "#ffffff", surface: "#f5f5f5", surfaceContainerLow: "#fafafa",
      surfaceContainer: "#eeeeee", surfaceContainerHigh: "#e3e3e3",
      surfaceContainerHighest: "#d6d6d6", outline: "#666666",
      onSurface: "#111111", onSurfaceVariant: "#444444", error: "#333333",
    },
    dark: {
      primary: "#f5f5f5", onPrimary: "#111111", secondary: "#d0d0d0",
      background: "#0a0a0a", surface: "#141414", surfaceContainerLow: "#101010",
      surfaceContainer: "#1b1b1b", surfaceContainerHigh: "#242424",
      surfaceContainerHighest: "#303030", outline: "#a0a0a0",
      onSurface: "#ffffff", onSurfaceVariant: "#d6d6d6", error: "#e0e0e0",
    },
  },
};

export function isColorBlindPalette(value: string): value is ColorBlindPalette {
  return COLOR_BLIND_PALETTE_IDS.includes(value as ColorBlindPalette);
}

export function resolveColorBlindPalette(value: string): ColorBlindPalette {
  return isColorBlindPalette(value) ? value : "deuteranomaly";
}
