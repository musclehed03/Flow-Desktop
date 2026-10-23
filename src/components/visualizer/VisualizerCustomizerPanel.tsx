import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { milkdropPresetNames } from "../../lib/audio/milkdrop";
import { parseVisualizerPresets, VISUALIZER_DEFAULTS, type VisualizerConfig } from "../../lib/audio/visualizer";
import { useLivePreviewHistory } from "../../lib/livePreviewHistory";
import { SETTINGS } from "../../lib/settings/schema";
import { useBoolPref, usePreference } from "../../lib/usePreference";
import { acceptVisualizerAdvisory, useVisualizerUi } from "../../lib/useVisualizer";
import { DockablePanel } from "../ui/DockablePanel";

interface VisualizerCustomizerPanelProps {
  config: VisualizerConfig;
  openerRef: RefObject<HTMLElement | null>;
  onChange: (config: VisualizerConfig) => void;
  onClose: () => void;
}

export function VisualizerCustomizerPanel({ config, openerRef, onChange, onClose }: VisualizerCustomizerPanelProps) {
  const { t } = useTranslation("settings");
  const { value, apply, undo, reset, canUndo } = useLivePreviewHistory(config, onChange);
  const [presetsRaw, savePresets] = usePreference(SETTINGS.VISUALIZER_PRESETS);
  const presets = parseVisualizerPresets(presetsRaw);
  const [name, setName] = useState("");
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);
  const [simple] = useBoolPref(SETTINGS.SIMPLIFIED_VIEW_ENABLED);
  const [focus] = useBoolPref(SETTINGS.SENSORY_FOCUS_ENABLED);
  const acknowledged = useVisualizerUi((state) => state.consented);

  useEffect(() => {
    if (value.family === "feedback") void milkdropPresetNames().then(setMilkdropNames).catch(() => setMilkdropNames([]));
  }, [value.family]);

  return (
    <DockablePanel panelId="visualizer-editor" title={t("visualizer.title")} description={t("visualizer.customize")}
      openerRef={openerRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
      <p className="mb-3 text-sm" role="note">{t("visualizer.advisory")}</p>
      <label className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={acknowledged} onChange={(event) => acceptVisualizerAdvisory(event.target.checked)} />
        {t("visualizer.acknowledge")}
      </label>
      <button type="button" aria-pressed={value.enabled} aria-label={t("visualizer.enabled")} disabled={!acknowledged && !value.enabled}
        onClick={() => apply({ ...value, enabled: !value.enabled })} className="mb-4 rounded-full border border-outline-variant px-4 py-2">
        {t(value.enabled ? "sensory.on" : "sensory.off")} · {t("visualizer.enabled")}
      </button>
      {(simple || focus) && <p role="status">{t("visualizer.suiteHidden")}</p>}
      <div className="grid gap-3">
        <label>{t("visualizer.family")}<select value={value.family} onChange={(event) => apply({ ...value, family: event.target.value as VisualizerConfig["family"] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{["spectrum","waveform","radial","nebula","feedback"].map((family) => <option key={family} value={family}>{t(`visualizer.${family}`)}</option>)}</select></label>
        <label>{t("visualizer.mode")}<select value={value.mode} onChange={(event) => apply({ ...value, mode: event.target.value as VisualizerConfig["mode"] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{["inline","mini","fullscreen"].map((mode) => <option key={mode} value={mode}>{t(`visualizer.${mode}`)}</option>)}</select></label>
        <label>{t("visualizer.palette")}<select value={value.palette} onChange={(event) => apply({ ...value, palette: event.target.value as VisualizerConfig["palette"] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{["deviants","cyan","mono"].map((palette) => <option key={palette} value={palette}>{t(`visualizer.${palette}`)}</option>)}</select></label>
        <label>{t("visualizer.fps")}<select value={value.fps} onChange={(event) => apply({ ...value, fps: Number(event.target.value) as VisualizerConfig["fps"] })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{[15,30,60].map((fps) => <option key={fps}>{fps}</option>)}</select></label>
        {([['sensitivity',.2,3,.1],['smoothing',0,.98,.01],['density',16,160,1],['falloff',.1,.98,.01],['beat',0,1,.05]] as const).map(([key,min,max,step]) => <label key={key}>{t(`visualizer.${key}`)} · {value[key]}
          <input type="range" aria-label={t(`visualizer.${key}`)} min={min} max={max} step={step} value={value[key]} className="block w-full"
            onChange={(event) => apply({ ...value, [key]: Number(event.target.value) })} /></label>)}
      </div>
      {value.family === "feedback" && <label className="mt-3 block">{t("visualizer.milkdropPreset")}<select value={value.milkdropPreset ?? milkdropNames[0] ?? ""} onChange={(event) => apply({ ...value, milkdropPreset: event.target.value })} className="block w-full rounded-lg border border-outline-variant bg-surface p-2 text-on-surface">{milkdropNames.map((preset) => <option key={preset}>{preset}</option>)}</select></label>}
      <div className="my-4 flex flex-wrap gap-2">{VISUALIZER_DEFAULTS.map((preset) => <button type="button" key={preset.key} className="rounded-full border border-outline-variant px-3 py-2" onClick={() => apply({ ...preset.config, enabled: value.enabled })}>{t(`visualizer.preset_${preset.key}`)}</button>)}</div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { savePresets(JSON.stringify([...presets, { name: name.trim(), config: value }])); setName(""); } }}>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t("visualizer.presetName")} className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface p-2 text-on-surface" />
        <button type="submit" className="rounded-full border border-outline-variant px-3 py-2">{t("visualizer.savePreset")}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">{presets.map((preset,index) => <button type="button" key={`${preset.name}-${index}`} className="rounded-full border border-outline-variant px-3 py-2" onClick={() => apply({ ...preset.config, enabled: value.enabled })}>{preset.name}</button>)}</div>
    </DockablePanel>
  );
}

export default VisualizerCustomizerPanel;
