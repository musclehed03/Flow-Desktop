import { Minus, Plus } from "lucide-react";

import { getString } from "../../../lib/i18n/index";
import { SETTINGS } from "../../../lib/settings/schema";
import { usePreference } from "../../../lib/usePreference";
import { Chip } from "../../ui/Chip";
import { Slider } from "../../ui/Slider";
import { EqNumberField } from "./EqNumberField";

export type EqInputMode = "text" | "stepper" | "slider";

/** The selected EQ input mode; anything else stored falls back to typing, her preference. */
export function useEqInputMode(): EqInputMode {
  const [raw] = usePreference(SETTINGS.EQ_INPUT_MODE);
  return raw === "stepper" || raw === "slider" ? raw : "text";
}

export interface EqValueControlProps {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
  ariaLabel: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Map a value to the slider's scale (log for Q and frequency); linear by default. */
  toSlider?: (value: number) => number;
  fromSlider?: (value: number) => number;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  className?: string;
  onCommit: (value: number) => void;
}

/**
 * One EQ value, one input at a time (fixes batch #9): type the value, step it with
 * arrows, or drag a slider — never all three at once. The mode is a persisted setting
 * (`eq_input_mode`, default text: click the value, it highlights, type the dB, Enter
 * applies). Every commit clamps to [min, max].
 */
export function EqValueControl({
  value,
  min,
  max,
  step,
  decimals,
  unit,
  ariaLabel,
  disabled,
  orientation = "horizontal",
  toSlider,
  fromSlider,
  sliderMin,
  sliderMax,
  sliderStep,
  className = "",
  onCommit,
}: EqValueControlProps) {
  const mode = useEqInputMode();
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    onCommit(Math.max(min, Math.min(max, next)));
  };
  const shown = `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  const vertical = orientation === "vertical";

  if (mode === "text") {
    return (
      <EqNumberField
        value={value}
        decimals={decimals}
        unit={unit}
        disabled={disabled}
        ariaLabel={ariaLabel}
        onCommit={commit}
      />
    );
  }

  if (mode === "stepper") {
    const stepButton =
      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-chrome-neutral-300 transition-colors duration-200 ease-out hover:bg-surface-container-highest hover:text-chrome-neutral-100 disabled:opacity-40";
    return (
      <span className={`flex items-center gap-1 ${vertical ? "flex-col" : ""} ${className}`}>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => commit(value + step)}
          aria-label={getString("eq_increase")}
          className={stepButton}
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center font-mono text-xs tabular-nums text-chrome-neutral-100">{shown}</span>
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => commit(value - step)}
          aria-label={getString("eq_decrease")}
          className={stepButton}
        >
          <Minus className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-2 ${vertical ? "flex-col" : ""} ${className}`}>
      <Slider
        orientation={orientation}
        min={sliderMin ?? min}
        max={sliderMax ?? max}
        step={sliderStep ?? step}
        value={toSlider ? toSlider(value) : value}
        onChange={(next) => commit(fromSlider ? fromSlider(next) : next)}
        aria-label={ariaLabel}
        disabled={disabled}
        className={vertical ? "" : "flex-1"}
      />
      <span className="font-mono text-xs tabular-nums text-chrome-neutral-400">{shown}</span>
    </span>
  );
}

/** The three-way mode picker, bound to the persisted `eq_input_mode` setting. */
export function EqInputModeSelector() {
  const [mode, setMode] = usePreference(SETTINGS.EQ_INPUT_MODE);
  const options: { value: EqInputMode; label: string }[] = [
    { value: "text", label: getString("eq_input_mode_text") },
    { value: "stepper", label: getString("eq_input_mode_stepper") },
    { value: "slider", label: getString("eq_input_mode_slider") },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-chrome-neutral-200">{getString("eq_input_mode")}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={getString("eq_input_mode")}>
        {options.map((option) => (
          <Chip
            key={option.value}
            active={mode === option.value}
            onClick={() => setMode(option.value)}
            className="h-7 px-2.5 text-xs"
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <span className="text-xs text-chrome-neutral-500">{getString("eq_input_mode_desc")}</span>
    </div>
  );
}
