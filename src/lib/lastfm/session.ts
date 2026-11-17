import type { SongItem } from "../../types/music";
import { getSettingValue } from "../../store/useAppSettingsStore";
import { musicArtistKey, trackKeyOf, useMusicActionsStore } from "../../store/useMusicActionsStore";
import { isDeepFlowCurrentlyActive } from "../deepFlow";
import { isLocalMediaId } from "../localMediaId";
import { SETTINGS } from "../settings/schema";
import { sendNowPlaying } from "./api";
import { enqueueScrobble } from "./queue";
import { countsAsPlayed, scrobbleEntryFor } from "./rules";
import { lastfmScrobblingOn } from "./settings";

const idOf = (track: SongItem): string => track.videoId ?? track.id;

/** A permanently blocked track or artist never scrobbles; dismissals don't gate plays. */
function isTrackBlocked(track: SongItem): boolean {
  const state = useMusicActionsStore.getState();
  if (state.blockedTracks.has(trackKeyOf(track))) return true;
  for (const artist of track.artists ?? []) {
    const key = musicArtistKey(artist);
    if (key && state.blockedArtists.has(key)) return true;
  }
  return false;
}

/** As with the ledger reporter, Deep Flow keeps listens private unless allowed. */
function deepFlowAllowsScrobble(): boolean {
  return !isDeepFlowCurrentlyActive() || getSettingValue(SETTINGS.DEEP_FLOW_SCROBBLE) === "true";
}

export interface LastfmSessionEnv {
  nowMs: () => number;
  scrobblingOn: () => boolean;
  nowPlayingOn: () => boolean;
  blocked: (track: SongItem) => boolean;
  deepFlowAllows: () => boolean;
  queue: (track: SongItem, startedAtMs: number) => void;
  announce: (track: SongItem, startedAtMs: number) => void;
}

const liveEnv = (): LastfmSessionEnv => ({
  nowMs: () => Date.now(),
  scrobblingOn: () => lastfmScrobblingOn(),
  nowPlayingOn: () => getSettingValue(SETTINGS.SCROBBLE_NOW_PLAYING) === "true",
  blocked: isTrackBlocked,
  deepFlowAllows: deepFlowAllowsScrobble,
  queue: (track, startedAtMs) => {
    const entry = scrobbleEntryFor(track, startedAtMs);
    if (entry) enqueueScrobble(entry);
  },
  announce: (track, startedAtMs) => {
    const entry = scrobbleEntryFor(track, startedAtMs);
    if (entry) void sendNowPlaying(entry);
  },
});

interface OpenListen {
  track: SongItem;
  sentSeconds: number;
  startedAtMs: number;
  scrobbled: boolean;
  announced: boolean;
}

/**
 * Turns the listen tracker's running totals — the same totals that feed the
 * shared history and the recap ledger — into scrobbles. A total that falls, or
 * another song, means a new listen began; each listen scrobbles at most once,
 * when it first counts as played under Last.fm's rules.
 */
export class LastfmSession {
  private open: OpenListen | null = null;

  constructor(private readonly env: LastfmSessionEnv = liveEnv()) {}

  note(track: SongItem, listenedSeconds: number, durationSeconds: number): void {
    // A library file stays on the device, as it does for history and the ledger.
    if (isLocalMediaId(track.videoId ?? track.id)) return;
    const current = this.open;
    if (current && (idOf(current.track) !== idOf(track) || listenedSeconds < current.sentSeconds)) {
      this.open = null;
    }
    const listen = this.open ?? this.start(track, listenedSeconds);
    this.open = listen;
    listen.sentSeconds = Math.max(listen.sentSeconds, listenedSeconds);

    if (!this.env.scrobblingOn() || !this.env.deepFlowAllows() || this.env.blocked(track)) return;

    if (!listen.announced) {
      listen.announced = true;
      if (this.env.nowPlayingOn()) this.env.announce(track, listen.startedAtMs);
    }

    if (listen.scrobbled) return;
    const durationMs = (durationSeconds > 0 ? durationSeconds : (track.duration ?? 0)) * 1000;
    if (countsAsPlayed(durationMs, listenedSeconds * 1000)) {
      listen.scrobbled = true;
      this.env.queue(track, listen.startedAtMs);
    }
  }

  private start(track: SongItem, listenedSeconds: number): OpenListen {
    return {
      track,
      sentSeconds: 0,
      startedAtMs: this.env.nowMs() - Math.max(0, listenedSeconds) * 1000,
      scrobbled: false,
      announced: false,
    };
  }
}
