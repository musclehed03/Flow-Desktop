import { NumberField } from "./NumberField";
import { Slider } from "./Slider";

export interface TypedSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
  'aria-label': string;
  'aria-describedby'?: string;
  disabled?: boolean;
  /** The typed and shown value is `value * displayScale`: volume 0–1 shows 0–100. */
  displayScale?: number;
  /** When the slider's own scale differs from the value's, map between them. */
  toSlider?: (value: number) => number;
  fromSlider?: (value: number) => number;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  className?: string;
  sliderClassName?: string;
  onCommit: (value: number) => void;
}

/**
 * Every value field in the app, in one shape (fixes batch #16): drag the slider for a
 * rough move, click the value and type the exact one. The slider commits live as it
 * always did; the typed value commits on Enter or leaving the field, and clamps to
 * [min, max] instead of applying an out-of-range number. One control, one value —
 * the field never sits apart from its slider.
 */
export function TypedSlider({
  value,
  min,
  max,
  step,
  decimals,
  unit,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  disabled,
  displayScale = 1,
  toSlider,
  fromSlider,
  sliderMin,
  sliderMax,
  sliderStep,
  className = "",
  sliderClassName = "",
  onCommit,
}: TypedSliderProps) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Slider
        min={sliderMin ?? min}
        max={sliderMax ?? max}
        step={sliderStep ?? step}
        value={toSlider ? toSlider(value) : value}
        onChange={(next) => onCommit(clamp(fromSlider ? fromSlider(next) : next))}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        className={`flex-1 ${sliderClassName}`}
      />
      <NumberField
        value={value * displayScale}
        decimals={decimals}
        unit={unit}
        disabled={disabled}
        ariaLabel={ariaLabel}
        ariaDescribedBy={ariaDescribedBy}
        onCommit={(typed) => onCommit(clamp(typed / displayScale))}
      />
    </span>
  );
}
