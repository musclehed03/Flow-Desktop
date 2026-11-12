import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SETTINGS } from "./settings/schema";
import { usePersistedPlayerVolume } from "./usePersistedPlayerVolume";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";

vi.mock("./api/db", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function VolumeHost() {
  usePersistedPlayerVolume();
  return null;
}

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  // Leave both engines at full volume, unmuted, for the next test.
  usePlayerStore.setState({ volume: 1, muted: false });
  useMusicPlayerStore.setState({ volume: 1, isMuted: false });
  useAppSettingsStore.setState({ loaded: false });
  vi.useRealTimers();
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(createElement(VolumeHost)));
}

describe("one shared volume (fixes batch #5)", () => {
  it("hydrates both engines from the shared settings", async () => {
    useAppSettingsStore.getState().hydrateSettings({
      [SETTINGS.PLAYER_VOLUME]: "0.4",
      [SETTINGS.PLAYER_MUTED]: "false",
    });
    await mount();
    expect(usePlayerStore.getState().volume).toBe(0.4);
    expect(useMusicPlayerStore.getState().volume).toBe(0.4);
    expect(usePlayerStore.getState().muted).toBe(false);
    expect(useMusicPlayerStore.getState().isMuted).toBe(false);
  });

  it("mirrors a video volume change into music, and a music change into video", async () => {
    useAppSettingsStore.getState().hydrateSettings({
      [SETTINGS.PLAYER_VOLUME]: "0.5",
      [SETTINGS.PLAYER_MUTED]: "false",
    });
    await mount();
    await act(async () => usePlayerStore.getState().setVolume(0.7));
    expect(useMusicPlayerStore.getState().volume).toBe(0.7);
    await act(async () => useMusicPlayerStore.getState().setVolume(0.2));
    expect(usePlayerStore.getState().volume).toBe(0.2);
  });

  it("mirrors mute both ways", async () => {
    useAppSettingsStore.getState().hydrateSettings({
      [SETTINGS.PLAYER_VOLUME]: "0.5",
      [SETTINGS.PLAYER_MUTED]: "false",
    });
    await mount();
    await act(async () => useMusicPlayerStore.getState().setMuted(true));
    expect(usePlayerStore.getState().muted).toBe(true);
    await act(async () => usePlayerStore.getState().setMuted(false));
    expect(useMusicPlayerStore.getState().isMuted).toBe(false);
  });
});
