import { getSettingValue } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../settings/schema";

/**
 * Feature 13.6: the embedded scrobbler's credentials live only in Settings
 * storage, entered by the owner. No key material is shipped, hardcoded, or
 * written anywhere else — the queue carries scrobbles, never keys.
 */
export interface LastfmCredentials {
  apiKey: string;
  secret: string;
  sessionKey: string;
}

/** The owner's keys, or null when any of them is missing. */
export function lastfmCredentials(): LastfmCredentials | null {
  const apiKey = getSettingValue(SETTINGS.LASTFM_API_KEY).trim();
  const secret = getSettingValue(SETTINGS.LASTFM_SECRET).trim();
  const sessionKey = getSettingValue(SETTINGS.LASTFM_SESSION_KEY).trim();
  if (!apiKey || !secret || !sessionKey) return null;
  return { apiKey, secret, sessionKey };
}

/** Opt-in gate: the switch is on and all three keys are entered. Default off. */
export function lastfmScrobblingOn(): boolean {
  return getSettingValue(SETTINGS.LASTFM_ENABLED) === "true" && lastfmCredentials() !== null;
}
