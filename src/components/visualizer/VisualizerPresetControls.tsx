import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  VISUALIZER_DEFAULTS,
  enforceReducedFlash,
  type VisualizerConfig,
  type VisualizerPreset,
  type VisualizerPresetCategory,
} from "../../lib/audio/visualizer";
import { downloadDdviz, mergeVisualizerPresets, readDdvizFile } from "../../lib/audio/visualizerPresetFile";
import { VisualizerControl, visualizerInputClass } from "./VisualizerControl";

interface PendingPreset { name: string; config: VisualizerConfig }

export function VisualizerPresetControls({ value, apply, presets, savePresets, reducedFlash }: {
  value: VisualizerConfig;
  apply: (config: VisualizerConfig) => void;
  presets: VisualizerPreset[];
  savePresets: (value: string) => void;
  reducedFlash: boolean;
}) {
  const { t } = useTranslation("settings");
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [flashRisk, setFlashRisk] = useState(false);
  const [pending, setPending] = useState<PendingPreset | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const save = (next: VisualizerPreset[]) => savePresets(JSON.stringify(next));
  const load = (presetName: string, config: VisualizerConfig, warned: boolean) => {
    const next = { ...config, enabled: value.enabled };
    if (warned || config.family === "feedback") { setPending({ name: presetName, config: next }); return; }
    apply(next);
  };
  const confirmPending = () => {
    if (!pending) return;
    apply(reducedFlash ? enforceReducedFlash(pending.config) : pending.config);
    setPending(null);
  };
  const categories: Exclude<VisualizerPresetCategory, "custom">[] = ["calm", "energetic", "experimental"];

  return <section className="space-y-4 border-t border-outline-variant pt-4">
    <div>
      <h3 className="text-sm font-semibold text-on-surface">{t("visualizer.presetLibrary")}</h3>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t("visualizer.presetLibraryDesc")}</p>
    </div>
    {pending && <div role="alert" className="rounded-xl border-2 border-error p-3 text-sm" data-tooltip-detail={t("visualizer.flashWarningDesc")}>
      <p className="font-semibold">{t("visualizer.flashWarning", { name: pending.name })}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{reducedFlash ? t("visualizer.flashWarningReduced") : t("visualizer.flashWarningDesc")}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={confirmPending} className="rounded-full border-2 border-outline-variant px-3 py-2">{t("visualizer.applyPreset")}</button>
        <button type="button" onClick={() => setPending(null)} className="rounded-full border-2 border-outline-variant px-3 py-2">{t("visualizer.cancelPreset")}</button>
      </div>
    </div>}
    {categories.map((category) => <div key={category}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t(`visualizer.category_${category}`)}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {VISUALIZER_DEFAULTS.filter((preset) => preset.category === category).map((preset) => {
          const presetName = t(`visualizer.preset_${preset.key}`);
          return <button type="button" key={preset.key} onClick={() => load(presetName, preset.config, preset.flashRisk)}
            data-tooltip-detail={t(`visualizer.category_${category}_desc`)} className="rounded-full border-2 border-outline-variant px-3 py-2 text-sm">
            {presetName}{preset.flashRisk && <span className="ml-2 font-semibold">· {t("visualizer.flashBadge")}</span>}
          </button>;
        })}
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">{t(`visualizer.category_${category}_desc`)}</p>
    </div>)}
    <VisualizerControl label={t("visualizer.savePreset")} description={t("visualizer.savePresetDesc")}>
      <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        save([...presets, { name: name.trim().slice(0, 80), category: "custom" as const, flashRisk, config: value }].slice(-100));
        setName(""); setFlashRisk(false);
      }}>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t("visualizer.presetName")} placeholder={t("visualizer.presetName")} className={`min-w-0 flex-1 ${visualizerInputClass}`} />
          <button type="submit" className="rounded-full border-2 border-outline-variant px-3 py-2">{t("visualizer.savePreset")}</button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flashRisk} onChange={(event) => setFlashRisk(event.target.checked)} />
          {t("visualizer.markFlashRisk")}
        </label>
      </form>
    </VisualizerControl>
    {presets.length > 0 && <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t("visualizer.category_custom")}</h4>
      <div className="mt-2 flex flex-wrap gap-2">{presets.map((preset, index) => <button type="button" key={`${preset.name}-${index}`}
        onClick={() => load(preset.name, preset.config, preset.flashRisk)} className="rounded-full border-2 border-outline-variant px-3 py-2 text-sm">
        {preset.name}{preset.flashRisk && <span className="ml-2 font-semibold">· {t("visualizer.flashBadge")}</span>}
      </button>)}</div>
      <p className="mt-1 text-xs text-on-surface-variant">{t("visualizer.category_custom_desc")}</p>
    </div>}
    <VisualizerControl label={t("visualizer.portablePresets")} description={t("visualizer.portablePresetsDesc")}>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-full border-2 border-outline-variant px-3 py-2">
          <Upload size={16} />{t("visualizer.importDdviz")}
        </button>
        <button type="button" disabled={!presets.length} onClick={() => downloadDdviz(presets)} className="inline-flex items-center gap-2 rounded-full border-2 border-outline-variant px-3 py-2 disabled:opacity-40">
          <Download size={16} />{t("visualizer.exportDdviz")}
        </button>
        <input ref={fileInput} type="file" accept=".ddviz,application/json" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          try {
            const imported = await readDdvizFile(file);
            save(mergeVisualizerPresets(presets, imported));
            setImportStatus(t("visualizer.importSuccess", { count: imported.length }));
          } catch { setImportStatus(t("visualizer.importFailed")); }
        }} />
      </div>
      {importStatus && <p role="status" className="mt-2 text-xs text-on-surface-variant">{importStatus}</p>}
    </VisualizerControl>
  </section>;
}
