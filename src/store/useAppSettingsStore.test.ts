import { afterEach, describe, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "../lib/api/db";
import { useAppSettingsStore } from "./useAppSettingsStore";
import { getSettingDefinition } from "../lib/settings/values";
import { SETTINGS } from "../lib/settings/schema";

vi.mock("../lib/api/db", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
const original = useAppSettingsStore.getState();
afterEach(() => { useAppSettingsStore.setState(original); vi.clearAllMocks(); });

it("defines both tuned settings as visible wired app-data booleans defaulting on", () => {
  for (const key of [SETTINGS.MUSIC_VIDEO_FIRST_ENABLED, SETTINGS.KEEP_WATCHING_VIEW_ENABLED]) {
    expect(getSettingDefinition(key)).toMatchObject({ area: "player", type: "boolean", defaultValue: "true", visibility: "visible", readiness: "wired", exportScope: "app-data" });
  }
});

describe.each([SETTINGS.MUSIC_VIDEO_FIRST_ENABLED, SETTINGS.KEEP_WATCHING_VIEW_ENABLED])("preference %s", (key) => {
  it("writes through the repository and reloads the saved value after resetting memory", async () => {
    const rows = new Map<string, string>();
    vi.mocked(getSetting).mockImplementation(async (name) => rows.get(name) ?? null);
    vi.mocked(setSetting).mockImplementation(async (name, value) => { rows.set(name, value); });
    await useAppSettingsStore.getState().loadSettings();
    expect(useAppSettingsStore.getState().values[key]).toBe("true");
    expect(await useAppSettingsStore.getState().setSettingValue(key, "false")).toBe(true);
    expect(setSetting).toHaveBeenCalledWith(key, "false");
    useAppSettingsStore.setState({ values: {}, loaded: false });
    await useAppSettingsStore.getState().loadSettings();
    expect(useAppSettingsStore.getState().values[key]).toBe("false");
  });
});
