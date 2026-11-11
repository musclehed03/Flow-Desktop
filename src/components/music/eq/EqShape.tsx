import type { EqBand, EqFilterType } from "../../../lib/audio/eq/models";
import type { StringKey } from "../../../lib/i18n/index";

/*
  What a band's shape does, in plain language (fixes batch #12). A bell's width comes
  from its Q, so the name follows the Q: 0.7 and under is wide, 3.0 and over is narrow —
  the same break points as the EQ guide sheets' Q guide (0.3 / 0.7 / 1.0 / 3.0 / 10).
  The notch is the cut-only extreme of a narrow bell, not a bell with a gain.
*/

/** Q at or below this reads as a wide bell; at or above NARROW_Q, a narrow one. */
export const EQ_SHAPE_WIDE_Q = 0.7;
export const EQ_SHAPE_NARROW_Q = 3.0;

export function shapeDescriptionKey(band: EqBand): StringKey {
  switch (band.type) {
    case "PEAK":
      if (band.q >= EQ_SHAPE_NARROW_Q) return "eq_shape_peak_narrow";
      if (band.q <= EQ_SHAPE_WIDE_Q) return "eq_shape_peak_wide";
      return "eq_shape_peak";
    case "LOW_SHELF":
      return "eq_shape_low_shelf";
    case "HIGH_SHELF":
      return "eq_shape_high_shelf";
    case "LOW_PASS":
      return "eq_shape_low_pass";
    case "HIGH_PASS":
      return "eq_shape_high_pass";
    case "NOTCH":
      return "eq_shape_notch";
  }
}

/** The curve's silhouette, drawn, not described: a bump, a step, a slope, or a dip. */
const SHAPE_PATHS: Record<EqFilterType, string> = {
  PEAK: "M1 15 C7 15 9 5 16 5 C23 5 25 15 31 15",
  LOW_SHELF: "M1 5 L13 5 C17 5 17 15 21 15 L31 15",
  HIGH_SHELF: "M1 15 L11 15 C15 15 15 5 19 5 L31 5",
  LOW_PASS: "M1 5 L15 5 C21 5 23 15 31 15",
  HIGH_PASS: "M1 15 L9 15 C15 15 17 5 23 5 L31 5",
  NOTCH: "M1 15 L11 15 L16 5 L21 15 L31 15",
};

/**
 * The shape as a picture next to the type picker — aria-hidden, because the same
 * meaning is spelled out in the shape description text beside it. A narrow bell
 * draws its bump pinched; a wide one draws it spread.
 */
export function EqShapeIcon({ band, className = "" }: { band: EqBand; className?: string }) {
  const narrow = band.type === "PEAK" && band.q >= EQ_SHAPE_NARROW_Q;
  const wide = band.type === "PEAK" && band.q <= EQ_SHAPE_WIDE_Q;
  const path = narrow
    ? "M1 15 L10 15 C12 15 13 4 16 4 C19 4 20 15 22 15 L31 15"
    : wide
      ? "M1 15 C5 15 7 8 16 8 C25 8 27 15 31 15"
      : SHAPE_PATHS[band.type];
  return (
    <svg
      viewBox="0 0 32 20"
      width="32"
      height="20"
      aria-hidden="true"
      className={`shrink-0 text-chrome-neutral-400 ${className}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
