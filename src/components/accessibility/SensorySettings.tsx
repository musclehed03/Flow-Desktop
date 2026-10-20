import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SENSORY_SETTINGS } from "../../lib/accessibility";
import { useBoolPref, usePreference } from "../../lib/usePreference";
import { SETTINGS, type SettingKey } from "../../lib/settings/schema";
import { SettingsGroup } from "../settings/SettingsGroup";

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
export function SensorySettings() {
  const { t } = useTranslation('settings');
  return <SettingsGroup title={t('sensory.title')}>
    {SENSORY_SETTINGS.map(([name, setting]) => <SensoryToggle key={name} name={name} setting={setting} />)}
    <LightToggle />
  </SettingsGroup>;
}
