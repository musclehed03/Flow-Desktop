import { getString, type StringKey } from "../../lib/i18n/index";
import { changeRadioDiscovery } from "../../lib/radioPreferences";
import type { DiscoveryLevel } from "../../lib/musicStation";
import { usePreference } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";

export function DiscoveryControl() {
  const [level] = usePreference(SETTINGS.RADIO_DISCOVERY_LEVEL);
  return <div role="group" aria-label={getString('settings_radio_discovery')} className="flex flex-wrap gap-1 p-2">
    {['less', 'moderate', 'more'].map((value) => <button key={value} type="button" aria-pressed={level === value}
      onClick={() => void changeRadioDiscovery(value as DiscoveryLevel)} className="rounded-full border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface">
      {level === value && <span aria-hidden="true">✓ </span>}{getString(`settings_radio_${value}` as StringKey)}
    </button>)}
  </div>;
}
