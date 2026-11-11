import type { ThemeDescriptionKey } from "./themes";

export type WheelGroup = "base" | "metal" | "holographic" | "pearl" | "gem";

export interface WheelEntry {
  group: WheelGroup;
  id: string;
  name: string;
  hex: string;
}

export const WHEEL_GROUP_ORDER: WheelGroup[] = ["base", "metal", "holographic", "pearl", "gem"];

export const WHEEL_GROUP_DESCRIPTION_KEYS: Record<WheelGroup, ThemeDescriptionKey> = {
  base: "theme_description_wheel_base",
  metal: "theme_description_wheel_metal",
  holographic: "theme_description_wheel_holographic",
  pearl: "theme_description_wheel_pearl",
  gem: "theme_description_wheel_gem",
};

export const WHEEL_ENTRIES: readonly WheelEntry[] = [
  { group: "base", id: "wheel-base-neon-pink", name: "Neon Pink", hex: "#FF1E89" },
  { group: "base", id: "wheel-base-cyan", name: "Cyan", hex: "#00E5FF" },
  { group: "base", id: "wheel-base-true-black", name: "True Black", hex: "#000000" },
  { group: "base", id: "wheel-base-charcoal", name: "Charcoal", hex: "#121212" },
  { group: "base", id: "wheel-base-white", name: "White", hex: "#FFFFFF" },
  { group: "base", id: "wheel-base-orchid-pink-dark", name: "Orchid Pink — Dark", hex: "#AD3375" },
  { group: "base", id: "wheel-base-orchid-pink-light", name: "Orchid Pink — Light", hex: "#7C254F" },
  { group: "base", id: "wheel-base-teal-green-dark", name: "Teal-Green — Dark", hex: "#547C6D" },
  { group: "base", id: "wheel-base-teal-green-light", name: "Teal-Green — Light", hex: "#1F483F" },
  { group: "base", id: "wheel-base-brushed-gold-deep", name: "Brushed Gold — Deep", hex: "#66501F" },
  { group: "base", id: "wheel-base-brushed-gold-mid", name: "Brushed Gold — Mid", hex: "#A8891F" },
  { group: "base", id: "wheel-base-brushed-gold-light", name: "Brushed Gold — Light", hex: "#C9B276" },
  { group: "base", id: "wheel-base-posh-b-dark", name: "Posh B — Dark", hex: "#952A4E" },
  { group: "base", id: "wheel-base-posh-b-light", name: "Posh B — Light", hex: "#6D1F40" },
  { group: "base", id: "wheel-base-posh-c-dark", name: "Posh C — Dark", hex: "#842B45" },
  { group: "base", id: "wheel-base-posh-c-light", name: "Posh C — Light", hex: "#5F1A34" },
  { group: "base", id: "wheel-base-posh-d-dark", name: "Posh D — Dark", hex: "#701F36" },
  { group: "base", id: "wheel-base-posh-d-light", name: "Posh D — Light", hex: "#52162B" },
  { group: "base", id: "wheel-base-trevor-orange-lemon-gleam", name: "Trevor Orange ✦ Lemon Gleam", hex: "#FF8200" },
  { group: "base", id: "wheel-base-lemon-yellow-gleam", name: "Lemon-Yellow Gleam", hex: "#FFEA00" },
  { group: "base", id: "wheel-base-medium-gray", name: "Medium Gray", hex: "#808080" },
  { group: "base", id: "wheel-base-light-gray", name: "Light Gray", hex: "#D3D3D3" },
  { group: "metal", id: "wheel-metal-copper", name: "Copper", hex: "#B87333" },
  { group: "metal", id: "wheel-metal-brass", name: "Brass", hex: "#B5A642" },
  { group: "metal", id: "wheel-metal-antique-brass", name: "Antique Brass", hex: "#8A6D3B" },
  { group: "metal", id: "wheel-metal-silver", name: "Silver", hex: "#C0C0C0" },
  { group: "metal", id: "wheel-metal-nickel", name: "Nickel", hex: "#8A8D89" },
  { group: "metal", id: "wheel-metal-yellow-gold", name: "Yellow Gold", hex: "#D4AF37" },
  { group: "metal", id: "wheel-metal-rose-gold", name: "Rose Gold", hex: "#D89A82" },
  { group: "metal", id: "wheel-metal-platinum", name: "Platinum", hex: "#C7D3E0" },
  { group: "metal", id: "wheel-metal-chrome", name: "Chrome", hex: "#B9C6CF" },
  { group: "metal", id: "wheel-metal-gunmetal", name: "Gunmetal", hex: "#4A565E" },
  { group: "metal", id: "wheel-metal-titanium", name: "Titanium", hex: "#8E8D85" },
  { group: "metal", id: "wheel-metal-bronze", name: "Bronze", hex: "#CD7F32" },
  { group: "metal", id: "wheel-metal-pewter", name: "Pewter", hex: "#8E9299" },
  { group: "metal", id: "wheel-metal-steel", name: "Steel", hex: "#7D8A96" },
  { group: "metal", id: "wheel-metal-aluminum", name: "Aluminum", hex: "#C2C7CC" },
  { group: "metal", id: "wheel-metal-pearl", name: "Pearl", hex: "#EDE6DA" },
  { group: "metal", id: "wheel-metal-multicolor-chrome", name: "Multicolor Chrome", hex: "#8E7CF0" },
  { group: "metal", id: "wheel-metal-holographic-iridescent-rainbow", name: "Holographic Iridescent Rainbow", hex: "#B79CED" },
  { group: "metal", id: "wheel-metal-cobalt-blue", name: "Cobalt Blue", hex: "#2F66D0" },
  { group: "metal", id: "wheel-metal-indigo", name: "Indigo", hex: "#5B4BD6" },
  { group: "metal", id: "wheel-metal-violet", name: "Violet", hex: "#8B46E8" },
  { group: "metal", id: "wheel-metal-emerald-green", name: "Emerald Green", hex: "#1FA866" },
  { group: "metal", id: "wheel-metal-pink-metallic", name: "Pink Metallic", hex: "#F06A9B" },
  { group: "metal", id: "wheel-metal-teal-metallic", name: "Teal Metallic", hex: "#14A8A0" },
  { group: "metal", id: "wheel-metal-fuchsia-metallic", name: "Fuchsia Metallic", hex: "#D6339E" },
  { group: "metal", id: "wheel-metal-azure", name: "Azure", hex: "#1E8FE8" },
  { group: "metal", id: "wheel-metal-raspberry", name: "Raspberry", hex: "#E30B5D" },
  { group: "holographic", id: "wheel-holographic-neon-pink-holographic", name: "Neon Pink Holographic", hex: "#FF1E89" },
  { group: "holographic", id: "wheel-holographic-cyan-holographic", name: "Cyan Holographic", hex: "#00E5FF" },
  { group: "holographic", id: "wheel-holographic-orchid-holographic", name: "Orchid Holographic", hex: "#AD3375" },
  { group: "holographic", id: "wheel-holographic-violet-holographic-pink-cyan", name: "Violet Holographic — Pink + Cyan", hex: "#B967FF" },
  { group: "holographic", id: "wheel-holographic-pink-white-holographic", name: "Pink + White Holographic", hex: "#FFC8DD" },
  { group: "holographic", id: "wheel-holographic-cyan-white-holographic", name: "Cyan + White Holographic", hex: "#B8F1F7" },
  { group: "holographic", id: "wheel-holographic-gold-holographic", name: "Gold Holographic", hex: "#C9B276" },
  { group: "pearl", id: "wheel-pearl-white-pearl", name: "White Pearl", hex: "#F2EDE6" },
  { group: "pearl", id: "wheel-pearl-pink-pearl", name: "Pink Pearl", hex: "#F3D9DE" },
  { group: "pearl", id: "wheel-pearl-green-in-pink-pearl", name: "Green in Pink Pearl", hex: "#E9DAD8" },
  { group: "pearl", id: "wheel-pearl-blue-rose-pearl", name: "Blue Rose Pearl", hex: "#D8DEE8" },
  { group: "pearl", id: "wheel-pearl-cold-silver-light", name: "Cold Silver Light", hex: "#DDE2E6" },
  { group: "pearl", id: "wheel-pearl-silver-blue", name: "Silver Blue", hex: "#C8D4DE" },
  { group: "pearl", id: "wheel-pearl-cold-white", name: "Cold White", hex: "#EEF2F3" },
  { group: "pearl", id: "wheel-pearl-pure-gold-pearl", name: "Pure Gold Pearl", hex: "#D9A82E" },
  { group: "pearl", id: "wheel-pearl-light-gold-pearl", name: "Light Gold Pearl", hex: "#EED9A4" },
  { group: "pearl", id: "wheel-pearl-platinum-grey-pearl", name: "Platinum Grey Pearl", hex: "#B9BEC6" },
  { group: "pearl", id: "wheel-pearl-purple-pearl", name: "Purple Pearl", hex: "#C9B2D4" },
  { group: "pearl", id: "wheel-pearl-blue-pearl", name: "Blue Pearl", hex: "#A9C6E2" },
  { group: "pearl", id: "wheel-pearl-orange-pearl", name: "Orange Pearl", hex: "#F2C49B" },
  { group: "gem", id: "wheel-gem-spectrolite", name: "Spectrolite", hex: "#3E6FB0" },
  { group: "gem", id: "wheel-gem-labradorite", name: "Labradorite", hex: "#3A6EA8" },
  { group: "gem", id: "wheel-gem-precious-opal", name: "Precious Opal", hex: "#EDEAE4" },
  { group: "gem", id: "wheel-gem-ammolite", name: "Ammolite", hex: "#B8511F" },
  { group: "gem", id: "wheel-gem-bornite-peacock-ore", name: "Bornite — Peacock Ore", hex: "#7A3A8C" },
  { group: "gem", id: "wheel-gem-chalcopyrite", name: "Chalcopyrite", hex: "#B8862E" },
  { group: "gem", id: "wheel-gem-fire-agate", name: "Fire Agate", hex: "#8A4A1A" },
  { group: "gem", id: "wheel-gem-rainbow-hematite", name: "Rainbow Hematite", hex: "#5A4A52" },
  { group: "gem", id: "wheel-gem-covellite", name: "Covellite", hex: "#2E3A8C" },
  { group: "gem", id: "wheel-gem-iris-agate", name: "Iris Agate", hex: "#D8CFE4" },
  { group: "gem", id: "wheel-gem-fire-obsidian", name: "Fire Obsidian", hex: "#1F1A1E" },
  { group: "gem", id: "wheel-gem-sphalerite", name: "Sphalerite", hex: "#7A4A1E" },
  { group: "gem", id: "wheel-gem-rainbow-moonstone", name: "Rainbow Moonstone", hex: "#DDE8F2" },
  { group: "gem", id: "wheel-gem-mother-of-pearl", name: "Mother of Pearl", hex: "#EFE9E0" },
  { group: "gem", id: "wheel-gem-abalone-shell", name: "Abalone Shell", hex: "#2E7A74" },
  { group: "gem", id: "wheel-gem-bismuth", name: "Bismuth", hex: "#C46A8C" },
  { group: "gem", id: "wheel-gem-seraphinite", name: "Seraphinite", hex: "#2E5A46" },
  { group: "gem", id: "wheel-gem-chrysoprase-sonja-day-s-stone", name: "Chrysoprase — Sonja & Day's Stone ♡", hex: "#79C98F" },
];

