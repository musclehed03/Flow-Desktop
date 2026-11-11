import { planCrossfade, crossfadeSeconds, shouldCrossfade } from "../lib/audio/crossfade";
import { sessionPlayed, rememberPlayed, allowReplay } from "../lib/djSession";
import { fetchStationPage, expandStationCandidates, rankStationBatch, stationFallback, geniusEnabled, geniusLaneFor, targetNovelty, trackStation, type MusicStation } from "../lib/musicStation";
import { recallArtist, audioMusicOnly } from "../lib/musicRecall";
import { getMusicMoodGenre } from "../lib/api/music";
import type { ArtistItem } from "../types/music";
import { useUiStore } from "./useUiStore";
import { getString } from "../lib/i18n/index";
import { create } from "zustand";
import { usePlayerStore } from "./usePlayerStore";
import { musicVideoFirstEnabled, shouldWatchSong, songToVideoSummary } from "../lib/musicVideoRouting";
import { showQueueFeedback } from "../lib/queueFeedback";
import { queueWith, remoteControl } from "./useRemoteControlStore";
import { profileStorage } from "../lib/storage/profileStorage";

import type { MusicStreamInfo, SongItem } from "../types/music";
import type { MusicAudioQuality } from "../lib/api/music";
import { getOfflineStream } from "../lib/api/downloads";
import {
  invalidateMusicStream,
  isResolveTimeout,
  prefetchMusicStream,
  resolveMusicStream,
} from "../lib/musicStreamResolution";
import { seedOfflineLyrics } from "../lib/lyrics/offline";
import { findDownloadedRecord } from "../lib/useDownloads";
import { useDownloadsLibraryStore } from "./useDownloadsLibraryStore";
import { normalizeBackendError } from "../lib/api/errors";
import { recordPlayerEvent } from "../lib/playerDiagnostics";
import { logToBackend } from "../lib/diagnostics";
import { listedSeconds } from "../lib/audio/listedLength";
import { musicAudioEngine } from "../lib/audio/musicAudioEngine";
import { migrateSavedMusicVolume } from "../lib/audio/volumeCurve";
import { preloadTrack } from "../lib/musicPreload";
import { upcomingIndex, type QueueRepeatMode } from "../lib/musicQueueOrder";
import { restoreOriginalOrder, shuffleFrom, shuffleUpcoming } from "../lib/musicShuffle";
import { getSettingValue, setSettingValue } from "./useAppSettingsStore";
import { defaultAudioProcessingConfig, normalizeAudioProcessingConfig, normalizeGraphicGains, type AudioProcessingConfig } from "../lib/audio/eqConfig";
import { dispatchMixedMediaEnded, dispatchMixedMediaPrevious } from "../lib/mixedMediaEvents";
import {
  appendTracks,
  insertNext,
  isUpcoming,
  removeAt,
  removeWhere,
  type QueueLists,
} from "../lib/musicQueueEdits";
import { radioSession } from "../lib/musicRadioSession";
import type { RestoredQueue } from "../lib/musicQueuePersistence";
import { isLongTrack, resumePositionFor } from "../lib/musicResume";
import { POOL_LOW_WATER } from "../lib/musicRadioPlanner";
import { SETTINGS } from "../lib/settings/schema";
import { shouldSkipUnplayable } from "../lib/musicSkip";
import { MEDIA_FAILURE_KIND, RecoveryLedger, classifyMediaFailure } from "../lib/musicRecoveryPolicy";

export type MusicViewState = "dock" | "full" | "queue" | "lyrics";
export type MusicRepeatMode = QueueRepeatMode;

/** The legacy ten-band preset names, kept for `applyEqPreset`. */
export type EqPresetName =
  | "flat"
  | "bass"
  | "vocal"
  | "treble"
  | "electronic"
  | "acoustic";

// The legacy ten-band preset curves (low → high), from the deleted
// `lib/audio/eqBands.ts`; they drive the 10-band graphic stage, which the
// upstream EqChain still honours through `AudioProcessingConfig`.
const LEGACY_EQ_PRESETS: Record<EqPresetName, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 1, 2],
  vocal: [-2, -1, 0, 2, 4, 4, 3, 2, 0, -1],
  treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  electronic: [5, 4, 1, 0, -1, 1, 0, 2, 3, 4],
  acoustic: [3, 2, 1, 1, 2, 2, 3, 3, 2, 1],
};

let suppressAutomaticFadeUntil = 0;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const videoIdOf = (track: SongItem): string => track.videoId ?? track.id;

// --- persistence ---

const PERSIST_KEY = "flow_music_player";

interface PersistedMusicConfig {
  volume: number;
  isMuted: boolean;
  eqEnabled: boolean;
  eqGains: number[];
  normalizationEnabled: boolean;
  repeatMode: MusicRepeatMode;
  isShuffle: boolean;
  radioEnabled: boolean;
}

const DEFAULT_CONFIG: PersistedMusicConfig = {
  volume: 1,
  isMuted: false,
  eqEnabled: false,
  eqGains: Array(10).fill(0),
  normalizationEnabled: true,
  repeatMode: "none",
  isShuffle: false,
  radioEnabled: true,
};

const loadConfig = (): PersistedMusicConfig => {
  try {
    const saved = profileStorage.getItem(PERSIST_KEY);
    if (!saved) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(saved) as Partial<PersistedMusicConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      volume: clamp01(parsed.volume ?? DEFAULT_CONFIG.volume),
      eqGains: normalizeGraphicGains(parsed.eqGains ?? DEFAULT_CONFIG.eqGains, 10),
    };
  } catch (error) {
    console.warn("Failed to load saved music player config", error);
    return { ...DEFAULT_CONFIG };
  }
};

migrateSavedMusicVolume();
const initialConfig = loadConfig();
const initialProcessing = (() => {
  try {
    const saved = normalizeAudioProcessingConfig(JSON.parse(getSettingValue(SETTINGS.MUSIC_AUDIO_PROCESSING)));
    if (getSettingValue(SETTINGS.MUSIC_AUDIO_PROCESSING) !== "{}") return saved;
  } catch { /* Migrate the legacy ten-band local config below. */ }
  const migrated = defaultAudioProcessingConfig();
  migrated.enabled = initialConfig.eqEnabled;
  migrated.graphicGains[10] = [...initialConfig.eqGains];
  return migrated;
})();

