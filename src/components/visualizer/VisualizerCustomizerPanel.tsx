import { getString, type StringKey } from "../../lib/i18n/index";
import { useEffect, useState, type RefObject } from "react";
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
import { TypedSlider } from "../ui/TypedSlider";
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

  return <DockablePanel panelId="visualizer-editor" title={getString('visualizer_title')} description={getString('visualizer_livePreview')}
    openerRef={openerRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
    <div className="space-y-4">
      <div role="note" className="rounded-xl border-2 border-outline-variant p-3">
        <p className="text-sm">{getString('visualizer_advisory')}</p>
        <label className="mt-2 flex items-center gap-2 text-sm" data-tooltip-detail={getString('visualizer_acknowledgeDesc')}>
          <input type="checkbox" checked={acknowledged} onChange={(event) => acceptVisualizerAdvisory(event.target.checked)} />
          {getString('visualizer_acknowledge')}
        </label>
        <p className="mt-1 text-xs text-on-surface-variant">{getString('visualizer_acknowledgeDesc')}</p>
      </div>

      <VisualizerControl label={getString('visualizer_enabled')} description={getString('visualizer_enabledDesc')}>
        <button type="button" aria-pressed={value.enabled} aria-label={getString('visualizer_enabled')} disabled={!acknowledged && !value.enabled}
          onClick={() => previewApply({ ...value, enabled: !value.enabled })} className="rounded-full border-2 border-outline-variant px-4 py-2 disabled:opacity-40">
          {getString(value.enabled ? 'sensory_on' : 'sensory_off')} · {getString('visualizer_enabled')}
        </button>
      </VisualizerControl>

      <VisualizerControl label={getString('sensory_reducedFlash_title')} description={getString('visualizer_reducedFlashDesc')}>
        <ToggleSwitch checked={reducedFlash} onChange={setReducedFlash} label={getString('sensory_reducedFlash_title')} />
      </VisualizerControl>
      {(simple || focus) && <p role="status" className="rounded-xl border-2 border-outline-variant p-3 text-sm">{getString('visualizer_suiteHidden')}</p>}
      {pendingFlashConfig && <div role="alert" className="rounded-xl border-2 border-error p-3 text-sm">
        <p className="font-semibold">{getString('visualizer_milkdropWarning')}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{getString('visualizer_milkdropWarningDesc')}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => { previewApply(pendingFlashConfig); setPendingFlashConfig(null); }} className="rounded-full border-2 border-outline-variant px-3 py-2">{getString('visualizer_applyPreset')}</button>
          <button type="button" onClick={() => setPendingFlashConfig(null)} className="rounded-full border-2 border-outline-variant px-3 py-2">{getString('visualizer_cancelPreset')}</button>
        </div>
      </div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <VisualizerControl label={getString('visualizer_family')} description={getString('visualizer_familyDesc')}>
          <select aria-label={getString('visualizer_family')} value={value.family} onChange={(event) => {
            const next = { ...value, family: event.target.value as VisualizerConfig["family"] };
            if (next.family === "feedback" && !reducedFlash) setPendingFlashConfig(next); else previewApply(next);
          }} className={visualizerSelectClass}>
            {(["spectrum", "waveform", "radial", "nebula", "feedback"] as const).map((family) => <option key={family} value={family} disabled={reducedFlash && family === "feedback"}>{getString(`visualizer_${family}` as StringKey)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={getString('visualizer_mode')} description={getString('visualizer_modeDesc')}>
          <select aria-label={getString('visualizer_mode')} value={value.mode} onChange={(event) => previewApply({ ...value, mode: event.target.value as VisualizerConfig["mode"] })} className={visualizerSelectClass}>
            {(["inline", "mini", "fullscreen"] as const).map((mode) => <option key={mode} value={mode}>{getString(`visualizer_${mode}` as StringKey)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={getString('visualizer_mirror')} description={getString('visualizer_mirrorDesc')}>
          <select aria-label={getString('visualizer_mirror')} value={value.mirror} onChange={(event) => previewApply({ ...value, mirror: event.target.value as VisualizerConfig["mirror"] })} className={visualizerSelectClass}>
            {(["none", "horizontal", "vertical", "quad", "kaleidoscope"] as const).map((mirror) => <option key={mirror} value={mirror} disabled={reducedFlash && mirror === "kaleidoscope"}>{getString(`visualizer_mirror_${mirror}` as StringKey)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={getString('visualizer_direction')} description={getString('visualizer_directionDesc')}>
          <select aria-label={getString('visualizer_direction')} value={value.direction} onChange={(event) => previewApply({ ...value, direction: event.target.value as VisualizerConfig["direction"] })} className={visualizerSelectClass}>
            {(["up", "down", "left", "right"] as const).map((direction) => <option key={direction} value={direction}>{getString(`visualizer_direction_${direction}` as StringKey)}</option>)}
          </select>
        </VisualizerControl>
        <VisualizerControl label={getString('visualizer_fps')} description={getString('visualizer_fpsDesc')}>
          <select aria-label={getString('visualizer_fps')} value={value.fps} onChange={(event) => previewApply({ ...value, fps: Number(event.target.value) as VisualizerConfig["fps"] })} className={visualizerSelectClass}>
            {[15, 30, 60].map((fps) => <option key={fps} value={fps} disabled={reducedFlash && fps > 30}>{fps}</option>)}
          </select>
        </VisualizerControl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sliderDefinitions.map(([key, min, max, step]) => {
          const safeMin = reducedFlash && key === "smoothing" ? 0.82 : reducedFlash && key === "falloff" ? 0.78 : min;
          const safeMax = reducedFlash && key === "sensitivity" ? 1.4 : reducedFlash && key === "beat" ? 0.35 : max;
          return <VisualizerControl key={key} label={getString(`visualizer_${key}` as StringKey)} description={getString(`visualizer_${key}Desc` as StringKey)}>
          <TypedSlider aria-label={getString(`visualizer_${key}` as StringKey)} min={safeMin} max={safeMax} step={step}
            decimals={step >= 1 ? 0 : step >= 0.1 ? 1 : 2} value={value[key]}
            onCommit={(next) => previewApply({ ...value, [key]: next })} />
        </VisualizerControl>;
        })}
      </div>

      {value.family === "feedback" && <VisualizerControl label={getString('visualizer_milkdropPreset')} description={getString('visualizer_milkdropPresetDesc')}>
        <select aria-label={getString('visualizer_milkdropPreset')} value={value.milkdropPreset ?? milkdropNames[0] ?? ""}
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
