import React, { useEffect, useMemo, useState } from "react";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import {
  DDT_LEGACY_F,
  DDT_LEGACY_RED,
  DDT_PALETTES,
  DDT_PINK,
  getDdtVariant,
  getSplashFrames,
  showDdtLettering,
  type DdtVariant,
  type SplashFrame,
} from "../../lib/brand/ddtMark";

// The container (YouTube shape), unchanged from upstream.
const CONTAINER_PATH =
  "M21.58 7.16C21.33 6.22 20.59 5.48 19.65 5.23C17.96 4.77 12 4.77 12 4.77C12 4.77 6.04 4.77 4.35 5.23C3.41 5.48 2.67 6.22 2.42 7.16C1.96 8.85 1.96 12.38 1.96 12.38C1.96 12.38 1.96 15.91 2.42 17.6C2.67 18.54 3.41 19.28 4.35 19.53C6.04 19.99 12 19.99 12 19.99C12 19.99 17.96 19.99 19.65 19.53C20.59 19.28 21.33 18.54 21.58 17.6C22.04 15.91 22.04 12.38 22.04 12.38C22.04 12.38 22.04 8.85 21.58 7.16Z";
// The "F" Symbol (Slanted for Speed), full size — the F-only small mark.
const F_PATH =
  "M10 7L18 7L17.2 9.5H12.8L12.2 11.5H16L15.2 14H11.5L10.5 17H7.5L10 7Z";
// The same F, scaled down and shifted up to make room for the DDT lettering.
const F_PATH_LETTERED =
  "M10.44 6.5L16.68 6.5L16.06 8.45H12.62L12.16 10.01H15.12L14.5 11.96H11.61L10.83 14.3H8.49L10.44 6.5Z";
// House mark frame of the splash intro: the Dollhouse, flat neon.
const HOUSE_PATH = "M12 4.5 L19.5 11 H17.5 V18.5 H6.5 V11 H4.5 Z";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  /** Play the flicker intro once on mount (startup splash, About header). Still under Safe Motion. */
  intro?: boolean;
  /** Override the time-picked variant (splash frames, tests). */
  variant?: DdtVariant;
}

export const Logo: React.FC<LogoProps> = ({
  className = "",
  size = 48,
  showText = false,
  intro = false,
  variant: variantProp,
}) => {
  const [safeMotion] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED);
  // Picked once at mount: the mark is right whenever the app starts, and it
  // does not flip mid-session (the OS icon cannot rotate either).
  const [pickedVariant] = useState(() => variantProp ?? getDdtVariant());
  const frames = useMemo(() => getSplashFrames(), []);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!intro || safeMotion) return;
    const frame = frames[frameIndex];
    if (!frame || !("ms" in frame)) return;
    const timer = setTimeout(
      () => setFrameIndex((i) => Math.min(i + 1, frames.length - 1)),
      frame.ms,
    );
    return () => clearTimeout(timer);
  }, [intro, safeMotion, frames, frameIndex]);

  const frame: SplashFrame =
    intro && !safeMotion
      ? frames[frameIndex] ?? { kind: "final", variant: pickedVariant }
      : { kind: "final", variant: pickedVariant };

  const renderDdtMark = (variant: DdtVariant) => {
    const palette = DDT_PALETTES[variant];
    const lettered = showDdtLettering(size);
    return (
      <>
        <path d={CONTAINER_PATH} fill={palette.container} />
        <path d={lettered ? F_PATH_LETTERED : F_PATH} fill={palette.mark} />
        {lettered && (
          <text
            x="12"
            y="18"
            textAnchor="middle"
            fontSize="3.5"
            fontWeight="800"
            letterSpacing="0.35"
            fill={palette.mark}
          >
            DDT
          </text>
        )}
      </>
    );
  };

  // Under Safe Motion the mark is completely still: no intro, no hover scale.
  const motionClass = safeMotion
    ? ""
    : "transition-transform duration-300 hover:scale-105 active:scale-95";

  return (
    <div className={`flex items-center gap-1 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 cursor-pointer ${motionClass}`}
      >
        {frame.kind === "legacy" && (
          <>
            <path d={CONTAINER_PATH} fill={DDT_LEGACY_RED} />
            <path d={F_PATH} fill={DDT_LEGACY_F} />
          </>
        )}
        {frame.kind === "house" && <path d={HOUSE_PATH} fill={DDT_PINK} />}
        {frame.kind === "dark" && null}
        {frame.kind === "variant" && renderDdtMark(frame.variant)}
        {frame.kind === "final" && renderDdtMark(frame.variant)}
      </svg>
      {showText && (
        <span className="font-extrabold text-xl tracking-tight text-chrome-neutral-100">
          Flow
        </span>
      )}
    </div>
  );
};

export default Logo;