const saveConfig = (get: () => MusicPlayerState) => {
  try {
    const s = get();
    const config: PersistedMusicConfig = {
      volume: s.volume,
      isMuted: s.isMuted,
      eqEnabled: s.eqEnabled,
      eqGains: s.eqGains,
      normalizationEnabled: s.normalizationEnabled,
      repeatMode: s.repeatMode,
      isShuffle: s.isShuffle,
      radioEnabled: s.radioEnabled,
    };
    profileStorage.setItem(PERSIST_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to save music player config", error);
  }
};

// Recoveries each track has had from a media-element failure.
const recovery = new RecoveryLedger();
// The user paused: a stall or a recovery must never start the song again.
let userPaused = false;
let stopWaitingForNetwork: (() => void) | null = null;

const cancelNetworkWait = () => {
  stopWaitingForNetwork?.();
  stopWaitingForNetwork = null;
};

/** Runs `onBack` once the browser reports the connection is back. */
const waitForNetwork = (onBack: () => void) => {
  cancelNetworkWait();
  const handler = () => {
    stopWaitingForNetwork = null;
    onBack();
  };
  window.addEventListener("online", handler, { once: true });
  stopWaitingForNetwork = () => window.removeEventListener("online", handler);
};

// A queue restored at launch shows its song paused without loading it; the
// first play loads it at the saved position.
let awaitingFirstPlay = false;

// Unplayable tracks skipped since the last one that started.
let unplayableSkips = 0;

// When the current load began, for the start-up timing in the diagnostics log.
let loadStartedAt: { videoId: string; at: number; resolvedAt?: number; hidden: boolean } | null = null;

// A stall with no bytes arriving for this long is treated as a dead connection
// and recovered; a slow one that is still receiving is left to finish.
const STALL_CHECK_MS = 5_000;
const STALL_LIMIT_MS = 15_000;
let stallWatch: ReturnType<typeof setInterval> | null = null;

const stopStallWatch = () => {
  if (stallWatch !== null) clearInterval(stallWatch);
  stallWatch = null;
};
const MUSIC_AUDIO_QUALITY_VALUES = new Set(["Auto", "High", "Medium", "Low"]);

// --- radio / autoplay -------------------------------------------------
const RADIO_LOW_WATER = 3;
const RADIO_BATCH = 10;
const RADIO_MAX_PAGES = 4;

let radioGeneration = 0;
let transportGeneration = 0;
const radioSessionSeen = new Set<string>();
let radioInFlight: Promise<void> | null = null;

// Hide predicate pushed in by `useMusicActionsStore` (block list). Kept as a module-level
// ref so radio autoplay can consult it without the store importing the actions store.
let hiddenPredicate: (track: SongItem) => boolean = () => false;

const resetRadioSession = (seedIds: string[] = []) => {
  radioGeneration++;
  radioInFlight = null;
  radioSessionSeen.clear();
  for (const id of seedIds) radioSessionSeen.add(id);
  radioSession.reset(seedIds);
};

const nextMusicIndex = (state: MusicPlayerState) => upcomingIndex({ ...state, playedIds: geniusEnabled() ? sessionPlayed() : undefined });
const radioNotice = () => useUiStore.getState().showToast({ title: getString("radio_unavailable_title"), message: getString("radio_unavailable_message"), variant: "error" });

export const isPlayableAudio = (s: SongItem): boolean => {
  const vt = s.musicVideoType;
  const isVideoSong = !!vt && vt !== "MUSIC_VIDEO_TYPE_ATV";
  const dur = s.duration ?? 0;
  const okDuration = dur === 0 || (dur >= 30 && dur <= 1200);
  return (!isVideoSong || musicVideoFirstEnabled()) && okDuration && !!(s.videoId ?? s.id);
};

const queueListsOf = (s: QueueLists): QueueLists => ({
  queue: s.queue,
  unshuffledQueue: s.unshuffledQueue,
  currentIndex: s.currentIndex,
});

/** The station's tracks still waiting to play, which count toward each artist's share. */
const waitingStationTracks = (s: Pick<MusicPlayerState, "queue" | "currentIndex" | "radioQueuedIds">) => {
  const station = new Set(s.radioQueuedIds);
  return s.queue.filter((t, i) => i > s.currentIndex && station.has(videoIdOf(t)));
};

/**
 * A queue replacing the last one, with no station tracks and no undo of the
 * old one. `unshuffled` is the order shuffle restores, or null with shuffle off.
 */
const freshQueue = (queue: SongItem[], unshuffled: SongItem[] | null) => {
  undoSnapshot = null;
  return {
    queue,
    unshuffledQueue: unshuffled,
    radioQueuedIds: [],
    radioLoading: false,
    radioExhausted: false,
  };
};

type UndoSnapshot = Pick<
  MusicPlayerState,
  "queue" | "unshuffledQueue" | "currentIndex" | "radioQueuedIds" | "queueSource"
>;
/** The queue as it stood before the last removal or clear, for its undo toast. */
let undoSnapshot: UndoSnapshot | null = null;

const undoSnapshotOf = (s: UndoSnapshot): UndoSnapshot => ({
  queue: s.queue,
  unshuffledQueue: s.unshuffledQueue,
  currentIndex: s.currentIndex,
  radioQueuedIds: s.radioQueuedIds,
  queueSource: s.queueSource,
});

const getMusicAudioQualitySetting = (): MusicAudioQuality => {
  const value = getSettingValue(SETTINGS.MUSIC_AUDIO_QUALITY);
  return MUSIC_AUDIO_QUALITY_VALUES.has(value) ? (value as MusicAudioQuality) : "Auto";
};

interface MusicPlayerState {
  // --- now playing ---
  currentTrack: SongItem | null;
  queue: SongItem[];
  currentIndex: number;
  isPlaying: boolean;
  progress: number; // seconds
  duration: number; // seconds
  isBuffering: boolean;
  restoredPaused: boolean;

  // --- audio config (persisted) ---
  volume: number; // 0..1
  isMuted: boolean;
  loudnessDb: number | null;
  normalizationEnabled: boolean;
  eqEnabled: boolean;
  eqGains: number[]; // 10 bands, dB
  audioProcessing: AudioProcessingConfig;
  streamFormat: { mimeType: string; bitrate: number | null; sampleRate: number | null } | null;

  // --- modes (persisted) ---
  repeatMode: MusicRepeatMode;
  isShuffle: boolean;
  radioEnabled: boolean; // autoplay similar music when the queue runs out
  // A station the user started by name runs until the next queue even with autoplay off.
  // Session only: the saved setting governs queues that run out on their own.
  radioStationActive: boolean;

  /** Where the current queue was started from ("Playing from …"); null for ad-hoc plays. */
  queueSource: string | null;
  /** The order shuffle rearranged, restored when it is turned off; null while shuffle is off. */
  unshuffledQueue: SongItem[] | null;

  // --- radio / autoplay ---
  station: MusicStation | null;
  playedIds: string[];
  radioError: boolean;
  radioLoading: boolean;
  radioQueuedIds: string[];
  /** The station found nothing more to play, even from its anchor songs. */
  radioExhausted: boolean;

  // --- overlay / surface ---
  viewState: MusicViewState;
  musicFullscreen: boolean;

  // --- stream resolution ---
  loadingStreamId: string | null;
  streamError: string | null;
  streamErrorKind: string | null;

  // --- intents (called by UI) ---
  playTrack: (track: SongItem) => Promise<void>;
  /** `start` begins the first song at `at` seconds, and paused unless `autoplay`, in one load. */
  playQueue: (
    tracks: SongItem[],
    startIndex?: number,
    source?: string | null,
    start?: { at: number; autoplay: boolean },
  ) => Promise<void>;
  restoreSession: (queue: SongItem[], currentIndex: number, position: number, autoplay: boolean) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  dismiss: () => void;
  retryCurrentTrack: () => void;
  clearStreamError: () => void;

  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  toggleRadio: () => void;
  startRadio: (seed?: SongItem) => Promise<void>;
  resumeStation: (station: MusicStation, discovery: import("../lib/musicStation").DiscoveryLevel) => Promise<boolean>;
  startArtistRadio: (artist: ArtistItem) => Promise<void>;
  startMixStation: (mix: import("../types/music").DailyMixSeed, songs: SongItem[], index?: number) => Promise<void>;
  startGenreRadio: (genre: { browseId: string; params: string | null; title: string }) => Promise<void>;

  addToQueue: (track: SongItem) => void;
  playNextInQueue: (track: SongItem) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  /** Replaces the queue around the song playing, which carries on; it goes first when `tracks` leaves it out. */
  replaceQueue: (tracks: SongItem[]) => void;
  /** Puts back the queue as it was before the last removal or clear. */
  undoQueueEdit: () => void;
  /** Shows the queue saved at the last session, paused, unless something already plays. */
  restoreSavedQueue: (restored: RestoredQueue) => void;

  // --- block list integration (driven by useMusicActionsStore) ---
  setHiddenPredicate: (predicate: (track: SongItem) => boolean) => void;
  pruneQueue: (shouldRemove: (track: SongItem) => boolean) => void;

  setViewState: (view: MusicViewState) => void;
  openOverlay: (view?: Exclude<MusicViewState, "dock">) => void;
  closeOverlay: () => void;

  setEqEnabled: (enabled: boolean) => void;
  setEqBand: (index: number, gainDb: number) => void;
  setEqGains: (gains: number[]) => void;
  applyEqPreset: (name: EqPresetName) => void;
  setAudioProcessing: (config: AudioProcessingConfig) => void;
  /** Follows the saved music normalization setting (see `bindMusicAudioSettings`). */
  setNormalizationEnabled: (enabled: boolean) => void;

  // --- internal: driven by the root <audio> controller (element → store) ---
  _ensureRadio: () => Promise<void>;
  /** `autoplay: false` loads the track paused, for a recovery while the user had paused. */
  _loadIndex: (index: number, options?: { resumeAt?: number; autoplay?: boolean; automatic?: boolean; manual?: boolean }) => Promise<void>;
  _prefetchUpcoming: () => void;
  _preloadUpcoming: () => void;
  _onPreloadError: () => void;
  _syncTime: (progress: number, duration: number) => void;
  _reflectPlaying: (isPlaying: boolean) => void;
  _setBuffering: (isBuffering: boolean) => void;
  handleEnded: () => void;
  _onPlaybackError: () => void;
}

/** Whether the queue refills itself: the saved autoplay setting, or a station started by name. */
export const selectRadioOn = (s: Pick<MusicPlayerState, "radioEnabled" | "radioStationActive">): boolean =>
  s.radioEnabled || s.radioStationActive;

/** Resolves a song's stream ahead of playing it; a downloaded one plays from disk and needs none. */
export function warmMusicStream(videoId: string): void {
  if (findDownloadedRecord(videoId, "audio")) return;
  prefetchMusicStream(videoId, getMusicAudioQualitySetting(), { preferAac: musicAudioEngine.wantsAac() });
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  progress: 0,
  duration: 0,
  isBuffering: false,
  restoredPaused: false,

  volume: initialConfig.volume,
  isMuted: initialConfig.isMuted,
  loudnessDb: null,
  normalizationEnabled: getSettingValue(SETTINGS.MUSIC_LOUDNESS_NORMALIZATION) === "true",
  eqEnabled: initialConfig.eqEnabled,
  eqGains: initialConfig.eqGains,
  audioProcessing: initialProcessing,
  streamFormat: null,

  repeatMode: initialConfig.repeatMode,
  isShuffle: initialConfig.isShuffle,
  radioEnabled: initialConfig.radioEnabled,
  radioStationActive: false,
  queueSource: null,
  station: null,
  playedIds: [],
  radioError: false,
  unshuffledQueue: null,
  radioLoading: false,
  radioQueuedIds: [],
  radioExhausted: false,

  viewState: "dock",
  musicFullscreen: false,

  loadingStreamId: null,
  streamError: null,
  streamErrorKind: null,

  // --- intents ----------------------------------------------------------

  playTrack: async (track) => {
    transportGeneration++;
    set({ station: null, playedIds: get().playedIds.filter((id) => id !== videoIdOf(track)), radioError: false });
    const remote = remoteControl();
    if (remote) return remote.play([videoIdOf(track)], 0, true);
    resetRadioSession([videoIdOf(track)]);
    set({ ...freshQueue([track], get().isShuffle ? [track] : null), radioStationActive: false, queueSource: null });
    await get()._loadIndex(0);
  },

  playQueue: async (tracks, startIndex = 0, source = null, start) => {
    if (tracks.length === 0) return;
    transportGeneration++;
    set({ station: null, playedIds: get().playedIds.filter((id) => id !== videoIdOf(tracks[Math.max(0, Math.min(startIndex, tracks.length - 1))]!)), radioError: false });
    const remote = remoteControl();
    if (remote) return remote.play(tracks.map(videoIdOf), startIndex, true);
    resetRadioSession(tracks.map(videoIdOf));
    const first = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const shuffled = get().isShuffle;
    set({
      ...freshQueue(shuffled ? shuffleFrom(tracks, first) : tracks, shuffled ? tracks : null),
      radioStationActive: false,
      queueSource: source,
    });
    await get()._loadIndex(shuffled ? 0 : first, start && { resumeAt: start.at, autoplay: start.autoplay });
  },

  restoreSession: (queue, currentIndex, position, autoplay) => {
    if (!queue.length) return;
    const index = Math.max(0, Math.min(currentIndex, queue.length - 1));
    const track = queue[index]!;
    // A paused restore warms nothing until it is played, like a queue
    // restored at launch (see the subscribe at the end of this file).
    awaitingFirstPlay = !autoplay;
    set({
      queue,
      currentIndex: index,
      currentTrack: track,
      progress: Math.max(0, position),
      duration: track.duration ?? 0,
      isPlaying: false,
      isBuffering: false,
      restoredPaused: !autoplay,
      loadingStreamId: null,
      streamError: null,
      streamErrorKind: null,
      viewState: "dock",
    });
    if (autoplay) void get()._loadIndex(index, { resumeAt: Math.max(0, position) });
  },

  _ensureRadio: async () => {
    if (radioInFlight) return radioInFlight;
    const { queue, currentIndex, isShuffle } = get();
    if (!selectRadioOn(get())) return;
    const seed = queue[queue.length - 1] ?? get().currentTrack;
    if (!seed) return;

    // The genius DJ lane keeps its own station fetch, ranking, and failure
    // notice; every other queue tops up through the upstream radio session.
    // (geniusLaneFor: only when the DJ ranking is engaged or the station
    // needs its own fetch — a plain station at "moderate" discovery gets
    // nothing from the lane except a fetch without the session's anchors,
    // pool, and per-artist cap.)
    if (geniusLaneFor(get().station)) {
      const remaining = isShuffle
        ? queue.filter((track) => !sessionPlayed().includes(videoIdOf(track))).length
        : queue.length - 1 - currentIndex;
      if (remaining > (isShuffle ? 0 : RADIO_LOW_WATER)) return;
      const generation = radioGeneration;
      let station = get().station ?? { ...trackStation(seed), title: get().queueSource ?? undefined };
      radioInFlight = (async () => {
        set({ radioLoading: true, radioError: false });
        try {
          let collected: SongItem[] = [];
          const collect = (songs: SongItem[]) => {
            const seen = new Set([...get().queue.map(videoIdOf), ...collected.map(videoIdOf)]);
            for (const track of songs) {
              const id = videoIdOf(track);
              if (isPlayableAudio(track) && !seen.has(id) && !radioSessionSeen.has(id)
                && (!geniusEnabled() || !sessionPlayed().includes(id)) && !hiddenPredicate(track)) {
                collected.push(track); seen.add(id);
              }
            }
          };
          for (let page = 0; page < RADIO_MAX_PAGES && collected.length < RADIO_BATCH; page++) {
            let fetched = false;
            for (let attempt = 0; attempt < (geniusEnabled() ? 2 : 1); attempt++) {
              try {
                const result = await fetchStationPage(station, seed);
                station = result.station;
                collect(result.songs);
                fetched = result.songs.length > 0;
                if (fetched) break;
              } catch { /* Retry once before falling back to another local recall lane. */ }
            }
            if (!fetched || (!station.continuation && station.type !== "genre")) break;
          }
          const expanded = await expandStationCandidates(station, collected).catch(() => ({ station, songs: collected }));
          station = expanded.station;
          collected = [];
          collect(expanded.songs);
          if (!collected.length && geniusEnabled()) collect(await stationFallback(seed, new Set([...get().queue.map(videoIdOf), ...sessionPlayed()])));
          const batch = await rankStationBatch(collected, station, RADIO_BATCH);
          if (generation !== radioGeneration) return;
          if (batch.length) {
            for (const track of batch) radioSessionSeen.add(videoIdOf(track));
            set({ queue: [...get().queue, ...batch], station, radioQueuedIds: [...get().radioQueuedIds, ...batch.map(videoIdOf)] });
          } else if (geniusEnabled()) { set({ radioError: true }); radioNotice(); }
        } catch {
          if (generation === radioGeneration && geniusEnabled()) { set({ radioError: true }); radioNotice(); }
        } finally {
          if (generation === radioGeneration) { set({ radioLoading: false }); radioInFlight = null; }
        }
      })();
      return radioInFlight;
    }

    const remaining = queue.length - 1 - currentIndex;
    // Shuffle means "shuffle my queue" while it plays; the station carries on
    // once every shuffled song has had its turn.
    if (remaining > (isShuffle ? 0 : RADIO_LOW_WATER)) return;

    const generation = radioSession.generation;

    const request = (async () => {
      set({ radioLoading: true });
      try {
        const queueIds = () => new Set(get().queue.map(videoIdOf));
        const feedQueue = (): boolean => {
          if (radioSession.generation !== generation) return false;
          const batch = radioSession.take(queueIds(), RADIO_BATCH);
          if (batch.length === 0) return false;
          set({
            ...appendTracks(queueListsOf(get()), batch),
            radioQueuedIds: [...get().radioQueuedIds, ...batch.map(videoIdOf)],
          });
          return true;
        };

        let fed = feedQueue();
        for (
          let page = 0;
          page < RADIO_MAX_PAGES && radioSession.poolSize() < POOL_LOW_WATER && radioSession.canRefill();
          page++
        ) {
          await radioSession.refill({
            seed,
            queueIds: queueIds(),
            stationTracks: waitingStationTracks(get()),
            isHidden: hiddenPredicate,
          });
          if (radioSession.generation !== generation) return;
          if (!fed) fed = feedQueue();
        }
      } catch (error) {
        console.warn("Radio autoplay fetch failed", error);
      } finally {
        if (radioSession.generation === generation) {
          set({ radioLoading: false, radioExhausted: radioSession.isExhausted() });
        }
      }
    })().finally(() => {
      // Cleared here, not in the body: a top-up served from the pool finishes
      // before the assignment below, which would then keep the settled promise.
      if (radioInFlight === request) radioInFlight = null;
    });
    radioInFlight = request;
    return request;
  },
  _loadIndex: async (index, options) => {
    if (!options?.automatic) transportGeneration++;
    const track = get().queue[index];
    if (!track) return;
    set({ restoredPaused: false });
    const outgoing = get().currentTrack;
    const fade = !!outgoing && get().isPlaying && options?.resumeAt === undefined && !shouldWatchSong(track)
      && shouldCrossfade(getSettingValue(SETTINGS.CROSSFADE_ENABLED) === 'true', options?.automatic || options?.manual ? 'advance' : 'explicit', getSettingValue(SETTINGS.CROSSFADE_EVERYTHING) === 'true');
    const outgoingDuration = get().duration || outgoing?.duration || 0;
    const makePlan = () => planCrossfade(crossfadeSeconds(getSettingValue(SETTINGS.CROSSFADE_SECONDS)), musicAudioEngine.getCurrentTime(),
      Math.max(0, outgoingDuration - musicAudioEngine.getCurrentTime()), outgoing?.transition, track.transition);
    if (!options?.automatic) allowReplay(videoIdOf(track));
    rememberPlayed(videoIdOf(track));
    const playedIds = [...new Set([...get().playedIds, ...sessionPlayed()])];
    set({ playedIds });
    if (shouldWatchSong(track)) {
      const originalQueue = get().queue;
      const queue = originalQueue.filter((item) => !!videoIdOf(item));
      const watchIndex = originalQueue.slice(0, index).filter((item) => !!videoIdOf(item)).length;
      const station = get().station ?? { ...trackStation(track), title: get().queueSource ?? undefined };
      get().dismiss();
      usePlayerStore.getState().setQueue(queue.map(songToVideoSummary), watchIndex);
      usePlayerStore.setState({ musicStation: station, playedIds: [...new Set([...usePlayerStore.getState().playedIds, ...playedIds])] });
      window.dispatchEvent(new Event("flow-video-expand-request"));
      return;
    }
    const videoId = videoIdOf(track);
    let resumeAt = options?.resumeAt ?? 0;
    const autoplay = options?.autoplay ?? true;
    awaitingFirstPlay = false;
    cancelNetworkWait();
    if (autoplay) userPaused = false;
    const start = async () => {
      if (autoplay) await musicAudioEngine.play();
    };

    set({
      currentTrack: track,
      currentIndex: index,
      progress: resumeAt,
      duration: track.duration ?? 0,
      isPlaying: autoplay,
      isBuffering: autoplay,
      streamError: null,
      streamErrorKind: null,
      loadingStreamId: videoId,
    });
    loadStartedAt = { videoId, at: performance.now(), hidden: document.hidden };
    recordPlayerEvent(`music resolve start: ${videoId}`);

    // Radio top-up and next-track warming wait until this track is audible, so
    // they never compete with it for a slow connection.
    const afterStart = () => {
      unplayableSkips = 0;
      void get()._ensureRadio();
      get()._prefetchUpcoming();
    };

    // A fresh play of a long track picks up where it was left (a setting).
    if (options?.resumeAt === undefined && isLongTrack(track.duration ?? 0)) {
      resumeAt = await resumePositionFor(track);
      if (get().loadingStreamId !== videoId) return;
      if (resumeAt > 0) set({ progress: resumeAt });
    }

    // Gapless: the standby element already holds this track, buffered.
    // An advance into a preloaded track fades across it with the beat-aware
    // plan; the audio-settings subscriber arms the plain fade the same way.
    if (resumeAt === 0) {
      const plan = fade ? makePlan() : null;
      if (plan) musicAudioEngine.armCrossfade(plan.seconds);
      if (musicAudioEngine.activatePreloaded(videoId)) {
        const loudnessDb = musicAudioEngine.getActiveLoudness();
        set({ loudnessDb, loadingStreamId: null, streamFormat: musicAudioEngine.getActiveFormat?.() ?? null });
        musicAudioEngine.setLoudness(loudnessDb, get().normalizationEnabled);
        await start();
        if (plan && plan.incomingStart > 0) {
          musicAudioEngine.seekWhenReady(plan.incomingStart);
          set({ progress: plan.incomingStart });
        }
        recordPlayerEvent(`music started from preload: ${videoId}`);
        afterStart();
        return;
      }
    }
    // Whatever the standby element holds is not what plays next any more.
    musicAudioEngine.clearPreload();

    const audioQuality = getMusicAudioQualitySetting();
    const lookup = () =>
      resolveMusicStream(videoId, audioQuality, {
        preferAac: recovery.prefersAac(videoId) || musicAudioEngine.wantsAac(),
      });

    try {
      // The downloads library is a SQLite read and resolution is a network round
      // trip; when the library still has to load, overlap the two rather than
      // paying them in sequence. Once loaded the offline check is synchronous,
      // so a saved track still needs no network.
      let streamRequest: Promise<MusicStreamInfo> | null = null;
      if (!useDownloadsLibraryStore.getState().loaded) {
        streamRequest = lookup();
        streamRequest.catch(() => {});
        await useDownloadsLibraryStore.getState().ensureLoaded();
        if (get().loadingStreamId !== videoId) return;
      }

      if (findDownloadedRecord(videoId, "audio")) {
        try {
          const offline = await getOfflineStream(videoId, "music");
          if (get().loadingStreamId !== videoId) return;
          // Cover art and lyrics were saved next to the audio at download time —
          // use them so an offline track needs no network at all to display.
          if (offline.lyrics) seedOfflineLyrics(videoId, offline.lyrics);
          set({
            loudnessDb: offline.loudnessDb,
            streamFormat: null,
            loadingStreamId: null,
            ...(offline.artworkUrl
              ? { currentTrack: { ...track, thumbnail: offline.artworkUrl } }
              : {}),
          });
          musicAudioEngine.setLoudness(offline.loudnessDb, get().normalizationEnabled);
          await musicAudioEngine.load(offline.url, offline.contentType, track.duration ?? null);
          musicAudioEngine.seekWhenReady(resumeAt);
          await start();
          afterStart();
          return;
        } catch (offlineError) {
          console.warn("Offline track unavailable, falling back to stream", offlineError);
        }
      }

      let info: MusicStreamInfo;
      try {
        info = await (streamRequest ?? lookup());
      } catch (firstError) {
        // One automatic retry: a timeout or a dropped connection on a slow
        // link usually clears on the second attempt. A wait that timed out
        // left the backend's walk running, so the retry joins it rather than
        // walking the client ladder a second time.
        if (get().loadingStreamId !== videoId) return;
        recordPlayerEvent(`music resolve retry: ${normalizeBackendError(firstError).kind}`);
        if (!isResolveTimeout(firstError)) invalidateMusicStream(videoId);
        info = await lookup();
      }
      if (get().loadingStreamId !== videoId) return;

      set({ streamFormat: { mimeType: info.mimeType, bitrate: info.bitrate, sampleRate: info.sampleRate ?? null } });
      musicAudioEngine.setSourceSampleRate?.(info.sampleRate ?? null);
      set({ loudnessDb: info.loudnessDb, loadingStreamId: null });
      if (loadStartedAt?.videoId === videoId) loadStartedAt.resolvedAt = performance.now();
      musicAudioEngine.setLoudness(info.loudnessDb, get().normalizationEnabled);
      await musicAudioEngine.load(info.audioUrl, info.mimeType, listedSeconds(info, track));
      musicAudioEngine.seekWhenReady(resumeAt);
      await start();
      afterStart();
    } catch (e) {
      if (get().loadingStreamId !== videoId) return;
      const normalized = normalizeBackendError(e);
      recordPlayerEvent(`music resolve failed: ${normalized.kind} (${normalized.message})`);
      const { queue, currentIndex, repeatMode } = get();
      const hasNext = repeatMode !== "one" && currentIndex + 1 < queue.length;
      if (shouldSkipUnplayable(normalized.kind, unplayableSkips, hasNext)) {
        unplayableSkips += 1;
        recordPlayerEvent(`music skipped an unplayable track (${unplayableSkips} in a row)`);
        set({ loadingStreamId: null });
        get().next();
        return;
      }
      unplayableSkips = 0;
      if (!navigator.onLine) {
        waitForNetwork(() => {
          if (get().queue[get().currentIndex] === track) void get()._loadIndex(index, { resumeAt, autoplay });
        });
      }
      set({
        streamError: normalized.message,
        streamErrorKind: normalized.kind,
        loadingStreamId: null,
        isPlaying: false,
        isBuffering: false,
      });
    }
  },

  togglePlay: () => {
    const remote = remoteControl();
    if (remote) return remote.command(remote.playing ? "pause" : "play");
    if (get().isPlaying) get().pause();
    else get().play();
  },

  play: () => {
    const remote = remoteControl();
    if (remote) return remote.command("play");
    if (!get().currentTrack) return;
    if (get().restoredPaused) {
      void get()._loadIndex(get().currentIndex, { resumeAt: get().progress });
      return;
    }
    if (awaitingFirstPlay) {
      void get()._loadIndex(get().currentIndex, { resumeAt: get().progress });
      return;
    }
    userPaused = false;
    void musicAudioEngine.play();
    set({ isPlaying: true });
  },

  pause: () => {
    transportGeneration++;
    const remote = remoteControl();
    if (remote) return remote.command("pause");
    userPaused = true;
    stopStallWatch();
    musicAudioEngine.pause();
    set({ isPlaying: false, ...(get().loadingStreamId && get().currentTrack && get().loadingStreamId !== videoIdOf(get().currentTrack!) ? { loadingStreamId: null, isBuffering: false } : {}) });
  },

  // Tear down the player entirely — stops audio, clears the queue, hides the
  // dock/overlay. (The controller flushes a final history record on track clear.)
  dismiss: () => {
    transportGeneration++;
    awaitingFirstPlay = false;
    stopStallWatch();
    cancelNetworkWait();
    musicAudioEngine.stop();
    resetRadioSession();
    set({
      ...freshQueue([], null),
      currentTrack: null,
      queueSource: null,
      station: null,
      playedIds: [],
      radioQueuedIds: [],
      radioStationActive: false,
      currentIndex: -1,
      isPlaying: false,
      isBuffering: false,
      restoredPaused: false,
      progress: 0,
      duration: 0,
      loudnessDb: null,
      streamFormat: null,
      loadingStreamId: null,
      streamError: null,
      streamErrorKind: null,
      viewState: "dock",
    });
  },

  // Which track plays next depends on shuffle and repeat, so ask the same
  // question the transport does rather than assuming the following index.
  // Warms the next song, and the one before for Previous, so either starts from a cache read.
  _prefetchUpcoming: () => {
    const state = get();
    const index = nextMusicIndex(state);
    const upcoming = index >= 0 ? state.queue[index] : null;
    if (upcoming && !shouldWatchSong(upcoming)) {
      const upcomingId = videoIdOf(upcoming);
      // A downloaded track plays from disk; resolving it would be a wasted request.
      if (!findDownloadedRecord(upcomingId, "audio")) prefetchMusicStream(upcomingId, getMusicAudioQualitySetting());
    }
    const previous = state.queue[state.currentIndex - 1];
    if (previous) warmMusicStream(videoIdOf(previous));
  },

  // Buffers the next track's audio on the standby element near the end of the
  // current one, so the change is a swap with no load in between.
  _preloadUpcoming: () => {
    // The engine itself refuses to preload while a fade is running.
    const state = get();
    const index = nextMusicIndex(state);
    const upcoming = index >= 0 ? state.queue[index] : null;
    if (!upcoming || shouldWatchSong(upcoming)) return;
    void preloadTrack(upcoming, getMusicAudioQualitySetting(), (videoId) => {
      const now = get();
      const nowTrack = now.queue[nextMusicIndex(now)];
      return !!nowTrack && videoIdOf(nowTrack) === videoId;
    });
  },

  _onPreloadError: () => {
    // The standby element refused its link; forget both so the track resolves
    // afresh when it is reached.
    const videoId = musicAudioEngine.clearPreload();
    if (videoId) invalidateMusicStream(videoId);
  },

  retryCurrentTrack: () => {
    const { currentIndex, queue } = get();
    if (currentIndex < 0) return;
    // The retry exists because the resolved URL stopped working, so it must not
    // be handed the same cached answer again.
    const track = queue[currentIndex];
    if (track) {
      invalidateMusicStream(videoIdOf(track));
      recovery.forgive(videoIdOf(track));
    }
    set({ streamError: null, streamErrorKind: null });
    recordPlayerEvent(`music retry: index ${currentIndex}`);
    // Pick up where it stopped rather than from the start of the track.
    void get()._loadIndex(currentIndex, { resumeAt: get().progress });
  },

  clearStreamError: () => set({ streamError: null, streamErrorKind: null }),

  next: () => {
    const remote = remoteControl();
    if (remote) return remote.command("next");
    const { queue, currentIndex, repeatMode } = get();
    if (queue.length === 0) return;
    if (repeatMode === "none" && currentIndex + 1 >= queue.length && dispatchMixedMediaEnded("music")) return;

    // Genius DJ steers Next only when it is actually steering the music —
    // discovery "less" or "more". At the default "moderate" discovery the
    // queue itself is the order: shuffle already rearranged it, so Next,
    // Previous, Up next and the preload all follow the same list.
    if (targetNovelty() !== undefined && repeatMode !== "all") {
      const next = nextMusicIndex({ ...get(), repeatMode: repeatMode === "one" ? "none" : repeatMode });
      if (next >= 0) { void get()._loadIndex(next, { automatic: true }); return; }
      if (!selectRadioOn(get())) { musicAudioEngine.pause(); set({ isPlaying: false }); return; }
      const generation = transportGeneration;
      void (async () => {
        await get()._ensureRadio();
        if (generation !== transportGeneration) return;
        const index = nextMusicIndex({ ...get(), repeatMode: "none" });
        if (index >= 0) void get()._loadIndex(index, { automatic: true });
        else { musicAudioEngine.pause(); set({ isPlaying: false }); }
      })();
      return;
    }
    // Shuffle has already rearranged the queue, so the next track is always
    // the following entry, and a shuffled queue ends like any other.
    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else if (selectRadioOn(get())) {
        void (async () => {
          await get()._ensureRadio();
          const s = get();
          if (s.currentIndex + 1 < s.queue.length) {
            void s._loadIndex(s.currentIndex + 1, { automatic: true });
          } else {
            musicAudioEngine.pause();
            set({ isPlaying: false });
          }
        })();
        return;
      } else {
        musicAudioEngine.pause();
        set({ isPlaying: false });
        return;
      }
    }
    void get()._loadIndex(nextIndex, { automatic: true });
  },

  previous: () => {
    const remote = remoteControl();
    if (remote) return remote.command("previous");
    const { queue, currentIndex, progress, repeatMode } = get();
    if (queue.length === 0) return;
    if (progress > 3) {
      get().seek(0);
      return;
    }
    if (currentIndex === 0 && repeatMode !== "all" && dispatchMixedMediaPrevious("music")) return;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = repeatMode === "all" ? queue.length - 1 : 0;
    void get()._loadIndex(prevIndex, { manual: true });
  },

  seek: (seconds) => {
    suppressAutomaticFadeUntil = Date.now() + 2000;
    if (get().loadingStreamId && get().currentTrack && get().loadingStreamId !== videoIdOf(get().currentTrack!)) set({ loadingStreamId: null, isBuffering: false });
    const remote = remoteControl();
    if (remote) return remote.command("seek", { pos: Math.round(seconds * 1000) });
    musicAudioEngine.seek(seconds);
    set({ progress: Math.max(0, seconds) });
  },

  setVolume: (volume) => {
    const remote = remoteControl();
    if (remote) return remote.command("volume", { vol: Math.round(clamp01(volume) * 100) });
    const vol = clamp01(volume);
    musicAudioEngine.setVolume(vol);
    const isMuted = vol === 0 ? get().isMuted : false;
    if (get().isMuted && !isMuted) musicAudioEngine.setMuted(false);
    set({ volume: vol, isMuted });
    saveConfig(get);
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    musicAudioEngine.setMuted(isMuted);
    set({ isMuted });
    saveConfig(get);
  },

  cycleRepeat: () => {
    const order: MusicRepeatMode[] = ["none", "all", "one"];
    const repeatMode = order[(order.indexOf(get().repeatMode) + 1) % order.length];
    set({ repeatMode });
    saveConfig(get);
  },

  // Shuffle rearranges the queue itself, as Android does, so Next, Previous,
  // Up next and the preload all follow the list; turning it off puts the
  // original order back.
  toggleShuffle: () => {
    const s = get();
    undoSnapshot = null;
    if (s.isShuffle) {
      const restored = s.unshuffledQueue
        ? restoreOriginalOrder(s.unshuffledQueue, s.queue, s.queue[s.currentIndex] ?? null)
        : { queue: s.queue, currentIndex: s.currentIndex };
      set({ isShuffle: false, unshuffledQueue: null, ...restored });
    } else {
      set({ isShuffle: true, unshuffledQueue: s.queue, queue: shuffleUpcoming(s.queue, s.currentIndex) });
    }
    saveConfig(get);
  },

  toggleRadio: () => {
    const radioEnabled = !selectRadioOn(get());
    set({ radioEnabled, radioStationActive: false });
    saveConfig(get);
    if (radioEnabled) void get()._ensureRadio();
  },

  startRadio: async (seed) => {
    const base = seed ?? get().currentTrack;
    if (!base) return;
    transportGeneration++;
    resetRadioSession([videoIdOf(base)]);
    set({
      ...freshQueue([base], get().isShuffle ? [base] : null),
      station: trackStation(base),
      playedIds: get().playedIds.filter((id) => id !== videoIdOf(base)),
      currentIndex: 0,
      radioStationActive: true,
      queueSource: null,
    });
    await get()._loadIndex(0);
  },

  resumeStation: async (station, discovery) => {
    if (!await setSettingValue(SETTINGS.RADIO_DISCOVERY_LEVEL, discovery)) return false;
    radioGeneration++; radioInFlight = null;
    const fresh = { ...station, discovery, continuation: null, playlistId: null, genreContinuation: null, genreTurn: true };
    try {
      let songs: SongItem[] = [];
      let next: MusicStation = fresh;
      if (fresh.type === "artist" && fresh.artist) songs = (await recallArtist(fresh.artist.id))?.topSongs ?? [];
      else { const page = await fetchStationPage(fresh, fresh.seed); songs = page.songs; next = { ...next, ...page.station }; }
      if (!songs.length) songs = await stationFallback(fresh.seed);
      if (!songs.length) return false;
      set({ queue: songs, currentIndex: 0, station: next, radioStationActive: true, radioQueuedIds: [], queueSource: fresh.title ?? fresh.artist?.title ?? null });
      await get()._loadIndex(0);
      if (get().currentTrack) await get()._ensureRadio();
      return true;
    } catch { set({ radioError: true }); radioNotice(); return false; }
  },

  startMixStation: async (mix, songs, index = 0) => {
    if (!songs.length) return;
    radioGeneration++;
    radioInFlight = null;
    const seed = songs[index] ?? songs[0]!;
    set({ queue: songs, currentIndex: index, station: { ...trackStation(seed), type: "mix", mix, title: mix.label }, radioStationActive: true, radioQueuedIds: [], queueSource: mix.label });
    await get()._loadIndex(index);
    if (get().currentTrack) await get()._ensureRadio();
  },

  startArtistRadio: async (artist) => {
    const page = await recallArtist(artist.id);
    const songs = audioMusicOnly(page?.topSongs ?? []);
    const seed = songs[0];
    if (!seed) { radioNotice(); return; }
    transportGeneration++;
    resetRadioSession([videoIdOf(seed)]);
    set({ queue: [seed], currentIndex: 0, station: { ...trackStation(seed), type: "artist", artist, catalog: songs }, playedIds: get().playedIds.filter((id) => id !== videoIdOf(seed)), radioStationActive: true, radioQueuedIds: [], queueSource: artist.title });
    await get()._loadIndex(0);
    if (get().currentTrack) await get()._ensureRadio();
  },

  startGenreRadio: async (genre) => {
    try {
      const page = await getMusicMoodGenre(genre.browseId, genre.params ?? undefined);
      const songs = audioMusicOnly(page.items.filter((item): item is SongItem & { type: "song" } => item.type === "song"));
      const seed = songs[0];
      if (!seed) { radioNotice(); return; }
      transportGeneration++;
      resetRadioSession(songs.map(videoIdOf));
      set({ queue: songs, currentIndex: 0, station: { ...trackStation(seed), type: "genre", ...genre, genreContinuation: page.continuation, genreTurn: true }, playedIds: get().playedIds.filter((id) => id !== videoIdOf(seed)), radioStationActive: true, radioQueuedIds: [], queueSource: genre.title });
      await get()._loadIndex(0);
    } catch { radioNotice(); }
  },

  // Each queued entry is its own copy, so a song played earlier can be queued
  // again and shuffle can still tell the two apart.
  addToQueue: (track) => {
    const remote = remoteControl();
    if (remote) return remote.command("queue", { queue: queueWith(remote, [videoIdOf(track)], false) });
    const replay = geniusEnabled() && sessionPlayed().includes(videoIdOf(track));
    allowReplay(videoIdOf(track));
    radioSessionSeen.delete(videoIdOf(track));
    set({ playedIds: get().playedIds.filter((id) => id !== videoIdOf(track)) });
    const { queue, currentTrack, currentIndex } = get();
    const idle = !currentTrack || currentIndex < 0;
    const lists = queueListsOf(get());
    if (!replay && isUpcoming(lists, track)) {
      if (idle && queue.length > 0) void get()._loadIndex(0);
      showQueueFeedback("duplicate");
      return;
    }
    set(appendTracks(lists, [{ ...track }]));
    showQueueFeedback("added");
    if (idle) void get()._loadIndex(0);
  },

  playNextInQueue: (track) => {
    const remote = remoteControl();
    if (remote) return remote.command("queue", { queue: queueWith(remote, [videoIdOf(track)], true) });
    allowReplay(videoIdOf(track));
    radioSessionSeen.delete(videoIdOf(track));
    set({ playedIds: get().playedIds.filter((id) => id !== videoIdOf(track)) });
    const { currentTrack } = get();
    if (!currentTrack) {
      get().addToQueue(track);
      return;
    }
    if (videoIdOf(track) === videoIdOf(currentTrack)) {
      showQueueFeedback("duplicate");
      return;
    }
    set(insertNext(queueListsOf(get()), { ...track }));
    showQueueFeedback("added");
  },

  removeFromQueue: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length || index === s.currentIndex) return;
    undoSnapshot = undoSnapshotOf(s);
    set(removeAt(queueListsOf(s), index));
  },

  reorderQueue: (from, to) => {
    const { queue, currentIndex } = get();
    if (from === to) return;
    if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    if (from <= currentIndex || to <= currentIndex) return;
    const next = [...queue];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    set({ queue: next });
  },

  // A cleared queue starts its station afresh, and the standby element's
  // preload belonged to a song that is no longer coming.
  clearQueue: () => {
    const s = get();
    const playing = s.queue[s.currentIndex];
    const snapshot = undoSnapshotOf(s);
    resetRadioSession(playing ? [videoIdOf(playing)] : []);
    musicAudioEngine.clearPreload();
    const queue = playing ? [playing] : [];
    set({
      ...freshQueue(queue, s.isShuffle ? queue : null),
      currentIndex: playing ? 0 : -1,
      queueSource: null,
    });
    undoSnapshot = snapshot;
  },

  replaceQueue: (tracks) => {
    const s = get();
    const playing = s.queue[s.currentIndex];
    if (!playing) return;
    const at = tracks.findIndex((track) => videoIdOf(track) === videoIdOf(playing));
    const queue = at >= 0 ? tracks.map((track, i) => (i === at ? playing : track)) : [playing, ...tracks];
    resetRadioSession(queue.map(videoIdOf));
    musicAudioEngine.clearPreload();
    set({ ...freshQueue(queue, s.isShuffle ? queue : null), currentIndex: Math.max(0, at), queueSource: null });
  },

  undoQueueEdit: () => {
    const snapshot = undoSnapshot;
    undoSnapshot = null;
    const s = get();
    const playing = s.queue[s.currentIndex];
    if (!snapshot || !playing) return;
    // The song playing now may be a later one than at the edit; it carries on.
    const currentIndex = snapshot.queue.indexOf(playing);
    if (currentIndex < 0) return;
    set({ ...snapshot, currentIndex });
  },

  restoreSavedQueue: (restored) => {
    const track = restored.queue[restored.currentIndex];
    if (get().currentTrack || !track) return;
    resetRadioSession(restored.queue.map(videoIdOf));
    const unshuffled = get().isShuffle ? (restored.unshuffledQueue ?? restored.queue) : null;
    awaitingFirstPlay = true;
    set({
      ...freshQueue(restored.queue, unshuffled),
      radioQueuedIds: restored.radioQueuedIds,
      radioStationActive: restored.radioStationActive,
      queueSource: restored.queueSource,
      currentTrack: track,
      currentIndex: restored.currentIndex,
      progress: restored.resumeAt,
      duration: track.duration ?? 0,
      isPlaying: false,
      isBuffering: false,
    });
  },

  setHiddenPredicate: (predicate) => {
    hiddenPredicate = predicate;
  },

  // Never yanks the track that's playing; drops the rest that are now hidden.
  pruneQueue: (shouldRemove) => {
    const lists = queueListsOf(get());
    const pruned = removeWhere(lists, shouldRemove);
    if (pruned !== lists) set(pruned);
  },

  setViewState: (viewState) => set({ viewState }),
  openOverlay: (view = "full") => set({ viewState: view }),
  closeOverlay: () => set({ viewState: "dock" }),

  setEqEnabled: (enabled) => {
    const audioProcessing = { ...get().audioProcessing, enabled };
    musicAudioEngine.setProcessingConfig(audioProcessing);
    set({ eqEnabled: enabled, audioProcessing });
    void setSettingValue(SETTINGS.MUSIC_AUDIO_PROCESSING, JSON.stringify(audioProcessing));
  },

  setEqBand: (index, gainDb) => {
    const next = [...get().eqGains];
    next[index] = gainDb;
    get().setEqGains(next);
  },

  setEqGains: (gains) => {
    const normalized = normalizeGraphicGains(gains, 10);
    const audioProcessing = { ...get().audioProcessing, mode: "graphic" as const, bandCount: 10 as const, graphicGains: { ...get().audioProcessing.graphicGains, 10: normalized } };
    musicAudioEngine.setProcessingConfig(audioProcessing);
    set({ eqGains: normalized, audioProcessing });
    void setSettingValue(SETTINGS.MUSIC_AUDIO_PROCESSING, JSON.stringify(audioProcessing));
  },

  applyEqPreset: (name) => {
    get().setEqGains([...(LEGACY_EQ_PRESETS[name] ?? LEGACY_EQ_PRESETS.flat)]);
  },

  setAudioProcessing: (config) => {
    const audioProcessing = normalizeAudioProcessingConfig(config);
    musicAudioEngine.setProcessingConfig(audioProcessing);
    const eqGains = audioProcessing.bandCount === 10 ? normalizeGraphicGains(audioProcessing.graphicGains[10], 10) : get().eqGains;
    set({ audioProcessing, eqEnabled: audioProcessing.enabled, eqGains });
    void setSettingValue(SETTINGS.MUSIC_AUDIO_PROCESSING, JSON.stringify(audioProcessing));
  },

  setNormalizationEnabled: (enabled) => {
    musicAudioEngine.setLoudness(get().loudnessDb, enabled);
    set({ normalizationEnabled: enabled });
  },

  // --- internal (element → store) --------------------------------------

  // Every store write runs every subscriber's selector, so the clock is only
  // published when the whole second changes; the full player's bar reads the
  // audio element itself for anything finer.
  _syncTime: (progress, duration) => {
    const current = get();
    // While the next song resolves, the element still plays the last one.
    if (current.loadingStreamId !== null) return;
    const seconds = Number.isFinite(progress) ? progress : 0;
    const nextDuration = Number.isFinite(duration) && duration > 0 ? duration : current.duration;
    if (current.currentTrack && current.isPlaying && !current.isBuffering) {
      recovery.notePlaying(videoIdOf(current.currentTrack), Date.now());
    }
    if (Math.floor(seconds) === Math.floor(current.progress) && nextDuration === current.duration) return;
    set({ progress: seconds, duration: nextDuration });

    // The audio-settings subscriber already starts a plain fade once the song
    // is inside its last `seconds`. This only steps in for a phrase-aligned
    // fade: when the beat-aware plan says the fade starts within the next
    // tick, and the next song is already buffered, arm it and load it.
    // A seek suppresses it briefly, so a seek landing near the end never
    // starts a fade on its own.
    const state = get();
    if (
      getSettingValue(SETTINGS.CROSSFADE_ENABLED) !== "true" ||
      Date.now() < suppressAutomaticFadeUntil ||
      !state.isPlaying ||
      state.loadingStreamId ||
      state.repeatMode === "one" ||
      nextDuration <= 0 ||
      seconds <= 0 ||
      nextDuration - seconds <= 0.2
    ) return;
    const fadeSeconds = crossfadeSeconds(getSettingValue(SETTINGS.CROSSFADE_SECONDS));
    const tempo = state.currentTrack?.transition;
    const phraseWindow = tempo?.bpm && tempo.bpm >= 40 && tempo.bpm <= 240 ? Math.min(24, 60 / tempo.bpm * (tempo.beatsPerPhrase ?? 16)) : 0;
    if (nextDuration - seconds > fadeSeconds + phraseWindow) return;
    const nextIndex = nextMusicIndex(state);
    const upcoming = nextIndex >= 0 ? state.queue[nextIndex] : null;
    if (!upcoming || shouldWatchSong(upcoming)) return;
    const plan = planCrossfade(fadeSeconds, seconds, nextDuration - seconds, tempo, upcoming.transition);
    // The fade starts at the next phrase edge; until its start is within a
    // tick, wait — the plain subscriber takes it once inside `fadeSeconds`.
    if (plan.delay > 1.5) return;
    if (!musicAudioEngine.canPlayPreloaded(videoIdOf(upcoming))) return;
    musicAudioEngine.armCrossfade(plan.seconds);
    void state._loadIndex(nextIndex, { automatic: true });
  },

  _reflectPlaying: (isPlaying) => set({ isPlaying }),

  _setBuffering: (isBuffering) => {
    stopStallWatch();
    // A paused song that was still buffering must stay paused, so no watch.
    if (isBuffering && get().loadingStreamId === null && !userPaused) {
      let lastBuffered = musicAudioEngine.getBufferedEnd();
      let quietSince = Date.now();
      stallWatch = setInterval(() => {
        const buffered = musicAudioEngine.getBufferedEnd();
        if (buffered > lastBuffered) {
          lastBuffered = buffered;
          quietSince = Date.now();
          return;
        }
        if (Date.now() - quietSince < STALL_LIMIT_MS) return;
        stopStallWatch();
        recordPlayerEvent("music stalled with no data arriving");
        get()._onPlaybackError();
      }, STALL_CHECK_MS);
    }
    if (!isBuffering && loadStartedAt) {
      const started = loadStartedAt;
      loadStartedAt = null;
      const now = performance.now();
      const elapsedMs = Math.round(now - started.at);
      // Split into finding the stream and buffering it, with whether the window was hidden.
      const resolveMs = started.resolvedAt === undefined ? null : Math.round(started.resolvedAt - started.at);
      const bufferMs = started.resolvedAt === undefined ? null : Math.round(now - started.resolvedAt);
      const hidden = started.hidden || document.hidden;
      const audioContext = musicAudioEngine.getContextState();
      recordPlayerEvent(`music first audio: ${started.videoId} after ${elapsedMs} ms (audio context ${audioContext})`);
      // One line per track in the log file, so slow starts can be measured.
      void logToBackend("info", "music first audio", {
        videoId: started.videoId,
        elapsedMs,
        resolveMs,
        bufferMs,
        hidden,
        audioContext,
      });
    }
    set({ isBuffering });
  },

  handleEnded: () => {
    const { repeatMode, queue } = get();
    // Repeat-all over one song is a replay; reloading it would fetch it again.
    if (repeatMode === "one" || (repeatMode === "all" && queue.length === 1)) {
      musicAudioEngine.seek(0);
      void musicAudioEngine.play();
      set({ progress: 0, isPlaying: true });
      return;
    }
    if (dispatchMixedMediaEnded("music")) return;
    get().next();
  },

  _onPlaybackError: () => {
    if (get().loadingStreamId !== null) return;
    const { currentTrack, currentIndex, progress } = get();
    if (!currentTrack) return;
    stopStallWatch();
    const videoId = videoIdOf(currentTrack);
    const code = musicAudioEngine.getErrorCode();
    const failure = classifyMediaFailure(code, navigator.onLine);
    recordPlayerEvent(`music playback error (media element ${code ?? "stall"}, ${failure})`);
    // The element rejected the URL it was given, so drop it rather than let any
    // later attempt be served the same dead one from cache.
    invalidateMusicStream(videoId);
    // Pick up from the same position, and only play if the user had not paused.
    const entry = get().queue[currentIndex];
    const reload = () => {
      const s = get();
      if (!entry || s.queue[s.currentIndex] !== entry) return;
      void s._loadIndex(s.currentIndex, { resumeAt: progress, autoplay: !userPaused });
    };
    const decision = recovery.decide(videoId, failure, Date.now());
    const shown = {
      isPlaying: false,
      isBuffering: false,
      streamError: `media element error ${code ?? "stall"} (${failure})`,
      streamErrorKind: MEDIA_FAILURE_KIND[failure],
    };
    if (decision === "waitForNetwork") {
      set(shown);
      waitForNetwork(reload);
      return;
    }
    if (decision === "retry") {
      recordPlayerEvent(`music playback recovery: ${videoId} at ${Math.round(progress)}s`);
      reload();
      return;
    }
    set(shown);
  },
}));

// Radio additions, queue edits and reorders all change what plays next, so warm
// its link whenever the queue does. A queue restored at launch warms nothing
// until it is played, so startup makes no network request for it.
useMusicPlayerStore.subscribe((state, previous) => {
  if (state.queue !== previous.queue && state.currentTrack && state.loadingStreamId === null && !awaitingFirstPlay) {
    state._prefetchUpcoming();
  }
});
