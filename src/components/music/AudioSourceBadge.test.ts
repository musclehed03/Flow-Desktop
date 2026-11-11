import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";

import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { AudioSourceBadge } from "./AudioSourceBadge";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const settingsOriginal = useAppSettingsStore.getState();
const musicOriginal = useMusicPlayerStore.getState();

afterEach(() => {
  useAppSettingsStore.setState(settingsOriginal);
  useMusicPlayerStore.setState(musicOriginal);
  document.body.replaceChildren();
});

async function renderBadge() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(AudioSourceBadge)));
  return { host, root };
}

function seed(format: { mimeType: string; bitrate: number | null; sampleRate: number | null }, directActive: boolean, directMode: boolean, volume = 1) {
  useMusicPlayerStore.setState({ streamFormat: format, directActive, volume });
  useAppSettingsStore.setState({
    values: { ...settingsOriginal.values, [SETTINGS.MUSIC_DIRECT_MODE]: directMode ? "true" : "false" },
  });
}

const opus = { mimeType: 'audio/webm; codecs="opus"', bitrate: 160_000, sampleRate: 48_000 };
const aac = { mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128_000, sampleRate: 44_100 };

it("shows Direct for an Opus 48 kHz track and keeps the lossy disclosure", async () => {
  seed(opus, true, true);
  const { host, root } = await renderBadge();
  expect(host.textContent).toContain("Direct · Lossy source · Opus · 160 kbps · 48 kHz");
  await act(async () => root.unmount());
});

it("shows Standard plus the fallback reason for an AAC track with the mode on", async () => {
  seed(aac, false, true);
  const { host, root } = await renderBadge();
  expect(host.textContent).toContain("Standard · Lossy source · AAC · 128 kbps · 44.1 kHz");
  expect(host.textContent).toContain("Direct unavailable for this track");
  await act(async () => root.unmount());
});

it("discloses a scaled volume on a Direct track", async () => {
  seed(opus, true, true, 0.85);
  const { host, root } = await renderBadge();
  expect(host.textContent).toContain("volume 85%");
  await act(async () => root.unmount());
});

it("renders the old badge unchanged with the mode off", async () => {
  seed(aac, false, false);
  const { host, root } = await renderBadge();
  expect(host.textContent).toBe("Lossy source · AAC · 128 kbps · 44.1 kHz");
  await act(async () => root.unmount());
});
