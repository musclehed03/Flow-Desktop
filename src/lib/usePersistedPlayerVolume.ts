import { useEffect, useRef } from "react";

import { SETTINGS } from "./settings/schema";
import { getSettingValue, setSettingValue, useAppSettingsStore } from "../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";

const PERSIST_DEBOUNCE_MS = 300;

/**
 * One volume for the whole app (fixes batch #5). The video player and the
 * music player used to keep separate levels — video in the SQLite
 * PLAYER_VOLUME / PLAYER_MUTED settings, music in its own profile-storage
 * config — so the two engines played at different levels (15% vs 100%) and
 * muting one left the other audible. The settings keys are now the single
 * source of truth: both stores hydrate from them on launch, and a change in
 * either store mirrors to the other and persists.
 *
 * Mounted in the video player and in the music audio host, so it runs in the
 * main window (both engines) and in the pop-out window, where the second
 * webview opens at the level the main window was playing at rather than at
 * the store default. Hydration is idempotent. The mirror decides direction
 * from fresh store reads against the last synced pair — never from render
 * closures, which go stale on the mount commit and would undo hydration —
 * and only writes while the two sides differ, so two mounts can never
 * ping-pong.
 */
export function usePersistedPlayerVolume(): void {
  const settingsLoaded = useAppSettingsStore((state) => state.loaded);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const musicVolume = useMusicPlayerStore((state) => state.volume);
  const musicMuted = useMusicPlayerStore((state) => state.isMuted);
  const hydratedRef = useRef(false);
  const lastSyncedRef = useRef({ volume: 1, muted: false });

  useEffect(() => {
    if (hydratedRef.current || !settingsLoaded) return;
    hydratedRef.current = true;
    const storedVolume = Number(getSettingValue(SETTINGS.PLAYER_VOLUME));
    const storedMuted = getSettingValue(SETTINGS.PLAYER_MUTED) === "true";
    const level = Number.isFinite(storedVolume) ? storedVolume : 1;
    const video = usePlayerStore.getState();
    video.setVolume(level);
    video.setMuted(storedMuted);
    const music = useMusicPlayerStore.getState();
    music.setVolume(level);
    music.setMuted(storedMuted);
    lastSyncedRef.current = { volume: level, muted: storedMuted };
  }, [settingsLoaded]);

  // Any change in either engine mirrors to the other and persists.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const video = usePlayerStore.getState();
    const music = useMusicPlayerStore.getState();
    const last = lastSyncedRef.current;
    const videoChanged = video.volume !== last.volume || video.muted !== last.muted;
    const musicChanged = music.volume !== last.volume || music.isMuted !== last.muted;
    if (videoChanged) {
      if (music.volume !== video.volume) music.setVolume(video.volume);
      if (music.isMuted !== video.muted) music.setMuted(video.muted);
      lastSyncedRef.current = { volume: video.volume, muted: video.muted };
    } else if (musicChanged) {
      if (video.volume !== music.volume) video.setVolume(music.volume);
      if (video.muted !== music.isMuted) video.setMuted(music.isMuted);
      lastSyncedRef.current = { volume: music.volume, muted: music.isMuted };
    } else {
      return;
    }
    const synced = lastSyncedRef.current;
    const timer = setTimeout(() => {
      void setSettingValue(SETTINGS.PLAYER_VOLUME, String(synced.volume));
      void setSettingValue(SETTINGS.PLAYER_MUTED, String(synced.muted));
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [musicMuted, musicVolume, muted, volume]);
}
