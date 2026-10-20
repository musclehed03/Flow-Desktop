import { useTranslation } from "react-i18next";
import { usePreference } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";

export function DiscoveryControl() {
  const { t } = useTranslation('settings');
  const [level, setLevel] = usePreference(SETTINGS.RADIO_DISCOVERY_LEVEL);
  return <div role="group" aria-label={t('radio.discovery')} className="flex flex-wrap gap-1 p-2">
    {['less', 'moderate', 'more'].map((value) => <button key={value} type="button" aria-pressed={level === value}
      onClick={() => setLevel(value)} className="rounded-full border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface">
      {level === value && <span aria-hidden="true">✓ </span>}{t(`radio.${value}`)}
    </button>)}
  </div>;
}
