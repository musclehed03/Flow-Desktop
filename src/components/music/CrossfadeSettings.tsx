import { useTranslation } from 'react-i18next';
import { useBoolPref, useNumberPref } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SettingsGroup } from '../settings/SettingsGroup';
import { SettingItem } from '../settings/SettingItem';

export function CrossfadeSettings() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useBoolPref(SETTINGS.CROSSFADE_ENABLED);
  const [seconds, setSeconds] = useNumberPref(SETTINGS.CROSSFADE_SECONDS);
  const [everything, setEverything] = useBoolPref(SETTINGS.CROSSFADE_EVERYTHING);
  return <SettingsGroup title={t('crossfade.title')}>
    <SettingItem title={t('crossfade.enabled')} description={t('crossfade.description')}>
      <ToggleSwitch checked={enabled} onChange={setEnabled} />
    </SettingItem>
    <label className="block px-5 py-4 text-sm text-on-surface">
      {t('crossfade.duration', { seconds })}
      <input aria-label={t('crossfade.durationLabel')} type="range" min="1" max="12" step="1" value={seconds}
        onChange={(event) => setSeconds(Number(event.target.value))} className="mt-3 block w-full accent-primary" />
    </label>
    <SettingItem title={t('crossfade.everything')} description={t('crossfade.metadata')}>
      <ToggleSwitch checked={everything} onChange={setEverything} />
    </SettingItem>
  </SettingsGroup>;
}
