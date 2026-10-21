import { useTranslation } from 'react-i18next';
import { useBoolPref, useNumberPref } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SettingsGroup } from '../settings/SettingsGroup';

export function CrossfadeSettings() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useBoolPref(SETTINGS.CROSSFADE_ENABLED);
  const [seconds, setSeconds] = useNumberPref(SETTINGS.CROSSFADE_SECONDS);
  const [everything, setEverything] = useBoolPref(SETTINGS.CROSSFADE_EVERYTHING);
  return <SettingsGroup title={t('crossfade.title')}>
    <div className="flex items-center justify-between gap-3"><span>{t('crossfade.enabled')}</span><ToggleSwitch label={t('crossfade.enabled')} checked={enabled} onChange={setEnabled} /></div>
    <p className="text-sm text-on-surface-variant">{t('crossfade.description')}</p>
    <label className="block text-on-surface">{t('crossfade.duration', { seconds })}<input aria-label={t('crossfade.durationLabel')} type="range" min="1" max="12" step="1" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} className="mt-2 block w-full" /></label>
    <div className="flex items-center justify-between gap-3"><span>{t('crossfade.everything')}</span><ToggleSwitch label={t('crossfade.everything')} checked={everything} onChange={setEverything} /></div>
    <p className="text-sm text-on-surface-variant">{t('crossfade.metadata')}</p>
  </SettingsGroup>;
}
