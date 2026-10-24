import { useEffect, useRef } from "react";
import type { SongItem } from "../../types/music";
import type { VideoSummary } from "../../types/video";
import { parsePlaybackSession, resolveLaunchRestoreMode, serializePlaybackSession } from "../../lib/playbackSession";
import { SETTINGS } from "../../lib/settings/schema";
import { getSettingValue, setSettingValue, useAppSettingsStore } from "../../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { usePlayerStore } from "../../store/usePlayerStore";

const SAVE_DELAY_MS = 1_000;

function musicSnapshot() {
  const state = useMusicPlayerStore.getState();
  return serializePlaybackSession({ queue: state.queue, currentIndex: state.currentIndex, position: state.progress, playing: state.isPlaying });
}

function videoSnapshot() {
  const state = usePlayerStore.getState();
  return serializePlaybackSession({ queue: state.queue, currentIndex: state.currentIndex, position: state.currentTime, playing: state.isPlaying });
}

export function PlaybackSessionController() {
  const settingsLoaded = useAppSettingsStore((state) => state.loaded);
  const started = useRef(false);

  useEffect(() => {
    if (!settingsLoaded || started.current) return;
    started.current = true;

    const mode = resolveLaunchRestoreMode(
      getSettingValue(SETTINGS.RESUME_PLAYBACK_ON_OPEN) === "true",
      getSettingValue(SETTINGS.RESTORE_QUEUE_ON_OPEN) === "true",
    );
    if (mode !== "off") {
      const music = parsePlaybackSession<SongItem>(getSettingValue(SETTINGS.MUSIC_PLAYBACK_SESSION));
      const video = parsePlaybackSession<VideoSummary>(getSettingValue(SETTINGS.VIDEO_PLAYBACK_SESSION));
      if (music) useMusicPlayerStore.getState().restoreSession(music.queue, music.currentIndex, music.position, mode === "playing" && music.playing === true);
      if (video) usePlayerStore.getState().restoreSession(video.queue, video.currentIndex, video.position, mode === "playing" && video.playing === true);
    }

    let musicTimer: ReturnType<typeof setTimeout> | null = null;
    let videoTimer: ReturnType<typeof setTimeout> | null = null;
    const saveMusic = () => { void setSettingValue(SETTINGS.MUSIC_PLAYBACK_SESSION, musicSnapshot()); };
    const saveVideo = () => { void setSettingValue(SETTINGS.VIDEO_PLAYBACK_SESSION, videoSnapshot()); };
    const queueMusicSave = () => {
      if (musicTimer) return;
      musicTimer = setTimeout(() => { musicTimer = null; saveMusic(); }, SAVE_DELAY_MS);
    };
    const queueVideoSave = () => {
      if (videoTimer) return;
      videoTimer = setTimeout(() => { videoTimer = null; saveVideo(); }, SAVE_DELAY_MS);
    };
    const unsubscribeMusic = useMusicPlayerStore.subscribe(queueMusicSave);
    const unsubscribeVideo = usePlayerStore.subscribe(queueVideoSave);
    const flush = () => {
      if (musicTimer) clearTimeout(musicTimer);
      if (videoTimer) clearTimeout(videoTimer);
      saveMusic();
      saveVideo();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      unsubscribeMusic();
      unsubscribeVideo();
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [settingsLoaded]);

  return null;
}
