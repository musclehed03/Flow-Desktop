import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS, SETTING_EXPORT_KEYS, SETTING_SCOPES, SETTINGS } from "./schema";

// The backend routes device settings to Default's database by key, so its list must match.
const rustSource = Object.values(
  import.meta.glob("/src-tauri/src/profiles/device_keys.rs", { query: "?raw", import: "default", eager: true }),
)[0] as string;

function rustList(name: string): string[] {
  const block = rustSource.match(new RegExp(`pub const ${name}: \\[&str; \\d+\\] = \\[([\\s\\S]*?)\\];`));
  if (!block?.[1]) throw new Error(`${name} not found in device_keys.rs`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("setting scopes", () => {
  it("gives every setting a scope", () => {
    expect(Object.keys(SETTING_SCOPES).sort()).toEqual(Object.values(SETTINGS).sort());
    for (const definition of SETTING_DEFINITIONS) {
      expect(["device", "profile"]).toContain(definition.scope);
    }
  });

  it("matches the backend's device list", () => {
    const schemaDevice = SETTING_DEFINITIONS.filter((definition) => definition.scope === "device")
      .map((definition) => definition.key)
      .sort();
    expect(rustList("SCHEMA_DEVICE_KEYS").sort()).toEqual(schemaDevice);
  });

  it("keeps the backend's other device keys out of the schema", () => {
    const schemaKeys = new Set<string>(Object.values(SETTINGS));
    expect(rustList("OTHER_DEVICE_KEYS").filter((key) => schemaKeys.has(key))).toEqual([]);
  });
});

describe("setting export scope", () => {
  // Her state travels with her (fixes batch #14): the loaded queue, resume positions,
  // volume and where she put things export in backups, so a new device restores them.
  const TRAVELLING_STATE = [
    SETTINGS.MUSIC_PLAYBACK_SESSION,
    SETTINGS.VIDEO_PLAYBACK_SESSION,
    SETTINGS.MUSIC_PLAYBACK_POSITION,
    SETTINGS.VIDEO_PLAYBACK_POSITION,
    SETTINGS.EDITOR_PANEL_LAYOUTS,
    SETTINGS.PLAYER_SURFACE_LAYOUTS,
    SETTINGS.MINI_PLAYER_POSITION,
    SETTINGS.PLAYER_VOLUME,
    SETTINGS.PLAYER_MUTED,
    SETTINGS.MUSIC_SIDE_PANE_VISIBLE,
  ];

  it("exports the loaded queue, positions, volume and layouts", () => {
    const exported = new Set(SETTING_EXPORT_KEYS);
    for (const key of TRAVELLING_STATE) expect(exported.has(key)).toBe(true);
  });

  it("never exports secrets, whatever else travels", () => {
    const exported = new Set(SETTING_EXPORT_KEYS);
    for (const key of [SETTINGS.BLOCKED_REVEAL_PIN, SETTINGS.PROXY_USERNAME, SETTINGS.PROXY_PASSWORD]) {
      expect(exported.has(key)).toBe(false);
    }
  });
});
