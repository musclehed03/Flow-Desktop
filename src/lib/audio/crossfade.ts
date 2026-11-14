import type { SongItem } from "../../types/music";
import { upcomingIndex, type QueueRepeatMode } from "../musicQueueOrder";

export interface TempoMetadata {
  bpm?: number;
  downbeatSeconds?: number;
  beatsPerPhrase?: number;
  musicalKey?: string;
  clash?: boolean;
}
export interface CrossfadePlan { seconds: number; delay: number; incomingStart: number; reason: 'plain' | 'phrase' | 'tail' | 'clash' }
export function crossfadeSeconds(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(12, parsed)) : 6;
}
export function shouldCrossfade(enabled: boolean, action: 'advance' | 'explicit' | 'seek', fadeEverything: boolean): boolean {
  return enabled && action !== 'seek' && (action === 'advance' || fadeEverything);
}
export function equalPowerCurves(points = 64): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const outgoing = new Float32Array(points), incoming = new Float32Array(points);
  for (let index = 0; index < points; index++) {
    const angle = index / (points - 1) * Math.PI / 2;
    outgoing[index] = Math.cos(angle); incoming[index] = Math.sin(angle);
  }
  return [outgoing, incoming];
}
function keyClash(a?: string, b?: string): boolean {
  const left = a?.match(/^(\d{1,2})([AB])$/i), right = b?.match(/^(\d{1,2})([AB])$/i);
  if (!left || !right) return false;
  const distance = Math.abs(Number(left[1]) - Number(right[1]));
  return Math.min(distance, 12 - distance) > 1 || (distance !== 0 && left[2]?.toUpperCase() !== right[2]?.toUpperCase());
}
export function planCrossfade(seconds: number, position: number, remaining: number, outgoing?: TempoMetadata, incoming?: TempoMetadata): CrossfadePlan {
  const available = Number.isFinite(remaining) && remaining > 0 ? remaining : crossfadeSeconds(seconds);
  let duration = Math.min(crossfadeSeconds(seconds), available);
  let reason: CrossfadePlan['reason'] = 'plain';
  const clash = outgoing?.clash || incoming?.clash || keyClash(outgoing?.musicalKey, incoming?.musicalKey);
  if (clash) { duration = Math.min(.35, available); reason = 'clash'; }
  else if (outgoing?.bpm && incoming?.bpm && Math.max(outgoing.bpm, incoming.bpm) / Math.min(outgoing.bpm, incoming.bpm) > 1.25) {
    duration = Math.min(12, available, Math.max(duration, 8)); reason = 'tail';
  }
  let delay = 0;
  if (outgoing?.bpm && outgoing.bpm >= 40 && outgoing.bpm <= 240) {
    const phrase = 60 / outgoing.bpm * Math.max(4, outgoing.beatsPerPhrase ?? 16);
    const offset = outgoing.downbeatSeconds ?? 0;
    const edge = Math.ceil((position + duration - offset) / phrase) * phrase + offset;
    if (edge <= position + available) { delay = Math.max(0, edge - position - duration); if (reason === 'plain') reason = 'phrase'; }
  }
  return { seconds: duration, delay, incomingStart: Math.max(0, Math.min(30, incoming?.downbeatSeconds ?? 0)), reason };
}

/** Every length settings offer, in seconds, as on Android: short blends under a second, then whole seconds. */
export const CROSSFADE_LENGTHS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MAX_SECONDS = 12;

/** With no fade asked for, a skip overlaps the two songs this long: it hides the change without sounding like a fade. */
export const SKIP_BLEND_SECONDS = 0.25;

/** After a song faded out on its own, with no next song ready to blend with, the next one comes in over this long. */
export const QUICK_FADE_IN_SECONDS = 0.4;

/** A song this close to its end has too little left to fade out. */
const MIN_FADE_THROUGH_SECONDS = 0.3;

/** A song skipped sooner than this was barely heard, so there is nothing to fade out. */
const MIN_SKIP_PLAYED_SECONDS = 1;

