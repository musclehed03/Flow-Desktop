import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { groupMilkdropPresets, milkdropPresetNames } from "../../lib/audio/milkdrop";
import { enforceReducedFlash, parseVisualizerPresets, type VisualizerConfig } from "../../lib/audio/visualizer";
import { useLivePreviewHistory } from "../../lib/livePreviewHistory";
import { SETTINGS } from "../../lib/settings/schema";
import { useBoolPref, usePreference } from "../../lib/usePreference";
import { acceptVisualizerAdvisory, useVisualizerUi } from "../../lib/useVisualizer";
import { DockablePanel } from "../ui/DockablePanel";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { VisualizerColorControls } from "./VisualizerColorControls";
import { VisualizerControl, visualizerSelectClass } from "./VisualizerControl";
import { VisualizerPresetControls } from "./VisualizerPresetControls";

interface VisualizerCustomizerPanelProps {
  config: VisualizerConfig;
  openerRef: RefObject<HTMLElement | null>;
  onChange: (config: VisualizerConfig) => void;
  onClose: () => void;
}

const sliderDefinitions = [
  ["sensitivity", 0.2, 3, 0.1],
  ["smoothing", 0, 0.98, 0.01],
  ["density", 16, 160, 1],
  ["falloff", 0.1, 0.98, 0.01],
  ["beat", 0, 1, 0.05],
] as const;

