import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SENSORY_SETTINGS } from "../../lib/accessibility";
import { useBoolPref, usePreference } from "../../lib/usePreference";
import { SETTINGS, type SettingKey } from "../../lib/settings/schema";
import { SettingsGroup } from "../settings/SettingsGroup";
import { COLOR_BLIND_PALETTE_IDS, resolveColorBlindPalette } from "../../lib/colorBlindPalettes";

function SensoryToggle({ name, setting }: { name: string; setting: SettingKey }) {
  const [enabled, setEnabled] = useBoolPref(setting);
  return <SensoryButton name={name} enabled={enabled} toggle={() => setEnabled(!enabled)} />;
}
function SensoryButton({ name, enabled, toggle }: { name: string; enabled: boolean; toggle: () => void }) {
  const { t } = useTranslation('settings');
  return <button type="button" aria-label={t(`sensory.${name}.title`)} aria-pressed={enabled} onClick={toggle}
    className="flex w-full items-center justify-between gap-4 p-4 text-left text-on-surface">
    <span><span className="block text-sm font-semibold">{t(`sensory.${name}.title`)}</span>
      <span className="block text-xs text-on-surface-variant">{t(`sensory.${name}.description`)}</span></span>
    <span className="flex shrink-0 items-center gap-1 text-xs">
      {enabled ? <Check aria-hidden="true" size={16} /> : <X aria-hidden="true" size={16} />}{t(enabled ? 'sensory.on' : 'sensory.off')}
    </span>
  </button>;
}
function LightToggle() {
  const [variant, setVariant] = usePreference(SETTINGS.THEME_VARIANT);
  return <SensoryButton name="light" enabled={variant === 'light'} toggle={() => setVariant(variant === 'light' ? 'dark' : 'light')} />;
}
function ColorBlindSettings() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useBoolPref(SETTINGS.COLOR_BLIND_ENABLED);
  const [rawPalette, setPalette] = usePreference(SETTINGS.COLOR_BLIND_PALETTE);
  const [, setVariant] = usePreference(SETTINGS.THEME_VARIANT);
  const palette = resolveColorBlindPalette(rawPalette);
  return <>
    <SensoryButton name="colorBlind" enabled={enabled} toggle={() => setEnabled(!enabled)} />
    {enabled && <div className="px-4 pb-4" data-tooltip-detail={t('sensory.colorBlind.paletteDescription')}>
      <label htmlFor="colorblind-palette" className="mb-2 block text-xs font-semibold text-on-surface">{t('sensory.colorBlind.palette')}</label>
      <select id="colorblind-palette" aria-describedby="colorblind-palette-description" value={palette}
        onChange={(event) => {
          setPalette(event.target.value);
          if (event.target.value === 'achromatopsia') setVariant('light');
        }}
        className="h-10 w-full rounded-lg border-2 border-outline-variant bg-surface-container-high px-3 text-sm text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {COLOR_BLIND_PALETTE_IDS.map((id) => <option key={id} value={id}>{t(`sensory.colorBlind.palettes.${id}`)}</option>)}
      </select>
      <p id="colorblind-palette-description" className="mt-2 text-xs text-on-surface-variant">{t('sensory.colorBlind.paletteDescription')}</p>
    </div>}
  </>;
}
export function SensorySettings() {
  const { t } = useTranslation('settings');
  return <SettingsGroup title={t('sensory.title')}>
    {SENSORY_SETTINGS.map(([name, setting]) => name === 'colorBlind'
      ? <ColorBlindSettings key={name} />
      : <SensoryToggle key={name} name={name} setting={setting} />)}
    <LightToggle />
  </SettingsGroup>;
}
