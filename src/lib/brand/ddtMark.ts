// Dollhouse Deviants Tuned lock mark (Sonja, 2026-11-04).
//
// Two variants, picked by local time: the cyan container 00:00-11:59, the pink
// container 12:00-23:59. The OS icon is baked pink — an OS icon cannot rotate —
// while every in-app mark rotates. Both variants pass grayscale. The DDT
// lettering shows at 32px and up; below that the mark is F-only (it mushes at
// 16px).

export type DdtVariant = "cyan" | "pink";

export const DDT_CYAN = "#00CFFF";
export const DDT_PINK = "#FF1E89";
// Upstream mark, splash frame 1 only — never the shipped mark.
export const DDT_LEGACY_RED = "#FF0000";
export const DDT_LEGACY_F = "#FFFFFF";

// DDT lettering shows at >= 32px; below that, F only.
export const DDT_MIN_SIZE = 32;

export interface DdtPalette {
  container: string;
  // F letter + DDT lettering.
  mark: string;
}

export const DDT_PALETTES: Record<DdtVariant, DdtPalette> = {
  cyan: { container: DDT_CYAN, mark: DDT_PINK },
  pink: { container: DDT_PINK, mark: DDT_CYAN },
};

export function getDdtVariant(now: Date = new Date()): DdtVariant {
  return now.getHours() < 12 ? "cyan" : "pink";
}

export function showDdtLettering(size: number): boolean {
  return size >= DDT_MIN_SIZE;
}

// Splash flicker intro frames (Sonja, 2026-11-04): old red logo -> flicker red
// <-> house mark -> dark -> pink/cyan flicker -> lock on the time-correct
// variant. Flash-safe: short frames, and completely still under Safe Motion
// (the caller renders only the final frame then).
export type SplashFrame =
  | { kind: "legacy"; ms: number }
  | { kind: "house"; ms: number }
  | { kind: "dark"; ms: number }
  | { kind: "variant"; variant: DdtVariant; ms: number }
  | { kind: "final"; variant: DdtVariant };

export function getSplashFrames(now: Date = new Date()): SplashFrame[] {
  const finalVariant = getDdtVariant(now);
  const otherVariant: DdtVariant = finalVariant === "cyan" ? "pink" : "cyan";
  return [
    { kind: "legacy", ms: 220 },
    { kind: "house", ms: 130 },
    { kind: "legacy", ms: 130 },
    { kind: "house", ms: 130 },
    { kind: "dark", ms: 160 },
    { kind: "variant", variant: otherVariant, ms: 130 },
    { kind: "variant", variant: finalVariant, ms: 130 },
    { kind: "final", variant: finalVariant },
  ];
}
