import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import { usePlayerStore } from "../../store/usePlayerStore";

export function SensoryAdvisory({ videoId }: { videoId: string }) {
  const { t } = useTranslation('settings');
  const [safe] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED);
  const [acknowledged, setAcknowledged] = useState('');
  const [seenSession, setSeenSession] = useState(() => sessionStorage.getItem('flow-sensory-advisory') === 'true');
  const key = `${safe}:${videoId}`;
  const visible = safe ? acknowledged !== key : !seenSession;
  useLayoutEffect(() => {
    if (visible) usePlayerStore.getState().setIsPlaying(false);
  }, [key, visible]);
  if (!visible) return null;
  return <section role="alertdialog" aria-modal="false" aria-label={t('sensory.advisoryTitle')} aria-describedby="sensory-advisory-description"
    data-sensory-essential="true" className="fixed inset-x-4 top-20 z-[540] mx-auto max-w-xl rounded-2xl border border-outline-variant bg-background p-5 text-on-surface">
    <h2 className="font-semibold">{t('sensory.advisoryTitle')}</h2>
    <p id="sensory-advisory-description" className="my-3 text-sm">{t('sensory.advisory')}</p>
    {safe && <p className="mb-3 text-sm">{t('sensory.motionAdvisory')}</p>}
    <button type="button" onClick={() => {
      setAcknowledged(key); setSeenSession(true); sessionStorage.setItem('flow-sensory-advisory', 'true');
      usePlayerStore.getState().setIsPlaying(true);
    }} className="rounded-full border border-outline-variant bg-surface-container px-4 py-2">{t('sensory.continue')}</button>
  </section>;
}
