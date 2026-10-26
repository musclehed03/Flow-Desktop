import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { getString, type StringKey } from "../../lib/i18n/index";
import { THEME_EFFECTS, type CustomThemeDefinition, type ThemeStyleRegion } from "../../lib/themes";
import { Button } from "../ui/Button";
import { ToggleSwitch } from "../ui/ToggleSwitch";

const regionKeys: Record<ThemeStyleRegion, StringKey> = { frame: "theme_region_frame", buttons: "theme_region_buttons", containers: "theme_region_containers" };

export function ThemeRegionControls({ region, theme, animationsAllowed, onChange, onRevert, onHighlight }: {
  region: ThemeStyleRegion;
  theme: CustomThemeDefinition;
  animationsAllowed: boolean;
  onChange: (theme: CustomThemeDefinition) => void;
  onRevert: () => void;
  onHighlight: (region: ThemeStyleRegion | null) => void;
}) {
  const style = theme.appearance.regions[region];
  const setStyle = (next: typeof style) => onChange({ ...theme, appearance: { ...theme.appearance, regions: { ...theme.appearance.regions, [region]: next } } });
  const setGradient = (next: typeof style.gradient) => setStyle({ ...style, gradient: next });
  return <fieldset className="rounded-xl border border-outline-variant bg-surface-container-low p-3" onFocus={() => onHighlight(region)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHighlight(null); }} onPointerEnter={() => onHighlight(region)} onPointerLeave={() => onHighlight(null)}>
    <legend className="px-1 text-sm font-semibold text-on-surface">{getString(regionKeys[region])}</legend>
    <p className="mb-3 text-xs text-on-surface-variant">{getString(`theme_region_${region}_desc` as StringKey)}</p>
    <div className="flex items-center justify-between gap-3" data-tooltip-detail={getString("theme_gradient_desc")}>
      <div><span className="text-sm text-on-surface">{getString("theme_gradient")}</span><p className="text-xs text-on-surface-variant">{getString("theme_gradient_desc")}</p></div>
      <ToggleSwitch checked={style.gradient.enabled} onChange={(enabled) => setGradient({ ...style.gradient, enabled })} label={getString("theme_gradient")} />
    </div>
    {style.gradient.enabled && <div className="mt-3 space-y-3">
      <div data-tooltip-detail={getString("theme_gradient_stops_desc")}>
        <div className="flex items-center justify-between"><span className="text-sm text-on-surface">{getString("theme_gradient_stops")}</span><Button size="sm" variant="secondary" disabled={style.gradient.stops.length >= 10} onClick={() => setGradient({ ...style.gradient, stops: [...style.gradient.stops, style.gradient.stops[style.gradient.stops.length - 1]!] })}><Plus size={14} />{getString("theme_add_stop")}</Button></div>
        <p className="mb-2 text-xs text-on-surface-variant">{getString("theme_gradient_stops_desc")}</p>
        <div className="grid grid-cols-2 gap-2">{style.gradient.stops.map((stop, index) => <label key={index} className="flex items-center gap-2 rounded-lg border border-outline-variant p-2">
          <input type="color" value={stop} aria-label={`${getString("theme_gradient_stop")} ${index + 1}`} onChange={(event) => { const stops = [...style.gradient.stops]; stops[index] = event.target.value; setGradient({ ...style.gradient, stops }); }} className="h-8 w-10 bg-transparent" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{stop}</span><button type="button" disabled={style.gradient.stops.length <= 2} aria-label={getString("theme_remove_stop")} onClick={() => setGradient({ ...style.gradient, stops: style.gradient.stops.filter((_, item) => item !== index) })} className="rounded-md p-1 disabled:opacity-40"><Trash2 size={14} /></button>
        </label>)}</div>
      </div>
      <label className="block" data-tooltip-detail={getString("theme_gradient_angle_desc")}><span className="text-sm text-on-surface">{getString("theme_gradient_angle")} · {style.gradient.angle}°</span><input type="range" min={0} max={360} value={style.gradient.angle} onChange={(event) => setGradient({ ...style.gradient, angle: Number(event.target.value) })} className="mt-1 w-full" /><span className="block text-xs text-on-surface-variant">{getString("theme_gradient_angle_desc")}</span></label>
      <label className="block" data-tooltip-detail={getString("theme_gradient_animation_desc")}><span className="text-sm text-on-surface">{getString("theme_gradient_animation")}</span><select value={animationsAllowed ? style.gradient.animation : "off"} disabled={!animationsAllowed} onChange={(event) => setGradient({ ...style.gradient, animation: event.target.value as typeof style.gradient.animation })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm"><option value="off">{getString("theme_animation_off")}</option><option value="fade">{getString("theme_animation_fade")}</option><option value="shift">{getString("theme_animation_shift")}</option></select><span className="mt-1 block text-xs text-on-surface-variant">{animationsAllowed ? getString("theme_gradient_animation_desc") : getString("theme_animation_guarded")}</span></label>
    </div>}
    <label className="mt-3 block" data-tooltip-detail={getString("theme_effect_desc")}><span className="text-sm text-on-surface">{getString("theme_ambient_effect")}</span><select value={animationsAllowed ? style.effect : "off"} disabled={!animationsAllowed} onChange={(event) => setStyle({ ...style, effect: event.target.value as typeof style.effect })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm">{THEME_EFFECTS.map((effect) => <option key={effect} value={effect}>{getString(`theme_effect_${effect}` as StringKey)}</option>)}</select><span className="mt-1 block text-xs text-on-surface-variant">{animationsAllowed ? getString("theme_effect_desc") : getString("theme_animation_guarded")}</span></label>
    <Button size="sm" variant="ghost" className="mt-3" onClick={onRevert}><RotateCcw size={14} />{getString("theme_revert_region")}</Button>
  </fieldset>;
}
