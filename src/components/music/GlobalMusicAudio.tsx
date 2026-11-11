import { useEffect, useMemo, useRef, type SyntheticEvent } from "react";

import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { musicAudioEngine } from "../../lib/audio/musicAudioEngine";
import { bindMusicAudioSettings } from "../../lib/audio/musicAudioSettings";
import { PRELOAD_LEAD_SECONDS } from "../../lib/musicPreload";
import { recordSongHistory } from "../../lib/musicHistory";
import type { SongItem } from "../../types/music";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { normalizeAudioProcessingConfig } from "../../lib/audio/eqConfig";
import { currentOutputDevice, parseOutputDeviceProfiles } from "../../lib/audio/outputDeviceProfiles";

/**
 * Media-time delta below which a progress write is skipped. A seek always
 * exceeds it, so scrubbing still lands immediately.
 */
import { useMusicMediaSession } from "../../lib/useMusicMediaSession";
import { reportMediaPosition } from "../../lib/mediaSessionArbiter";
import { musicListens, useMusicListenHistory } from "../../lib/useMusicListenHistory";
import { useMusicQueuePersistence } from "../../lib/useMusicQueuePersistence";
import { sleepTimerTakesEnd, tickSleepTimer, useSleepTimerDriver } from "../../lib/useSleepTimerDriver";
import { useLyricsLookup } from "../../lib/lyrics/useLyrics";

/**
 * Wraps a media-element handler so only the element that is playing drives the
 * player. The standby element buffers the next track in silence; its events
 * (and the pause/emptied burst when it hands over) must not move the UI.
 */
const fromActive =
  (handler: (el: HTMLAudioElement) => void) =>
  (event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget === musicAudioEngine.getActiveElement()) handler(event.currentTarget);
  };

