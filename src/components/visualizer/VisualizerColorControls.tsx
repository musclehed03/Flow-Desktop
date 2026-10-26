import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveVisualizerColors, type VisualizerConfig, type VisualizerFamilyColors } from "../../lib/audio/visualizer";
import { VisualizerControl, visualizerSelectClass } from "./VisualizerControl";

export function VisualizerColorControls({ value, apply, reducedFlash }: {
  value: VisualizerConfig;
  apply: (config: VisualizerConfig) => void;
  reducedFlash: boolean;
}) {
  const { t } = useTranslation("settings");
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
      <h3 className="text-sm font-semibold text-on-surface">{t("visualizer.colorModel")}</h3>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t("visualizer.colorModelDesc")}</p>
    </div>
    <VisualizerControl label={t("visualizer.familyOverride")} description={t("visualizer.familyOverrideDesc")}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(override)} onChange={(event) => toggleOverride(event.target.checked)} />
        {t("visualizer.familyOverrideLabel", { family: t(`visualizer.${value.family}`) })}
      </label>
    </VisualizerControl>
    <div className="grid gap-3 sm:grid-cols-2">
      <VisualizerControl label={t("visualizer.foreground")} description={t("visualizer.foregroundDesc")}>
        <input type="color" aria-label={t("visualizer.foreground")} value={model.foreground} onChange={(event) => update({ ...model, foreground: event.target.value })} className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
      </VisualizerControl>
      <VisualizerControl label={t("visualizer.background")} description={t("visualizer.backgroundDesc")}>
        <input type="color" aria-label={t("visualizer.background")} value={model.background} onChange={(event) => update({ ...model, background: event.target.value })} className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
      </VisualizerControl>
    </div>
    <VisualizerControl label={t("visualizer.gradientDirection")} description={t("visualizer.gradientDirectionDesc")}>
      <input type="range" aria-label={t("visualizer.gradientDirection")} min={0} max={360} step={1} value={model.angle}
        onChange={(event) => update({ ...model, angle: Number(event.target.value) })} className="w-full" />
      <output className="text-xs text-on-surface-variant">{Math.round(model.angle)}°</output>
    </VisualizerControl>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{t("visualizer.gradientStops")}</h4>
          <p className="text-xs text-on-surface-variant">{t("visualizer.gradientStopsDesc")}</p>
        </div>
        <button type="button" disabled={model.stops.length >= 10} onClick={addStop} className="inline-flex items-center gap-1 rounded-full border-2 border-outline-variant px-3 py-2 text-sm disabled:opacity-40">
          <Plus size={15} />{t("visualizer.addStop")}
        </button>
      </div>
      {model.stops.map((stop, index) => <div key={index} className="rounded-xl border-2 border-outline-variant p-3" data-tooltip-detail={t("visualizer.stopDesc")}>
        <div className="flex items-center gap-3">
          <label className="min-w-0 flex-1 text-xs font-semibold">{t("visualizer.stopColor", { number: index + 1 })}
            <input type="color" aria-label={t("visualizer.stopColor", { number: index + 1 })} value={stop.color}
              onChange={(event) => updateStop(index, { color: event.target.value })} className="mt-1 h-9 w-full rounded-lg border-2 border-outline-variant bg-surface p-1" />
          </label>
          <button type="button" aria-label={t("visualizer.removeStop", { number: index + 1 })} disabled={model.stops.length <= 1}
            onClick={() => removeStop(index)} className="rounded-full border-2 border-outline-variant p-2 disabled:opacity-40"><Trash2 size={16} /></button>
        </div>
        <label className="mt-2 block text-xs font-semibold">{t("visualizer.stopPosition", { percent: Math.round(stop.offset * 100) })}
          <input type="range" aria-label={t("visualizer.stopPositionLabel", { number: index + 1 })} min={0} max={1} step={0.01} value={stop.offset}
            onChange={(event) => updateStop(index, { offset: Number(event.target.value) })} className="block w-full" />
        </label>
        <p className="mt-1 text-xs text-on-surface-variant">{t("visualizer.stopDesc")}</p>
      </div>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <VisualizerControl label={t("visualizer.colorCycle")} description={reducedFlash ? t("visualizer.colorCycleReduced") : t("visualizer.colorCycleDesc")}>
        <select aria-label={t("visualizer.colorCycle")} value={model.cycleMode} disabled={reducedFlash}
          onChange={(event) => update({ ...model, cycleMode: event.target.value as VisualizerFamilyColors["cycleMode"] })} className={visualizerSelectClass}>
          {(["off", "hue", "sequence"] as const).map((mode) => <option key={mode} value={mode}>{t(`visualizer.cycle_${mode}`)}</option>)}
        </select>
      </VisualizerControl>
      <VisualizerControl label={t("visualizer.cycleSpeed")} description={t("visualizer.cycleSpeedDesc")}>
        <input type="range" aria-label={t("visualizer.cycleSpeed")} min={2} max={60} step={1} value={model.cycleSeconds} disabled={reducedFlash || model.cycleMode === "off"}
          onChange={(event) => update({ ...model, cycleSeconds: Number(event.target.value) })} className="w-full" />
        <output className="text-xs text-on-surface-variant">{t("visualizer.seconds", { count: model.cycleSeconds })}</output>
      </VisualizerControl>
    </div>
  </section>;
}
