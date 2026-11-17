import { useEffect, useState } from "react";
import { SettingsGroup } from "../settings/SettingsGroup";
import { SettingItem } from "../settings/SettingItem";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { getString } from "../../lib/i18n/index";
import { sendScrobbleBatch } from "../../lib/lastfm/api";
import { flushQueue, onLastfmQueueChanged, pokeQueue, queuedCount } from "../../lib/lastfm/queue";
import { SETTINGS } from "../../lib/settings/schema";
import { useBoolPref, usePreference } from "../../lib/usePreference";

export function LastfmSection() {
  const [enabled, setEnabled] = useBoolPref(SETTINGS.LASTFM_ENABLED);
  const [apiKey, setApiKey] = usePreference(SETTINGS.LASTFM_API_KEY, "");
  const [secret, setSecret] = usePreference(SETTINGS.LASTFM_SECRET, "");
  const [sessionKey, setSessionKey] = usePreference(SETTINGS.LASTFM_SESSION_KEY, "");
  const [waiting, setWaiting] = useState(() => queuedCount());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setWaiting(queuedCount());
    return onLastfmQueueChanged(() => setWaiting(queuedCount()));
  }, []);

  const sendNow = async () => {
    setSending(true);
    try {
      pokeQueue();
      await flushQueue(sendScrobbleBatch);
    } finally {
      setWaiting(queuedCount());
      setSending(false);
    }
  };

  return (
    <SettingsGroup title={getString("lastfm_title")}>
      <p className="px-5 py-3 text-xs text-chrome-neutral-400">{getString("lastfm_summary")}</p>
      <SettingItem title={getString("lastfm_enable")} description={getString("lastfm_enable_summary")}>
        <ToggleSwitch checked={enabled} onChange={setEnabled} />
      </SettingItem>
      <SettingItem title={getString("scrobbling_api_key")} description={getString("lastfm_keys_note")}>
        <TextInput value={apiKey} onChange={setApiKey} type="password" autoComplete="off" spellCheck={false} className="w-48 font-mono" />
      </SettingItem>
      <SettingItem title={getString("scrobbling_secret")}>
        <TextInput value={secret} onChange={setSecret} type="password" autoComplete="off" spellCheck={false} className="w-48 font-mono" />
      </SettingItem>
      <SettingItem title={getString("lastfm_session_key")}>
        <TextInput value={sessionKey} onChange={setSessionKey} type="password" autoComplete="off" spellCheck={false} className="w-48 font-mono" />
      </SettingItem>
      {waiting > 0 && (
        <SettingItem title={getString("scrobbling_send_now")} description={getString("scrobbling_waiting", waiting)}>
          <Button variant="secondary" size="sm" disabled={sending} onClick={() => void sendNow()}>{getString("scrobbling_send_now")}</Button>
        </SettingItem>
      )}
    </SettingsGroup>
  );
}