// --- Color math (WCAG 2 relative luminance / contrast, sRGB mixes) ---

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Mix two hex colors in sRGB space; `amount` is the share of `to` (0..1). */
export function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function isGrayscale(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return r === g && g === b;
}

/**
 * Pick the on-primary text color (pure white or pure black, whichever
 * contrasts better) and nudge the primary until the pair reaches 4.5:1.
 * Pure black is used instead of near-black on purpose: at the mid-luminance
 * crossover (~0.18) only a true #000000 keeps both sides above 4.5:1.
 */
function legiblePrimary(primary: string, darken: boolean): { primary: string; onPrimary: string } {
  let current = primary;
  for (let step = 0; step < 20; step += 1) {
    const whiteRatio = contrastRatio(current, "#FFFFFF");
    const blackRatio = contrastRatio(current, "#000000");
    const onPrimary = whiteRatio >= blackRatio ? "#FFFFFF" : "#000000";
    if (Math.max(whiteRatio, blackRatio) >= 4.5) {
      return { primary: current, onPrimary };
    }
    current = mixHex(current, darken ? "#000000" : "#FFFFFF", 0.1);
  }
  const whiteRatio = contrastRatio(current, "#FFFFFF");
  return {
    primary: current,
    onPrimary: whiteRatio >= contrastRatio(current, "#000000") ? "#FFFFFF" : "#000000",
  };
}

