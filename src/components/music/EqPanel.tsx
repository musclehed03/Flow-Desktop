import { useRef, type ReactNode, type RefObject } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { GRAPHIC_BAND_COUNTS, defaultAudioProcessingConfig, formatFrequency, graphicFrequencies, parseAutoEq, resampleGraphicCurve, responsePath, type AudioProcessingConfig, type GraphicBandCount, type ParametricEqBand } from "../../lib/audio/eqConfig";
import { currentOutputDevice, parseOutputDeviceProfiles } from "../../lib/audio/outputDeviceProfiles";
import { SETTINGS } from "../../lib/settings/schema";
import { getSettingValue, setSettingValue } from "../../store/useAppSettingsStore";
import { getString, type StringKey } from "../../lib/i18n/index";
import { useLivePreviewHistory } from "../../lib/livePreviewHistory";
import { useBoolPref } from "../../lib/usePreference";
import { useUiStore } from "../../store/useUiStore";
import { Button } from "../ui/Button";
import { DockablePanel } from "../ui/DockablePanel";
import { ToggleSwitch } from "../ui/ToggleSwitch";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const explain = (key: StringKey, children: ReactNode) => <label className="block" data-tooltip-detail={getString(`${key}_desc` as StringKey)}><span className="text-sm font-medium text-on-surface">{getString(key)}</span>{children}<span className="mt-1 block text-xs text-on-surface-variant">{getString(`${key}_desc` as StringKey)}</span></label>;

function NumberField({ value, min, max, step, label, onChange }: { value: number; min: number; max: number; step: number; label: string; onChange: (value: number) => void }) {
  return <input type="number" aria-label={label} value={Number(value.toFixed(step < 1 ? 2 : 0))} min={min} max={max} step={step} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} className="w-20 rounded-md border border-outline-variant bg-surface-container px-2 py-1 font-mono text-xs" />;
}

