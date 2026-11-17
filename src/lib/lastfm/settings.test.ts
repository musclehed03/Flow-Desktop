import { beforeEach, describe, expect, it } from "vitest";

import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTING_DEFINITIONS, SETTINGS } from "../settings/schema";
import { lastfmCredentials, lastfmScrobblingOn } from "./settings";

function setLastfm(values: Record<string, string>) {
  useAppSettingsStore.setState({ values });
}

describe("lastfm opt-in gate", () => {
  beforeEach(() => {
    setLastfm({});
  });

  it("defaults off in the schema", () => {
    const byKey = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));
    expect(byKey.get(SETTINGS.LASTFM_ENABLED)?.defaultValue).toBe("false");
    expect(byKey.get(SETTINGS.LASTFM_API_KEY)?.defaultValue).toBe("");
    expect(byKey.get(SETTINGS.LASTFM_SECRET)?.defaultValue).toBe("");
    expect(byKey.get(SETTINGS.LASTFM_SESSION_KEY)?.defaultValue).toBe("");
  });

  it("stays off until the switch is on and all three keys are entered", () => {
    expect(lastfmScrobblingOn()).toBe(false);
    setLastfm({ [SETTINGS.LASTFM_ENABLED]: "true" });
    expect(lastfmScrobblingOn()).toBe(false);
    setLastfm({
      [SETTINGS.LASTFM_ENABLED]: "true",
      [SETTINGS.LASTFM_API_KEY]: "key",
      [SETTINGS.LASTFM_SECRET]: "secret",
    });
    expect(lastfmScrobblingOn()).toBe(false);
    setLastfm({
      [SETTINGS.LASTFM_ENABLED]: "true",
      [SETTINGS.LASTFM_API_KEY]: "key",
      [SETTINGS.LASTFM_SECRET]: "secret",
      [SETTINGS.LASTFM_SESSION_KEY]: "session",
    });
    expect(lastfmScrobblingOn()).toBe(true);
  });

  it("treats blank keys as missing", () => {
    setLastfm({
      [SETTINGS.LASTFM_ENABLED]: "true",
      [SETTINGS.LASTFM_API_KEY]: "  ",
      [SETTINGS.LASTFM_SECRET]: "secret",
      [SETTINGS.LASTFM_SESSION_KEY]: "session",
    });
    expect(lastfmScrobblingOn()).toBe(false);
    expect(lastfmCredentials()).toBeNull();
  });

  it("trims the keys it reads", () => {
    setLastfm({
      [SETTINGS.LASTFM_API_KEY]: "  key ",
      [SETTINGS.LASTFM_SECRET]: "secret",
      [SETTINGS.LASTFM_SESSION_KEY]: "session",
    });
    expect(lastfmCredentials()).toEqual({ apiKey: "key", secret: "secret", sessionKey: "session" });
  });

  it("keeps the keys out of backups and exports", () => {
    const byKey = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));
    expect(byKey.get(SETTINGS.LASTFM_API_KEY)?.exportScope).toBe("private");
    expect(byKey.get(SETTINGS.LASTFM_SECRET)?.exportScope).toBe("private");
    expect(byKey.get(SETTINGS.LASTFM_SESSION_KEY)?.exportScope).toBe("private");
  });
});
