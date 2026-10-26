import { useState, type RefObject } from "react";
import { Copy, Download, Dices } from "lucide-react";
import { getString, type StringKey } from "../../lib/i18n/index";
import { useLivePreviewHistory } from "../../lib/livePreviewHistory";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import {
  THEME_STYLE_REGIONS, THEME_VARIANTS, randomizeCustomTheme, themeRegionGradient,
  type CustomThemeDefinition, type ThemeColors, type ThemeStyleRegion, type ThemeVariant,
} from "../../lib/themes";
import { downloadThemeFile } from "../../lib/themePresetFile";
import { Button } from "../ui/Button";
import { DockablePanel } from "../ui/DockablePanel";
import { ThemeRegionControls } from "./ThemeRegionControls";

interface CustomThemeEditorProps {
  theme: CustomThemeDefinition;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChange: (theme: CustomThemeDefinition) => void;
  onDuplicate?: (theme: CustomThemeDefinition) => void;
}

const colorGroups: { region: "frame" | "buttons" | "containers" | "text" | "accents"; keys: (keyof ThemeColors)[] }[] = [
  { region: "frame", keys: ["background"] },
  { region: "buttons", keys: ["primary", "onPrimary", "secondary"] },
  { region: "containers", keys: ["surface", "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest"] },
  { region: "text", keys: ["onSurface", "onSurfaceVariant"] },
  { region: "accents", keys: ["outline", "error"] },
];
const colorLabels: Record<keyof ThemeColors, StringKey> = {
  primary: "theme_color_primary", onPrimary: "theme_color_on_primary", secondary: "theme_color_secondary", background: "theme_color_background",
  surface: "theme_color_surface", surfaceContainerLow: "theme_color_surface_low", surfaceContainer: "theme_color_surface_container",
  surfaceContainerHigh: "theme_color_surface_high", surfaceContainerHighest: "theme_color_surface_highest", onSurface: "theme_color_text",
  onSurfaceVariant: "theme_color_muted_text", outline: "theme_color_outline", error: "theme_color_error",
};

export function CustomThemeEditor({ theme, openerRef, onClose, onChange, onDuplicate }: CustomThemeEditorProps) {
  const { value, apply, undo, reset, canUndo } = useLivePreviewHistory(theme, onChange);
  const [variant, setVariant] = useState<ThemeVariant>("dark");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [safeMotion] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED, false);
  const [reducedFlash] = useBoolPref(SETTINGS.REDUCED_FLASH_ENABLED, false);
  const animationsAllowed = !safeMotion && !reducedFlash;
  const setColor = (key: keyof ThemeColors, color: string) => apply({ ...value, variants: { ...value.variants, [variant]: { ...value.variants[variant], [key]: color } } });
  const revertRegion = (region: ThemeStyleRegion) => apply({ ...value, appearance: { ...value.appearance, regions: { ...value.appearance.regions, [region]: structuredClone(theme.appearance.regions[region]) } } });

  return <DockablePanel panelId="theme-editor" title={getString("theme_editor_title")} description={getString("theme_editor_live_description")} openerRef={openerRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
    <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant" htmlFor="theme-name">{getString("theme_name")}</label>
    <input id="theme-name" value={value.name} maxLength={48} onChange={(event) => apply({ ...value, name: event.target.value })} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
    <p className="mt-1 text-xs text-on-surface-variant">{getString("theme_name_desc")}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => apply(randomizeCustomTheme(value, value.appearance.seed + 1))} data-tooltip-detail={getString("theme_random_desc")}><Dices size={15} />{getString("theme_random")}</Button>
      <Button size="sm" variant="secondary" onClick={() => onDuplicate?.(value)}><Copy size={15} />{getString("theme_duplicate")}</Button>
      <Button size="sm" variant="secondary" onClick={() => downloadThemeFile([value])}><Download size={15} />{getString("theme_export")}</Button>
    </div>
    <p className="mt-2 text-xs text-on-surface-variant">{getString("theme_random_desc")}</p>
    <div className="mt-5 flex gap-2" role="tablist" aria-label={getString("theme_variant")}>{THEME_VARIANTS.map((item) => <Button key={item} role="tab" aria-selected={variant === item} variant={variant === item ? "primary" : "secondary"} onClick={() => setVariant(item)}>{getString(`theme_variant_${item}` as StringKey)}</Button>)}</div>
    <div className="mt-5 grid grid-cols-5 gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-2" aria-label={getString("theme_region_preview")}>
      {(["frame", "buttons", "containers", "text", "accents"] as const).map((region) => {
        const style = region === "frame" || region === "buttons" || region === "containers" ? value.appearance.regions[region] : null;
        const background = style?.gradient.enabled ? themeRegionGradient(style) : region === "frame" ? value.variants[variant].background : region === "buttons" ? value.variants[variant].primary : region === "containers" ? value.variants[variant].surfaceContainer : "transparent";
        return <span key={region} data-theme-sample-region={region} className={`min-h-14 rounded-lg border-2 p-1 text-center text-[10px] ${highlight === region ? "border-primary" : "border-outline-variant"}`} style={{ background, color: region === "buttons" ? value.variants[variant].onPrimary : value.variants[variant].onSurface }}>{getString(`theme_region_${region}` as StringKey)}</span>;
      })}
    </div>
    <div className="mt-5 space-y-4">{colorGroups.map((group) => <fieldset key={group.region} className="rounded-xl border border-outline-variant bg-surface-container-low p-3" onFocus={() => setHighlight(group.region)} onBlur={() => setHighlight(null)} onPointerEnter={() => setHighlight(group.region)} onPointerLeave={() => setHighlight(null)}>
      <legend className="px-1 text-sm font-semibold">{getString(`theme_region_${group.region}` as StringKey)}</legend><p className="mb-2 text-xs text-on-surface-variant">{getString(`theme_region_${group.region}_desc` as StringKey)}</p>
      <div className="space-y-2">{group.keys.map((key) => { const color = value.variants[variant][key]; return <label key={key} className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container p-2 text-sm" data-tooltip-detail={getString(`theme_color_${key}_desc` as StringKey)}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : value.variants[variant].surface} onChange={(event) => setColor(key, event.target.value)} className="h-9 w-11 bg-transparent" />
        <span className="min-w-0 flex-1"><span className="block">{getString(colorLabels[key])}</span><span className="block text-xs text-on-surface-variant">{getString(`theme_color_${key}_desc` as StringKey)}</span></span><span className="font-mono text-xs text-on-surface-variant">{color}</span>
      </label>; })}</div>
    </fieldset>)}</div>
    <div className="mt-5 space-y-4">{THEME_STYLE_REGIONS.map((region) => <ThemeRegionControls key={region} region={region} theme={value} animationsAllowed={animationsAllowed} onChange={apply} onRevert={() => revertRegion(region)} onHighlight={setHighlight} />)}</div>
  </DockablePanel>;
}

export default CustomThemeEditor;
