import { Plus, Trash2 } from "lucide-react";

import { defaultQ, EQ_FILTER_TYPES, EqLimits, hasGain, type EqBand, type EqFilterType } from "../../../lib/audio/eq/models";
import { getString, type StringKey } from "../../../lib/i18n/index";
import { Select } from "../../ui/Select";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { EqShapeIcon, shapeDescriptionKey } from "./EqShape";
import { EqValueControl } from "./EqValueControl";

const TYPE_LABELS: Record<EqFilterType, StringKey> = {
  PEAK: "eq_type_peak",
  LOW_SHELF: "eq_type_low_shelf",
  HIGH_SHELF: "eq_type_high_shelf",
  LOW_PASS: "eq_type_low_pass",
  HIGH_PASS: "eq_type_high_pass",
  NOTCH: "eq_type_notch",
};

/*
  What each control does, in plain language, shown once above the bands and read aloud
  by every band's controls (fixes batch #12): a screen reader on any frequency, gain,
  Q or type control hears the explainer, and a sighted reader sees it without hunting.
  The per-band shape line underneath each row says what THIS band's shape does.
*/
const LEGEND: { id: string; label: StringKey; desc: StringKey }[] = [
  { id: "eq-band-legend-type", label: "eq_filter_type", desc: "eq_filter_type_desc" },
  { id: "eq-band-legend-frequency", label: "eq_frequency", desc: "eq_frequency_desc" },
  { id: "eq-band-legend-gain", label: "eq_gain", desc: "eq_gain_desc" },
  { id: "eq-band-legend-q", label: "eq_q", desc: "eq_q_desc" },
];

// Q spans two decades, so its slider runs on a log scale: the middle is Q 1.4, not Q 10.
const Q_STEPS = 1_000;
const qToSlider = (q: number) =>
  Math.round((Math.log(q / EqLimits.MIN_Q) / Math.log(EqLimits.MAX_Q / EqLimits.MIN_Q)) * Q_STEPS);
const sliderToQ = (v: number) =>
  Math.round(EqLimits.MIN_Q * Math.pow(EqLimits.MAX_Q / EqLimits.MIN_Q, v / Q_STEPS) * 100) / 100;

// Frequency spans three decades, so its slider is log-scaled too.
const FREQ_STEPS = 1_000;
const freqToSlider = (frequency: number) =>
  Math.round(
    (Math.log(frequency / EqLimits.MIN_FREQUENCY) /
      Math.log(EqLimits.MAX_FREQUENCY / EqLimits.MIN_FREQUENCY)) *
      FREQ_STEPS,
  );
const sliderToFreq = (v: number) =>
  Math.round(
    EqLimits.MIN_FREQUENCY *
      Math.pow(EqLimits.MAX_FREQUENCY / EqLimits.MIN_FREQUENCY, v / FREQ_STEPS),
  );

export interface EqBandListProps {
  bands: readonly EqBand[];
  selected: number | null;
  canAdd: boolean;
  onSelect: (index: number) => void;
  onChange: (index: number, band: EqBand) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

export function EqBandList({ bands, selected, canAdd, onSelect, onChange, onRemove, onAdd }: EqBandListProps) {
  const typeOptions = EQ_FILTER_TYPES.map((type) => ({ value: type, label: getString(TYPE_LABELS[type]) }));

  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col gap-0.5 rounded-lg border border-chrome-neutral-800 px-3 py-2 text-xs text-chrome-neutral-500">
        {LEGEND.map(({ id, label, desc }) => (
          <div key={id} className="flex gap-2">
            <dt className="w-20 shrink-0 font-medium text-chrome-neutral-400">{getString(label)}</dt>
            <dd id={id}>{getString(desc)}</dd>
          </div>
        ))}
      </dl>
      {bands.length === 0 ? (
        <p className="rounded-lg border border-dashed border-chrome-neutral-800 px-3 py-4 text-center text-sm text-chrome-neutral-500">
          {getString("eq_no_bands")}
        </p>
      ) : (
        <ul className="divide-y divide-chrome-neutral-800 rounded-lg border border-chrome-neutral-800">
          {bands.map((band, index) => {
            const shapeDescId = `eq-band-${index}-shape-desc`;
            return (
            <li
              key={index}
              onFocusCapture={() => onSelect(index)}
              onPointerDown={() => onSelect(index)}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 transition-colors duration-200 ease-out ${
                index === selected ? "bg-surface-container-high" : "hover:bg-surface-container-low"
              }`}
            >
              <span className="w-5 font-mono text-xs text-chrome-neutral-500">{index + 1}</span>
              <Select
                value={band.type}
                options={typeOptions}
                className="w-36"
                ariaDescribedBy={`${shapeDescId} eq-band-legend-type`}
                onChange={(value) => {
                  const type = value as EqFilterType;
                  onChange(index, { ...band, type, q: defaultQ(type), gain: hasGain(type) ? band.gain : 0 });
                }}
              />
              <EqValueControl
                value={band.frequency}
                min={EqLimits.MIN_FREQUENCY}
                max={EqLimits.MAX_FREQUENCY}
                step={10}
                decimals={0}
                unit={getString("eq_unit_hz")}
                ariaLabel={getString("eq_frequency")}
                ariaDescribedBy="eq-band-legend-frequency"
                toSlider={freqToSlider}
                fromSlider={sliderToFreq}
                sliderMin={0}
                sliderMax={FREQ_STEPS}
                sliderStep={1}
                onCommit={(frequency) => onChange(index, { ...band, frequency })}
              />
              <EqValueControl
                value={band.gain}
                min={EqLimits.MIN_GAIN}
                max={EqLimits.MAX_GAIN}
                step={0.5}
                decimals={2}
                unit={getString("eq_unit_db")}
                disabled={!hasGain(band.type)}
                ariaLabel={getString("eq_gain")}
                ariaDescribedBy="eq-band-legend-gain"
                onCommit={(gain) => onChange(index, { ...band, gain })}
              />
              <div className="flex min-w-[10rem] flex-1 items-center gap-2">
                <span className="text-xs text-chrome-neutral-500">{getString("eq_q")}</span>
                <EqValueControl
                  value={band.q}
                  min={EqLimits.MIN_Q}
                  max={EqLimits.MAX_Q}
                  step={0.1}
                  decimals={2}
                  ariaLabel={getString("eq_q")}
                  ariaDescribedBy="eq-band-legend-q"
                  toSlider={qToSlider}
                  fromSlider={sliderToQ}
                  sliderMin={0}
                  sliderMax={Q_STEPS}
                  sliderStep={1}
                  className="flex-1"
                  onCommit={(q) => onChange(index, { ...band, q })}
                />
              </div>
              <ToggleSwitch checked={band.enabled} onChange={(enabled) => onChange(index, { ...band, enabled })} />
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={getString("eq_remove_band")}
                className="grid h-8 w-8 place-items-center rounded-full text-chrome-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-highest hover:text-chrome-neutral-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {/* The shape, drawn and spelled out: what this band does to the sound. */}
              <div className="flex w-full items-center gap-2 pl-7">
                <EqShapeIcon band={band} />
                <p id={shapeDescId} className="text-xs text-chrome-neutral-500">
                  {getString(shapeDescriptionKey(band))}
                </p>
              </div>
            </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface-container-high px-3 py-1.5 text-sm text-chrome-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        {getString("eq_add_band")}
      </button>
    </div>
  );
}