export function GlobalMusicAudio() {
  const firstRef = useRef<HTMLAudioElement | null>(null);
  const secondRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const processingRaw = useAppSettingsStore((s) => s.values[SETTINGS.MUSIC_AUDIO_PROCESSING] ?? "{}");
  const profileRaw = useAppSettingsStore((s) => s.values[SETTINGS.MUSIC_OUTPUT_PROFILES] ?? "{}");
  const stableVolume = useAppSettingsStore((s) => s.values[SETTINGS.STABLE_VOLUME_ENABLED] === "true");
  const volumeBoost = useAppSettingsStore((s) => s.values[SETTINGS.ALLOW_VOLUME_BOOST] === "true");
  const skipSilence = useAppSettingsStore((s) => s.values[SETTINGS.SKIP_SILENCE_ENABLED] === "true");
  const profiles = useMemo(() => parseOutputDeviceProfiles(profileRaw), [profileRaw]);

  // --- watch-history persistence ---
  const historyTrackRef = useRef<SongItem | null>(null);
  const lastProgressRef = useRef({ time: 0, duration: 0 });
  const lastPersistAtRef = useRef(0);

  useEffect(() => {
    const first = firstRef.current;
    const second = secondRef.current;
    if (!first || !second) return;
    musicAudioEngine.attach([first, second]);
    const s = useMusicPlayerStore.getState();
    musicAudioEngine.setVolume(s.volume);
    musicAudioEngine.setMuted(s.isMuted);
    bindMusicAudioSettings();
  }, []);

  useEffect(() => {
    const config = normalizeAudioProcessingConfig(JSON.parse(processingRaw));
    musicAudioEngine.setProcessingConfig(config);
    useMusicPlayerStore.setState({ audioProcessing: config, eqEnabled: config.enabled });
  }, [processingRaw]);

  useEffect(() => {
    musicAudioEngine.setLoudness(useMusicPlayerStore.getState().loudnessDb, stableVolume);
    musicAudioEngine.setVolumeBoostEnabled(volumeBoost);
    musicAudioEngine.setSkipSilenceEnabled(skipSilence);
  }, [skipSilence, stableVolume, volumeBoost]);

  useEffect(() => {
    if (profileRaw === "{}") void useAppSettingsStore.getState().setSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES, JSON.stringify(profiles));
    let disposed = false;
    const apply = async () => {
      const output = await currentOutputDevice(profiles.salt).catch(() => null);
      if (disposed || !output) return;
      const profile = profiles.profiles.find((item) => item.deviceKey === output.key);
      if (profile) useMusicPlayerStore.getState().setAudioProcessing(profile.config);
      if (profiles.activeDeviceKey !== output.key) void useAppSettingsStore.getState().setSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES, JSON.stringify({ ...profiles, activeDeviceKey: output.key }));
    };
    void apply();
    navigator.mediaDevices?.addEventListener?.("devicechange", apply);
    return () => { disposed = true; navigator.mediaDevices?.removeEventListener?.("devicechange", apply); };
  }, [profileRaw, profiles]);

  useEffect(() => {
    if (currentTrack) {
      historyTrackRef.current = currentTrack;
      lastProgressRef.current = { time: 0, duration: currentTrack.duration ?? 0 };
      lastPersistAtRef.current = Date.now();
      void recordSongHistory(currentTrack, 0, currentTrack.duration ?? 0);
    }
    return () => {
      const prev = historyTrackRef.current;
      if (prev) {
        const { time, duration } = lastProgressRef.current;
        void recordSongHistory(prev, time, duration);
      }
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    const handler = () => {
      const t = historyTrackRef.current;
      if (!t) return;
      const { time, duration } = lastProgressRef.current;
      void recordSongHistory(t, time, duration);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);


  useMusicListenHistory();
  useMusicQueuePersistence();
  useSleepTimerDriver();
  useMusicMediaSession();
  useLyricsLookup();

  const store = () => useMusicPlayerStore.getState();
  const finishTrack = () => {
    musicListens.finish(Date.now());
    if (sleepTimerTakesEnd()) return;
    store().handleEnded();
  };
  // The engine corrects a length WebKit reports wrong, so the player reads it there.
  const syncTime = (el: HTMLAudioElement) => store()._syncTime(el.currentTime, musicAudioEngine.getDuration());
  const audioProps = {
    hidden: true,
    preload: "auto",
    onPlay: fromActive(() => store()._reflectPlaying(true)),
    onPause: fromActive(() => {
      musicListens.pause();
      store()._reflectPlaying(false);
    }),
    onWaiting: fromActive(() => {
      musicListens.hold();
      store()._setBuffering(true);
    }),
    onPlaying: fromActive(() => store()._setBuffering(false)),
    onDurationChange: fromActive(syncTime),
    onSeeked: fromActive(syncTime),
    // Near the end, buffer the next track on the standby element so the change
    // is a swap. Driven by the element rather than the frame loop, which WebKit
    // pauses while the window is hidden, as it usually is while music plays.
    // The listed length stands in when WebKit reports a stream as endless.
    onTimeUpdate: fromActive((el) => {
      // A song whose element reports twice its length ends at the listed one, not after the
      // silence the element would play to reach its own.
      if (musicAudioEngine.takeListedEnd()) {
        finishTrack();
        return;
      }
      const duration = musicAudioEngine.getDuration() || store().duration;
      if (duration > 0 && duration - el.currentTime <= PRELOAD_LEAD_SECONDS) store()._preloadUpcoming();

      /*
        The store's clock follows this event instead of a frame loop, and
        `_syncTime` publishes it only when the whole second changes. A store
        write notifies every subscriber, so each one costs a selector run
        across the whole music UI, and MusicItemCard holds six of them per
        card. Anything that needs the exact position (the full player's seek
        bar, the lyrics) reads the audio engine directly.
      */
      syncTime(el);
      reportMediaPosition("music");
      tickSleepTimer();
      musicAudioEngine.tickSilenceSkip();

      // Listening time is counted from here for the same reason: a frame loop
      // stops in the background, and listening there is the common case.
      // While the next song resolves, the element still plays the last one,
      // which must not count toward the new song.
      const { currentTrack, loadingStreamId } = store();
      if (currentTrack && !el.paused && loadingStreamId === null) {
        musicListens.tick(currentTrack, el.currentTime, duration, Date.now());
      } else {
        musicListens.hold();
      }
    }),
    onEnded: fromActive(finishTrack),
    onError: (event: SyntheticEvent<HTMLAudioElement>) => {
      if (event.currentTarget === musicAudioEngine.getActiveElement()) store()._onPlaybackError();
      else store()._onPreloadError();
    },
  } as const;

  return (
    <>
      <audio ref={firstRef} {...audioProps} />
      <audio ref={secondRef} {...audioProps} />
    </>
  );
}
