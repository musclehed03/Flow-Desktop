import { getString } from "../../lib/i18n/index";
import { useLayoutEffect, useState } from "react";
import { useBoolPref } from "../../lib/usePreference";
import { SETTINGS } from "../../lib/settings/schema";
import { usePlayerStore } from "../../store/usePlayerStore";
import { getSessionFlag, setSessionFlag } from "../../lib/storage/sessionFlag";

export function SensoryAdvisory({ videoId }: { videoId: string }) {
  const [safe] = useBoolPref(SETTINGS.SAFE_MOTION_ENABLED);
  const [acknowledged, setAcknowledged] = useState('');
  const [seenSession, setSeenSession] = useState(() => getSessionFlag('flow-sensory-advisory'));
  const key = `${safe}:${videoId}`;
  const visible = safe ? acknowledged !== key : !seenSession;
  useLayoutEffect(() => {
    if (visible) usePlayerStore.getState().setIsPlaying(false);
  }, [key, visible]);
  if (!visible) return null;
  return <section role="alertdialog" aria-modal="false" aria-label={getString('sensory_advisoryTitle')} aria-describedby="sensory-advisory-description"
    data-sensory-essential="true" className="fixed inset-x-4 top-12 z-[540] mx-auto max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto rounded-2xl border border-outline-variant bg-background p-5 text-on-surface">
    <h2 className="font-semibold">{getString('sensory_advisoryTitle')}</h2>
    <p id="sensory-advisory-description" className="my-3 text-sm">{getString('sensory_advisory')}</p>
    {safe && <p className="mb-3 text-sm">{getString('sensory_motionAdvisory')}</p>}
    <button type="button" onClick={() => {
      setAcknowledged(key); setSeenSession(true); setSessionFlag('flow-sensory-advisory', true);
      usePlayerStore.getState().setIsPlaying(true);
    }} className="rounded-full border border-outline-variant bg-surface-container px-4 py-2">{getString('sensory_continue')}</button>
  </section>;
}