function variantSeed(
  base: string,
  variant: "light" | "dark",
): Pick<
  import("./themes").PaletteSeed["light"],
  "primary" | "onPrimary" | "secondary" | "background" | "surface" | "onSurface" | "onSurfaceVariant" | "outline" | "error"
> {
  const dark = variant === "dark";
  let primary = base;
  // Keep the accent visible against its own background: a near-white base
  // disappears on a light surface, a near-black base on a dark one.
  if (dark) {
    while (relativeLuminance(primary) < 0.12) primary = mixHex(primary, "#FFFFFF", 0.15);
  } else {
    while (relativeLuminance(primary) > 0.35) primary = mixHex(primary, "#000000", 0.15);
  }
  const { primary: legible, onPrimary } = legiblePrimary(primary, !dark);
  const secondary = mixHex(legible, "#FFFFFF", dark ? 0.45 : 0.25);

  // Grayscale entries (True Black, Charcoal, White, Medium/Light Gray) stay
  // on a pure neutral ramp: no color tint anywhere, so they read identically
  // in grayscale — required for achromatopsia, where meaning must never
  // depend on hue.
  if (isGrayscale(base)) {
    return {
      primary: legible,
      onPrimary,
      secondary,
      background: dark ? "#0F0F0F" : "#FFFFFF",
      surface: dark ? "#1D1D1D" : "#F3F3F3",
      onSurface: dark ? "#F4F4F4" : "#111111",
      onSurfaceVariant: dark ? "#B8B8B8" : "#5F5F5F",
      outline: dark ? "#343434" : "#D7D7D7",
      error: dark ? "#FFB4AB" : "#BA1A1A",
    };
  }

  return {
    primary: legible,
    onPrimary,
    secondary,
    background: dark ? mixHex("#101010", base, 0.06) : mixHex("#FFFFFF", base, 0.05),
    surface: dark ? mixHex("#1D1D1D", base, 0.09) : mixHex("#FFFFFF", base, 0.09),
    onSurface: dark ? "#F4F4F4" : "#111111",
    onSurfaceVariant: mixHex(dark ? "#F4F4F4" : "#111111", base, 0.2),
    outline: dark ? mixHex("#343434", base, 0.3) : mixHex("#D7D7D7", base, 0.3),
    error: dark ? "#FFB4AB" : "#BA1A1A",
  };
}

/**
 * Derive a full light + dark PaletteSeed from a single wheel hex. No
 * hand-typed palettes: the accent is the wheel color itself (darkened in
 * light mode / lightened in dark mode only as far as legibility needs),
 * surfaces are the neutral base tinted 5–9% with it, and text stays neutral
 * so every theme works in pure grayscale too.
 */
export function deriveWheelTheme(entry: WheelEntry): import("./themes").PaletteSeed {
  return {
    id: entry.id,
    name: entry.name,
    descriptionKey: WHEEL_GROUP_DESCRIPTION_KEYS[entry.group],
    group: `wheel-${entry.group}`,
    light: variantSeed(entry.hex, "light"),
    dark: variantSeed(entry.hex, "dark"),
  };
}
