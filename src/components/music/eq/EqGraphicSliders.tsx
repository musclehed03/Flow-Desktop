import { GraphicEq } from "../../../lib/audio/eq/limits";
import type { EqBand } from "../../../lib/audio/eq/models";
import { getString } from "../../../lib/i18n/index";
import { formatFrequency } from "./eqFormat";
import { EqValueControl } from "./EqValueControl";

export interface EqGraphicSlidersProps {
  bands: readonly EqBand[];
  disabled?: boolean;
  onChange: (index: number, gain: number) => void;
}

/** Android's ten graphic bands, ±15 dB in half-dB steps, one input mode at a time. */
export function EqGraphicSliders({ bands, disabled, onChange }: EqGraphicSlidersProps) {
  return (
    <div className={`flex items-end justify-between gap-1 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      {bands.map((band, i) => (
        <div key={band.frequency} className="flex flex-col items-center gap-1.5">
          <EqValueControl
            orientation="vertical"
            value={band.gain}
            min={-GraphicEq.MAX_GAIN}
            max={GraphicEq.MAX_GAIN}
            step={GraphicEq.STEP}
            decimals={2}
            unit={getString("eq_unit_db")}
            ariaLabel={getString("eq_band_label", formatFrequency(band.frequency))}
            disabled={disabled}
            onCommit={(gain) => onChange(i, gain)}
          />
          <span className="font-mono text-[10px] text-chrome-neutral-500">{formatFrequency(band.frequency)}</span>
        </div>
      ))}
    </div>
  );
}