export function VisualizerCustomizerPanel({ config, openerRef, onChange, onClose }: VisualizerCustomizerPanelProps) {
  const { t } = useTranslation("settings");
  const { value, apply, undo, reset, canUndo } = useLivePreviewHistory(config, onChange);
  const [presetsRaw, savePresets] = usePreference(SETTINGS.VISUALIZER_PRESETS);
  const presets = parseVisualizerPresets(presetsRaw);
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);
  const [pendingFlashConfig, setPendingFlashConfig] = useState<VisualizerConfig | null>(null);
  const [simple] = useBoolPref(SETTINGS.SIMPLIFIED_VIEW_ENABLED);
  const [focus] = useBoolPref(SETTINGS.SENSORY_FOCUS_ENABLED);
  const [reducedFlash, setReducedFlash] = useBoolPref(SETTINGS.REDUCED_FLASH_ENABLED, false);
  const acknowledged = useVisualizerUi((state) => state.consented);
  const previewApply = (next: VisualizerConfig) => apply(reducedFlash ? enforceReducedFlash(next) : next);

  useEffect(() => {
    if (value.family === "feedback") void milkdropPresetNames().then(setMilkdropNames).catch(() => setMilkdropNames([]));
  }, [value.family]);
  useEffect(() => {
    if (reducedFlash) apply(enforceReducedFlash(value));
  }, [reducedFlash]);

  return <DockablePanel panelId="visualizer-editor" title={t("visualizer.title")} description={t("visualizer.livePreview")}
    openerRef={openerRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
    <div className="space-y-4">
      <div role="note" className="rounded-xl border-2 border-outline-variant p-3">
        <p className="text-sm">{t("visualizer.advisory")}</p>
        <label className="mt-2 flex items-center gap-2 text-sm" data-tooltip-detail={t("visualizer.acknowledgeDesc")}>
          <input type="checkbox" checked={acknowledged} onChange={(event) => acceptVisualizerAdvisory(event.target.checked)} />
          {t("visualizer.acknowledge")}
        </label>
        <p className="mt-1 text-xs text-on-surface-variant">{t("visualizer.acknowledgeDesc")}</p>
      </div>

      <VisualizerControl label={t("visualizer.enabled")} description={t("visualizer.enabledDesc")}>
        <button type="button" aria-pressed={value.enabled} aria-label={t("visualizer.enabled")} disabled={!acknowledged && !value.enabled}
          onClick={() => previewApply({ ...value, enabled: !value.enabled })} className="rounded-full border-2 border-outline-variant px-4 py-2 disabled:opacity-40">
          {t(value.enabled ? "sensory.on" : "sensory.off")} · {t("visualizer.enabled")}
        </button>
      </VisualizerControl>

      <VisualizerControl label={t("sensory.reducedFlash.title")} description={t("visualizer.reducedFlashDesc")}>
        <ToggleSwitch checked={reducedFlash} onChange={setReducedFlash} label={t("sensory.reducedFlash.title")} />
      </VisualizerControl>
      {(simple || focus) && <p role="status" className="rounded-xl border-2 border-outline-variant p-3 text-sm">{t("visualizer.suiteHidden")}</p>}
      {pendingFlashConfig && <div role="alert" className="rounded-xl border-2 border-error p-3 text-sm">
        <p className="font-semibold">{t("visualizer.milkdropWarning")}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{t("visualizer.milkdropWarningDesc")}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => { previewApply(pendingFlashConfig); setPendingFlashConfig(null); }} className="rounded-full border-2 border-outline-variant px-3 py-2">{t("visualizer.applyPreset")}</button>
          <button type="button" onClick={() => setPendingFlashConfig(null)} className="rounded-full border-2 border-outline-variant px-3 py-2">{t("visualizer.cancelPreset")}</button>
        </div>
      </div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <VisualizerControl label={t("visualizer.family")} description={t("visualizer.familyDesc")}>
          <select aria-label={t("visualizer.family")} value={value.family} onChange={(event) => {
            const next = { ...value, family: event.target.value as VisualizerConfig["family"] };
            if (next.family === "feedback" && !reducedFlash) setPendingFlashConfig(next); else previewApply(next);
          }} className={visualizerSelectClass}>
            {(["spectrum", "waveform", "radial", "nebula", "feedback"] as const).map((family) => <option key={family} value={family} disabled={reducedFlash && family === "feedback"}>{t(`visualizer.${family}`)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={t("visualizer.mode")} description={t("visualizer.modeDesc")}>
          <select aria-label={t("visualizer.mode")} value={value.mode} onChange={(event) => previewApply({ ...value, mode: event.target.value as VisualizerConfig["mode"] })} className={visualizerSelectClass}>
            {(["inline", "mini", "fullscreen"] as const).map((mode) => <option key={mode} value={mode}>{t(`visualizer.${mode}`)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={t("visualizer.mirror")} description={t("visualizer.mirrorDesc")}>
          <select aria-label={t("visualizer.mirror")} value={value.mirror} onChange={(event) => previewApply({ ...value, mirror: event.target.value as VisualizerConfig["mirror"] })} className={visualizerSelectClass}>
            {(["none", "horizontal", "vertical", "quad", "kaleidoscope"] as const).map((mirror) => <option key={mirror} value={mirror} disabled={reducedFlash && mirror === "kaleidoscope"}>{t(`visualizer.mirror_${mirror}`)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={t("visualizer.direction")} description={t("visualizer.directionDesc")}>
          <select aria-label={t("visualizer.direction")} value={value.direction} onChange={(event) => previewApply({ ...value, direction: event.target.value as VisualizerConfig["direction"] })} className={visualizerSelectClass}>
            {(["up", "down", "left", "right"] as const).map((direction) => <option key={direction} value={direction}>{t(`visualizer.direction_${direction}`)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={t("visualizer.fps")} description={t("visualizer.fpsDesc")}>
          <select aria-label={t("visualizer.fps")} value={value.fps} onChange={(event) => previewApply({ ...value, fps: Number(event.target.value) as VisualizerConfig["fps"] })} className={visualizerSelectClass}>
            {[15, 30, 60].map((fps) => <option key={fps} value={fps} disabled={reducedFlash && fps > 30}>{fps}</option>)}
          </select>
        </VisualizerControl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sliderDefinitions.map(([key, min, max, step]) => {
          const safeMin = reducedFlash && key === "smoothing" ? 0.82 : reducedFlash && key === "falloff" ? 0.78 : min;
          const safeMax = reducedFlash && key === "sensitivity" ? 1.4 : reducedFlash && key === "beat" ? 0.35 : max;
          return <VisualizerControl key={key} label={`${t(`visualizer.${key}`)} · ${value[key]}`} description={t(`visualizer.${key}Desc`)}>
          <input type="range" aria-label={t(`visualizer.${key}`)} min={safeMin} max={safeMax} step={step} value={value[key]} className="block w-full"
            onChange={(event) => previewApply({ ...value, [key]: Number(event.target.value) })} />
        </VisualizerControl>;
        })}
      </div>

      {value.family === "feedback" && <VisualizerControl label={t("visualizer.milkdropPreset")} description={t("visualizer.milkdropPresetDesc")}>
        <select aria-label={t("visualizer.milkdropPreset")} value={value.milkdropPreset ?? milkdropNames[0] ?? ""}
          onChange={(event) => {
            const next = { ...value, milkdropPreset: event.target.value };
            if (reducedFlash) previewApply(next); else setPendingFlashConfig(next);
          }} className={visualizerSelectClass}>
          {groupMilkdropPresets(milkdropNames).map((group) => <optgroup key={group.name} label={group.name}>
            {group.presets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
          </optgroup>)}
        </select>
      </VisualizerControl>}

      <VisualizerColorControls value={value} apply={previewApply} reducedFlash={reducedFlash} />
      <VisualizerPresetControls value={value} apply={previewApply} presets={presets} savePresets={savePresets} reducedFlash={reducedFlash} />
    </div>
  </DockablePanel>;
}

export default VisualizerCustomizerPanel;
