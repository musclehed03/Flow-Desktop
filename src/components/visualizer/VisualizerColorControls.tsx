import { getString, type StringKey } from "../../lib/i18n/index";
import { Plus, Trash2 } from "lucide-react";
import { resolveVisualizerColors, type VisualizerConfig, type VisualizerFamilyColors } from "../../lib/audio/visualizer";
import { VisualizerControl, visualizerSelectClass } from "./VisualizerControl";
import { TypedSlider } from "../ui/TypedSlider";

export function VisualizerColorControls({ value, apply, reducedFlash }: {
  value: VisualizerConfig;
  apply: (config: VisualizerConfig) => void;
  reducedFlash: boolean;
}) {
  const override = value.colors.familyOverrides[value.family];
  const model = resolveVisualizerColors(value);
  const update = (next: VisualizerFamilyColors) => {
    if (override) {
      apply({ ...value, colors: { ...value.colors, familyOverrides: { ...value.colors.familyOverrides, [value.family]: next } } });
    } else {
      apply({ ...value, colors: { ...value.colors, ...next } });
    }
  };
  const toggleOverride = (enabled: boolean) => {
    const familyOverrides = { ...value.colors.familyOverrides };
    if (enabled) familyOverrides[value.family] = model;
    else delete familyOverrides[value.family];
    apply({ ...value, colors: { ...value.colors, familyOverrides } });
  };
  const updateStop = (index: number, patch: Partial<(typeof model.stops)[number]>) => {
    const stops = model.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop);
    update({ ...model, stops });
  };
  const removeStop = (index: number) => update({ ...model, stops: model.stops.filter((_, stopIndex) => stopIndex !== index) });
  const addStop = () => {
    if (model.stops.length >= 10) return;
    const longest = model.stops.reduce((best, stop, index, stops) => index === 0 ? best : stop.offset - stops[index - 1]!.offset > best.gap
      ? { index, gap: stop.offset - stops[index - 1]!.offset }
      : best, { index: model.stops.length, gap: 1 / Math.max(1, model.stops.length) });
    const before = model.stops[Math.max(0, longest.index - 1)] ?? { offset: 0, color: model.foreground };
    const after = model.stops[longest.index] ?? { offset: 1, color: before.color };
    update({ ...model, stops: [...model.stops, { offset: (before.offset + after.offset) / 2, color: before.color }].sort((left, right) => left.offset - right.offset) });
  };

  return <section className="space-y-4 border-t border-outline-variant pt-4">
    <div>
      <h3 className="text-sm font-semibold text-on-surface">{getString('visualizer_colorModel')}</h3>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">{getString('visualizer_colorModelDesc')}</p>
    </div>
    <VisualizerControl label={getString('visualizer_familyOverride')} description={getString('visualizer_familyOverrideDesc')}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(override)} onChange={(event) => toggleOverride(event.target.checked)} />
        {getString('visualizer_familyOverrideLabel', getString(`visualizer_${value.family}` as StringKey))}
      </label>
    </VisualizerControl>
    <div className="grid gap-3 sm:grid-cols-2">
      <VisualizerControl label={getString('visualizer_foreground')} description={getString('visualizer_foregroundDesc')}>
        <input type="color" aria-label={getString('visualizer_foreground')} value={model.foreground} onChange={(event) => update({ ...model, foreground: event.target.value })} className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
      </VisualizerControl>
      <VisualizerControl label={getString('visualizer_background')} description={getString('visualizer_backgroundDesc')}>
        <input type="color" aria-label={getString('visualizer_background')} value={model.background} onChange={(event) => update({ ...model, background: event.target.value })} className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
      </VisualizerControl>
    </div>
    <VisualizerControl label={getString('visualizer_gradientDirection')} description={getString('visualizer_gradientDirectionDesc')}>
      <TypedSlider aria-label={getString('visualizer_gradientDirection')} min={0} max={360} step={1} decimals={0} unit="°"
        value={model.angle} onCommit={(angle) => update({ ...model, angle })} />
    </VisualizerControl>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{getString('visualizer_gradientStops')}</h4>
          <p className="text-xs text-on-surface-variant">{getString('visualizer_gradientStopsDesc')}</p>
        </div>
        <button type="button" disabled={model.stops.length >= 10} onClick={addStop} className="inline-flex items-center gap-1 rounded-full border-2 border-outline-variant px-3 py-2 text-sm disabled:opacity-40">
          <Plus size={15} />{getString('visualizer_addStop')}
        </button>
      </div>
      {model.stops.map((stop, index) => <div key={index} className="rounded-xl border-2 border-outline-variant p-3" data-tooltip-detail={getString('visualizer_stopDesc')}>
        <div className="flex items-center gap-3">
          <label className="min-w-0 flex-1 text-xs font-semibold">{getString('visualizer_stopColor', index + 1)}
            <input type="color" aria-label={getString('visualizer_stopColor', index + 1)} value={stop.color}
              onChange={(event) => updateStop(index, { color: event.target.value })} className="mt-1 h-9 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
          </label>
          <button type="button" aria-label={getString('visualizer_removeStop', index + 1)} disabled={model.stops.length <= 1}
            onClick={() => removeStop(index)} className="rounded-full border-2 border-outline-variant p-2 disabled:opacity-40"><Trash2 size={16} /></button>
        </div>
        <label className="mt-2 block text-xs font-semibold">{getString('visualizer_stopPosition', Math.round(stop.offset * 100))}
          <TypedSlider aria-label={getString('visualizer_stopPositionLabel', index + 1)} min={0} max={1} step={0.01}
            decimals={0} unit="%" displayScale={100} value={stop.offset}
            onCommit={(offset) => updateStop(index, { offset })} className="mt-1" />
        </label>
        <p className="mt-1 text-xs text-on-surface-variant">{getString('visualizer_stopDesc')}</p>
      </div>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <VisualizerControl label={getString('visualizer_colorCycle')} description={reducedFlash ? getString('visualizer_colorCycleReduced') : getString('visualizer_colorCycleDesc')}>
        <select aria-label={getString('visualizer_colorCycle')} value={model.cycleMode} disabled={reducedFlash}
          onChange={(event) => update({ ...model, cycleMode: event.target.value as VisualizerFamilyColors["cycleMode"] })} className={visualizerSelectClass}>
          {(["off", "hue", "sequence"] as const).map((mode) => <option key={mode} value={mode}>{getString(`visualizer_cycle_${mode}` as StringKey)}</option>)}
        </select>
      </VisualizerControl>
      <VisualizerControl label={getString('visualizer_cycleSpeed')} description={getString('visualizer_cycleSpeedDesc')}>
        <TypedSlider aria-label={getString('visualizer_cycleSpeed')} min={2} max={60} step={1} decimals={0} unit="s"
          value={model.cycleSeconds} disabled={reducedFlash || model.cycleMode === "off"}
          onCommit={(cycleSeconds) => update({ ...model, cycleSeconds })} />
      </VisualizerControl>
    </div>
  </section>;
}
