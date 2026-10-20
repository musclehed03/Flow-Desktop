import { useTranslation } from "react-i18next";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import { setSettingValue } from "../../store/useAppSettingsStore";
import { selectRadioOn, useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { DiscoveryControl } from "./DiscoveryControl";

export function GeniusControls({ surface }: { surface: 'music' | 'video' | 'settings' }) {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useBoolPref(SETTINGS.GENIUS_DJ_ENABLED);
  const error = useMusicPlayerStore((s) => s.radioError);
  return <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-on-surface">
    <div className="flex items-center justify-between gap-3">
      <span>{t('radio.genius')}</span>
      <ToggleSwitch label={t('radio.genius')} checked={enabled} onChange={(value) => {
        setEnabled(value);
        if (value) {
          void setSettingValue(SETTINGS.AUTOPLAY_ENABLED, 'true');
          const music = useMusicPlayerStore.getState();
          if (!selectRadioOn(music)) music.toggleRadio();
        }
      }} />
    </div>
    <p className="mt-1 text-xs text-on-surface-variant">{t('radio.geniusDescription')}</p>
    {enabled && <DiscoveryControl />}
    {surface === 'music' && error && <p role="status" className="text-sm text-on-surface">{t('radio.exhausted')}</p>}
  </div>;
}
