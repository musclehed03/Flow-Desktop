import { getString } from '../../lib/i18n/index';
import { useBoolPref, useNumberPref } from '../../lib/usePreference';
import { SETTINGS } from '../../lib/settings/schema';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SettingsGroup } from '../settings/SettingsGroup';
import { SettingItem } from '../settings/SettingItem';
import { TypedSlider } from '../ui/TypedSlider';

export function CrossfadeSettings() {
  const [enabled, setEnabled] = useBoolPref(SETTINGS.MUSIC_CROSSFADE_ENABLED);
  const [seconds, setSeconds] = useNumberPref(SETTINGS.MUSIC_CROSSFADE_SECONDS);
  const [everything, setEverything] = useBoolPref(SETTINGS.CROSSFADE_EVERYTHING);
  return <SettingsGroup title={getString('crossfade_title')}>
    <SettingItem title={getString('crossfade_enabled')} description={getString('crossfade_description')}>
      <ToggleSwitch checked={enabled} onChange={setEnabled} />
    </SettingItem>
    <label className="block px-5 py-4 text-sm text-on-surface">
      {getString('crossfade_duration', seconds)}
      <TypedSlider aria-label={getString('crossfade_durationLabel')} min={1} max={12} step={1} decimals={0}
        value={seconds} onCommit={setSeconds} className="mt-3" />
    </label>
    <SettingItem title={getString('crossfade_everything')} description={getString('crossfade_metadata')}>
      <ToggleSwitch checked={everything} onChange={setEverything} />
    </SettingItem>
  </SettingsGroup>;
}