/** A skip fade shorter than this is not worth it; closer to the end, the song just stops. */
const MIN_SKIP_FADE_SECONDS = 2;

/** What the listener chose; `seconds` of 0 is off, including while crossfade is paused for the session. */
export interface CrossfadeSettings {
  seconds: number;
  keepAlbums: boolean;
  onAutoAdvance: boolean;
  onManualSkip: boolean;
}

export const fadesOnSkip = (settings: CrossfadeSettings): boolean => settings.seconds > 0 && settings.onManualSkip;

/** The fade length the settings resolve to: the chosen one while crossfade is on, otherwise 0. */
export function chosenFadeSeconds(enabled: boolean, chosen: number): number {
  if (!enabled || !Number.isFinite(chosen)) return 0;
  return Math.min(MAX_SECONDS, Math.max(CROSSFADE_LENGTHS[0], chosen));
}

export interface CrossfadeQueue {
  queue: SongItem[];
  currentIndex: number;
  currentTrack: SongItem | null;
  repeatMode: QueueRepeatMode;
  isPlaying: boolean;
  loadingStreamId: string | null;
  duration: number;
}

/** Tracks of one album are often meant to run into each other (a live set, a concept album, a continuous mix). */
function sameAlbum(current: SongItem | null, next: SongItem): boolean {
  const album = current?.album;
  if (!album || !next.album) return false;
  return (!!album.id && album.id === next.album.id) || (!!album.name.trim() && album.name === next.album.name);
}

/** Whether the song after this one is the same song: Repeat one, or Repeat all over a queue of one. */
export const repeatsItself = (s: Pick<CrossfadeQueue, "repeatMode" | "queue">): boolean =>
  s.repeatMode === "one" || (s.repeatMode === "all" && s.queue.length === 1);

export interface CrossfadeStart {
  /** The queue index to fade into: the song itself on Repeat one. */
  index: number;
  /** The fade's length on the clock, shortened to what is left of the song after a late seek. */
  seconds: number;
}

/**
 * Whether the song should start fading into the next one now, `position` seconds in at `speed`.
 * A fade lasts the chosen length on the clock at any speed. Nothing fades while the sleep timer
 * stops at the end of this song, between tracks of one album when they keep their gapless join,
 * or in a song too short to hold the fade.
 */
export function crossfadeStart(
  s: CrossfadeQueue,
  settings: CrossfadeSettings,
  position: number,
  speed: number,
  pausesAtEndOfSong: boolean,
): CrossfadeStart | null {
  if (settings.seconds <= 0 || !settings.onAutoAdvance || !s.isPlaying || s.loadingStreamId !== null) return null;
  if (pausesAtEndOfSong || !(s.duration > 0)) return null;
  const repeatsOne = repeatsItself(s);
  const index = repeatsOne ? s.currentIndex : upcomingIndex(s);
  const next = s.queue[index];
  if (!next) return null;
  if (!repeatsOne && settings.keepAlbums && sameAlbum(s.currentTrack, next)) return null;
  const rate = Math.max(0.1, speed);
  const fadeMedia = settings.seconds * rate;
  if (s.duration < fadeMedia + MIN_FADE_THROUGH_SECONDS * rate) return null;
  const left = s.duration - position;
  if (left > fadeMedia || left <= 0) return null;
  return { index, seconds: Math.min(settings.seconds, left / rate) };
}

/**
 * How long the song the listener skips away from fades under the next one, or 0 for a cut: the
 * chosen fade when skips fade, otherwise a short blend. Nothing fades from a song skipped in its
 * first second, or one too near its end to be heard fading.
 */
export function skipFadeSeconds(settings: CrossfadeSettings, position: number, duration: number, speed: number): number {
  if (!(duration > 0) || position < MIN_SKIP_PLAYED_SECONDS || position + MIN_SKIP_FADE_SECONDS > duration) return 0;
  const left = (duration - position) / Math.max(0.1, speed);
  return Math.min(fadesOnSkip(settings) ? settings.seconds : SKIP_BLEND_SECONDS, left);
}