function EqDial({ value, label, onChange }: { value: number; label: string; onChange: (value: number) => void }) {
  const angle = -135 + (value + 15) / 30 * 270;
  return <span className="relative grid h-12 w-12 place-items-center rounded-full border-2 border-outline-variant bg-surface-container" data-tooltip-detail={getString("eq_dial_desc")}>
    <span aria-hidden="true" className="absolute h-4 w-0.5 origin-bottom bg-primary" style={{ transform: `translateY(-8px) rotate(${angle}deg)` }} />
    <input aria-label={label} type="range" min={-15} max={15} step={.1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="absolute inset-0 cursor-ns-resize opacity-0" />
  </span>;
}

function EqBandEditor({ band, onChange, onRemove }: { band: ParametricEqBand; onChange: (band: ParametricEqBand) => void; onRemove: () => void }) {
  return <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
    <div className="grid grid-cols-2 gap-3">
      {explain("eq_frequency", <><input type="range" min={20} max={20000} step={1} value={band.frequency} onChange={(event) => onChange({ ...band, frequency: Number(event.target.value) })} className="mt-2 w-full" /><NumberField label={getString("eq_frequency_hz")} value={band.frequency} min={20} max={20000} step={1} onChange={(frequency) => onChange({ ...band, frequency })} /></>)}
      {explain("eq_gain", <><input type="range" min={-15} max={15} step={.1} value={band.gain} onChange={(event) => onChange({ ...band, gain: Number(event.target.value) })} className="mt-2 w-full" /><NumberField label={getString("eq_gain_db")} value={band.gain} min={-15} max={15} step={.1} onChange={(gain) => onChange({ ...band, gain })} /></>)}
      {explain("eq_q", <><input type="range" min={.1} max={18} step={.1} value={band.q} onChange={(event) => onChange({ ...band, q: Number(event.target.value) })} className="mt-2 w-full" /><NumberField label={getString("eq_q")} value={band.q} min={.1} max={18} step={.1} onChange={(q) => onChange({ ...band, q })} /></>)}
      {explain("eq_filter_type", <select value={band.type} onChange={(event) => onChange({ ...band, type: event.target.value as ParametricEqBand["type"] })} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-sm">{["peaking", "lowshelf", "highshelf", "lowpass", "highpass", "notch"].map((type) => <option key={type} value={type}>{getString(`eq_filter_${type}` as StringKey)}</option>)}</select>)}
    </div>
    <button type="button" aria-label={getString("eq_remove_band")} onClick={onRemove} className="self-start rounded-md p-2 text-on-surface-variant hover:text-error"><Trash2 size={16} /></button>
  </div>;
}

export function EqPanel({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; placement?: "top" | "bottom"; triggerRef?: RefObject<HTMLElement | null> }) {
  const storeConfig = useMusicPlayerStore((state) => state.audioProcessing);
  const setStoreConfig = useMusicPlayerStore((state) => state.setAudioProcessing);
  const fallbackRef = useRef<HTMLElement | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const { value, apply, undo, reset, canUndo } = useLivePreviewHistory(storeConfig, setStoreConfig);
  const [stableVolume, setStableVolume] = useBoolPref(SETTINGS.STABLE_VOLUME_ENABLED, false);
  const [skipSilence, setSkipSilence] = useBoolPref(SETTINGS.SKIP_SILENCE_ENABLED, false);
  const [volumeBoost, setVolumeBoost] = useBoolPref(SETTINGS.ALLOW_VOLUME_BOOST, false);
  if (!open) return null;
  const updateDynamics = (patch: Partial<AudioProcessingConfig["dynamics"]>) => apply({ ...value, dynamics: { ...value.dynamics, ...patch } });
  const setBandCount = (bandCount: GraphicBandCount) => apply({ ...value, bandCount, graphicGains: { ...value.graphicGains, [bandCount]: resampleGraphicCurve(value.graphicGains[value.bandCount], value.bandCount, bandCount) } });
  const setGraphicGain = (index: number, gain: number) => { const gains = [...value.graphicGains[value.bandCount]]; gains[index] = clamp(gain, -15, 15); apply({ ...value, graphicGains: { ...value.graphicGains, [value.bandCount]: gains } }); };
  const importAutoEq = async (file: File | undefined) => { if (!file) return; try { apply({ ...value, mode: "parametric", parametricBands: parseAutoEq(await file.text()) }); useUiStore.getState().showToast({ message: getString("eq_autoeq_imported"), variant: "success" }); } catch { useUiStore.getState().showToast({ message: getString("eq_autoeq_failed"), variant: "error" }); } finally { if (importRef.current) importRef.current.value = ""; } };
  const saveDevice = async () => {
    const profiles = parseOutputDeviceProfiles(getSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES));
    const output = await currentOutputDevice(profiles.salt).catch(() => null);
    if (!output) { useUiStore.getState().showToast({ message: getString("eq_device_unavailable"), variant: "error" }); return; }
    const next = [...profiles.profiles]; const index = next.findIndex((profile) => profile.deviceKey === output.key); const profile = { deviceKey: output.key, label: output.label, config: value };
    if (index >= 0) next[index] = profile; else next.push(profile);
    await setSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES, JSON.stringify({ ...profiles, activeDeviceKey: output.key, profiles: next }));
    useUiStore.getState().showToast({ message: getString("eq_device_saved", output.label), variant: "success" });
  };
  return <DockablePanel panelId="equalizer-editor" title={getString("music_equalizer")} description={getString("eq_live_description")} openerRef={triggerRef ?? fallbackRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
    <div className="flex items-center justify-between gap-3"><div><span className="text-sm font-semibold">{getString("eq_processing")}</span><p className="text-xs text-on-surface-variant">{getString("eq_processing_desc")}</p></div><ToggleSwitch checked={value.enabled} onChange={(enabled) => apply({ ...value, enabled })} label={getString("eq_processing")} /></div>
    <svg viewBox="0 0 640 140" role="img" aria-label={getString("eq_response_graph")} className="mt-4 h-32 w-full rounded-xl border border-outline-variant bg-surface-container-low"><path d="M0,70 L640,70" stroke="var(--color-outline-variant-val)" fill="none" /><path d={responsePath(value)} stroke="var(--color-primary)" strokeWidth="3" fill="none" /></svg>
    <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label={getString("eq_mode")}><Button variant={value.mode === "graphic" ? "primary" : "secondary"} onClick={() => apply({ ...value, mode: "graphic" })}>{getString("eq_graphic")}</Button><Button variant={value.mode === "parametric" ? "primary" : "secondary"} onClick={() => apply({ ...value, mode: "parametric" })}>{getString("eq_parametric")}</Button></div>
    {value.mode === "graphic" ? <div className="mt-4">
      <div className="flex gap-2">{GRAPHIC_BAND_COUNTS.map((count) => <Button key={count} size="sm" variant={value.bandCount === count ? "primary" : "secondary"} onClick={() => setBandCount(count)}>{count}</Button>)}</div><p className="mt-1 text-xs text-on-surface-variant">{getString("eq_band_count_desc")}</p>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">{graphicFrequencies(value.bandCount).map((frequency, index) => <div key={frequency} className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border border-outline-variant p-2" data-tooltip-detail={getString("eq_band_control_desc")}>
        <NumberField label={`${formatFrequency(frequency)} ${getString("eq_gain_db")}`} value={value.graphicGains[value.bandCount][index] ?? 0} min={-15} max={15} step={.1} onChange={(gain) => setGraphicGain(index, gain)} />
        <input aria-label={`${formatFrequency(frequency)} ${getString("eq_slider")}`} type="range" min={-15} max={15} step={.1} value={value.graphicGains[value.bandCount][index] ?? 0} onChange={(event) => setGraphicGain(index, Number(event.target.value))} className="h-28 w-6" />
        <EqDial label={`${formatFrequency(frequency)} ${getString("eq_dial")}`} value={value.graphicGains[value.bandCount][index] ?? 0} onChange={(gain) => setGraphicGain(index, gain)} />
        <span className="text-[10px] text-on-surface-variant">{formatFrequency(frequency)} Hz</span><span className="text-[10px] text-on-surface-variant">{getString("eq_band_control_desc")}</span>
      </div>)}</div>
    </div> : <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => value.parametricBands.length < 31 && apply({ ...value, parametricBands: [...value.parametricBands, { id: crypto.randomUUID(), frequency: 1000, gain: 0, q: 1.41, type: "peaking" }] })}><Plus size={15} />{getString("eq_add_band")}</Button><input ref={importRef} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={(event) => void importAutoEq(event.target.files?.[0])} /><Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}><Upload size={15} />{getString("eq_import_autoeq")}</Button></div><p className="text-xs text-on-surface-variant">{getString("eq_parametric_desc")}</p>{value.parametricBands.map((band, index) => <EqBandEditor key={band.id} band={band} onChange={(next) => apply({ ...value, parametricBands: value.parametricBands.map((item, itemIndex) => itemIndex === index ? next : item) })} onRemove={() => apply({ ...value, parametricBands: value.parametricBands.filter((_, itemIndex) => itemIndex !== index) })} />)}</div>}
    <section className="mt-5 space-y-4 rounded-xl border border-outline-variant p-3"><h3 className="font-semibold">{getString("eq_dynamics")}</h3>
      {explain("eq_preamp", <><input type="range" min={-15} max={15} step={.1} value={value.dynamics.preampDb} onChange={(event) => updateDynamics({ preampDb: Number(event.target.value) })} className="mt-2 w-full" /><NumberField label={getString("eq_gain_db")} value={value.dynamics.preampDb} min={-15} max={15} step={.1} onChange={(preampDb) => updateDynamics({ preampDb })} /></>)}
      {explain("eq_balance", <input type="range" min={-1} max={1} step={.01} value={value.dynamics.balance} onChange={(event) => updateDynamics({ balance: Number(event.target.value) })} className="mt-2 w-full" />)}
      <div className="flex items-center justify-between"><span>{getString("eq_compressor")}</span><ToggleSwitch checked={value.dynamics.compressorEnabled} onChange={(compressorEnabled) => updateDynamics({ compressorEnabled })} label={getString("eq_compressor")} /></div><p className="text-xs text-on-surface-variant">{getString("eq_compressor_desc")}</p>
      {value.dynamics.compressorEnabled && <div className="grid grid-cols-2 gap-3">{([['eq_threshold','compressorThreshold',-60,0,1],['eq_ratio','compressorRatio',1,20,.1],['eq_attack','compressorAttack',0,1,.001],['eq_release','compressorRelease',.01,1,.01]] as const).map(([key, field, min, max, step]) => explain(key, <NumberField label={getString(key)} value={value.dynamics[field]} min={min} max={max} step={step} onChange={(number) => updateDynamics({ [field]: number })} />))}</div>}
      <div className="flex items-center justify-between"><span>{getString("eq_limiter")}</span><ToggleSwitch checked={value.dynamics.limiterEnabled} onChange={(limiterEnabled) => updateDynamics({ limiterEnabled })} label={getString("eq_limiter")} /></div><p className="text-xs text-on-surface-variant">{getString("eq_limiter_desc")}</p>
    </section>
    <section className="mt-5 space-y-3 rounded-xl border border-outline-variant p-3"><h3 className="font-semibold">{getString("eq_playback_tools")}</h3>{[["settings_stable_volume", stableVolume, setStableVolume], ["settings_skip_silence", skipSilence, setSkipSilence], ["settings_volume_boost", volumeBoost, setVolumeBoost]].map(([key, checked, setter]) => <div key={key as string} className="flex items-center justify-between gap-3"><div><span className="text-sm">{getString(key as StringKey)}</span><p className="text-xs text-on-surface-variant">{getString(`${key}_desc` as StringKey)}</p></div><ToggleSwitch checked={checked as boolean} onChange={setter as (value: boolean) => void} label={getString(key as StringKey)} /></div>)}</section>
    <div className="mt-5 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void saveDevice()}><Download size={15} />{getString("eq_save_device")}</Button><Button variant="ghost" onClick={() => apply(defaultAudioProcessingConfig())}>{getString("eq_reset_all")}</Button></div><p className="mt-1 text-xs text-on-surface-variant">{getString("eq_device_desc")}</p>
  </DockablePanel>;
}

export default EqPanel;
