import { getString, type StringKey } from "../../lib/i18n/index";
import { Check, X } from "lucide-react";
import { SENSORY_SETTINGS } from "../../lib/accessibility";
import { useBoolPref, usePreference } from "../../lib/usePreference";
import { SETTINGS, type SettingKey } from "../../lib/settings/schema";
import { SettingsGroup } from "../settings/SettingsGroup";
import { COLOR_BLIND_PALETTE_IDS, resolveColorBlindPalette } from "../../lib/colorBlindPalettes";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { Fragment } from "react";

function SensoryToggle({ name, setting }: { name: string; setting: SettingKey }) {
  const [enabled, setEnabled] = useBoolPref(setting);
  return <SensoryButton name={name} enabled={enabled} toggle={() => setEnabled(!enabled)} />;
}
function SensoryButton({ name, enabled, toggle }: { name: string; enabled: boolean; toggle: () => void }) {
  return <button type="button" aria-label={getString(`sensory_${name}_title` as StringKey)} aria-pressed={enabled} onClick={toggle}
    className="flex w-full items-center justify-between gap-4 p-4 text-start text-on-surface">
    <span><span className="block text-sm font-semibold">{getString(`sensory_${name}_title` as StringKey)}</span>
      <span className="block text-xs text-on-surface-variant">{getString(`sensory_${name}_description` as StringKey)}</span></span>
    <span className="flex shrink-0 items-center gap-1 text-xs">
      {enabled ? <Check aria-hidden="true" size={16} /> : <X aria-hidden="true" size={16} />}{getString(enabled ? 'sensory_on' : 'sensory_off')}
    </span>
  </button>;
}
function LightToggle() {
  const [variant, setVariant] = usePreference(SETTINGS.THEME_VARIANT);
  return <SensoryButton name="light" enabled={variant === 'light'} toggle={() => setVariant(variant === 'light' ? 'dark' : 'light')} />;
}
function ReducedFlashSetting() {
  const [enabled, setEnabled] = useBoolPref(SETTINGS.REDUCED_FLASH_ENABLED, false);
  return <div className="flex items-center justify-between gap-4 px-4 py-3" data-tooltip-detail={getString('sensory_reducedFlash_description')}>
    <span>
      <span className="block text-sm font-semibold text-on-surface">{getString('sensory_reducedFlash_title')}</span>
      <span className="block text-xs text-on-surface-variant">{getString('sensory_reducedFlash_description')}</span>
    </span>
    <ToggleSwitch checked={enabled} onChange={setEnabled} label={getString('sensory_reducedFlash_title')} />
  </div>;
}
function ColorBlindSettings() {
  const [enabled, setEnabled] = useBoolPref(SETTINGS.COLOR_BLIND_ENABLED);
  const [rawPalette, setPalette] = usePreference(SETTINGS.COLOR_BLIND_PALETTE);
  const [, setVariant] = usePreference(SETTINGS.THEME_VARIANT);
  const palette = resolveColorBlindPalette(rawPalette);
  return <>
    <SensoryButton name="colorBlind" enabled={enabled} toggle={() => setEnabled(!enabled)} />
    {enabled && <div className="px-4 pb-4" data-tooltip-detail={getString('sensory_colorBlind_paletteDescription')}>
      <label htmlFor="colorblind-palette" className="mb-2 block text-xs font-semibold text-on-surface">{getString('sensory_colorBlind_palette')}</label>
      <select id="colorblind-palette" aria-describedby="colorblind-palette-description" value={palette}
        onChange={(event) => {
          setPalette(event.target.value);
          if (event.target.value === 'achromatopsia') setVariant('light');
        }}
        className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface-container-high px-3 text-sm text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {COLOR_BLIND_PALETTE_IDS.map((id) => <option key={id} value={id}>{getString(`sensory_colorBlind_palettes_${id}` as StringKey)}</option>)}
      </select>
      <p id="colorblind-palette-description" className="mt-2 text-xs text-on-surface-variant">{getString('sensory_colorBlind_paletteDescription')}</p>
    </div>}
  </>;
}
export function SensorySettings() {
  return <SettingsGroup title={getString('sensory_title')}>
    {SENSORY_SETTINGS.map(([name, setting]) => <Fragment key={name}>
      {name === 'colorBlind' ? <ColorBlindSettings /> : <SensoryToggle name={name} setting={setting} />}
      {name === 'motion' && <ReducedFlashSetting />}
    </Fragment>)}
    <LightToggle />
  </SettingsGroup>;
}
