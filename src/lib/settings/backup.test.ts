import { describe, expect, it, vi } from "vitest";

vi.mock("../api/errors", () => ({ invokeBackend: vi.fn(async () => ({ collections: [] })) }));

import { validateSettingsBackup } from "./backup";
import { SETTINGS } from "./schema";

// A backup file as the new device receives it: json settings as objects, numbers as numbers.
const backupFile = (settings: Record<string, unknown>) => ({ schemaVersion: 2, settings });

describe("validateSettingsBackup", () => {
  it("accepts the travelling state: loaded queue, position, volume and layouts", () => {
    const session = { queue: [{ videoId: "abc", title: "Test Song" }], index: 0 };
    const validated = validateSettingsBackup(
      backupFile({
        [SETTINGS.MUSIC_PLAYBACK_SESSION]: session,
        [SETTINGS.MUSIC_PLAYBACK_POSITION]: { videoId: "abc", position: 42 },
        [SETTINGS.PLAYER_VOLUME]: 0.5,
        [SETTINGS.PLAYER_MUTED]: true,
        [SETTINGS.PLAYER_SURFACE_LAYOUTS]: { "deviant-controls": { x: 10, y: 20 } },
      }),
    );
    expect(validated).not.toBeNull();
    expect(validated!.invalidKeys).toEqual([]);
    expect(validated!.skippedKeys).toEqual([]);
    expect(validated!.settings[SETTINGS.MUSIC_PLAYBACK_SESSION]).toBe(JSON.stringify(session));
    expect(validated!.settings[SETTINGS.PLAYER_VOLUME]).toBe("0.5");
    expect(validated!.settings[SETTINGS.PLAYER_MUTED]).toBe("true");
    expect(validated!.settings[SETTINGS.PLAYER_SURFACE_LAYOUTS]).toBe(
      JSON.stringify({ "deviant-controls": { x: 10, y: 20 } }),
    );
  });

  it("drops secrets from a backup instead of importing them", () => {
    const validated = validateSettingsBackup(
      backupFile({ [SETTINGS.BLOCKED_REVEAL_PIN]: "1234", [SETTINGS.PROXY_PASSWORD]: "hunter2" }),
    );
    expect(validated).not.toBeNull();
    expect(validated!.settings).toEqual({});
    expect(validated!.skippedKeys).toEqual(
      expect.arrayContaining([SETTINGS.BLOCKED_REVEAL_PIN, SETTINGS.PROXY_PASSWORD]),
    );
  });
});
