import { usePlayerStore } from "../../store/usePlayerStore";
import { CurrentStationSave } from "./SavedStations";
import { getString } from "../../lib/i18n/index";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import { setSettingValue } from "../../store/useAppSettingsStore";
import { selectRadioOn, useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { DiscoveryControl } from "./DiscoveryControl";

export function GeniusControls({ surface }: { surface: 'music' | 'video' | 'settings' }) {
  const [enabled, setEnabled] = useBoolPref(SETTINGS.GENIUS_DJ_ENABLED);
  const error = useMusicPlayerStore((s) => s.radioError);
  const videoError = usePlayerStore((s) => s.autoplayError);
  const failed = surface === "music" ? error : surface === "video" ? videoError : false;
  return <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-on-surface">
    <div className="flex items-center justify-between gap-3">
      <span>{getString('settings_radio_genius')}</span>
      <ToggleSwitch label={getString('settings_radio_genius')} checked={enabled} onChange={(value) => {
        setEnabled(value);
        if (value) {
          void setSettingValue(SETTINGS.AUTOPLAY_ENABLED, 'true');
          const music = useMusicPlayerStore.getState();
          if (!selectRadioOn(music)) music.toggleRadio();
        }
      }} />
    </div>
    <p className="mt-1 text-xs text-on-surface-variant">{getString('settings_radio_geniusDescription')}</p>
    <DiscoveryControl />
    {surface !== 'settings' && <CurrentStationSave surface={surface} />}
    {failed && <div role="status" className="text-sm text-on-surface"><p>{getString('settings_radio_exhausted')}</p>
      <button type="button" className="mt-2 rounded-lg border border-outline-variant px-3 py-2" onClick={() => {
        if (surface === 'video') void usePlayerStore.getState().refillAutoplay();
        else void useMusicPlayerStore.getState()._ensureRadio().then(() => useMusicPlayerStore.getState().next());
      }}>{getString('settings_radio_retry')}</button></div>}
  </div>;
}
