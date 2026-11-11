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

export interface CrossfadeQueue {
  queue: SongItem[];
  currentIndex: number;
  currentTrack: SongItem | null;
  isShuffle: boolean;
  repeatMode: QueueRepeatMode;
  isPlaying: boolean;
  loadingStreamId: string | null;
  progress: number;
  duration: number;
}

/**
 * Tracks in album order are often meant to run into each other (a live set, a concept album, a
 * continuous mix), so they keep their gapless join instead of being faded across.
 */
const playsInAlbumOrder = (s: CrossfadeQueue, next: SongItem): boolean =>
  !s.isShuffle && !!s.currentTrack?.album?.id && s.currentTrack.album.id === next.album?.id;

/**
 * The queue index to crossfade into now, or -1. Fades start `seconds` before the end, never on
 * repeat-one, never between consecutive album tracks, and never on a track too short to hold
 * two fades.
 */
export function crossfadeTarget(s: CrossfadeQueue, seconds: number): number {
  if (seconds <= 0 || !s.isPlaying || s.loadingStreamId !== null || s.repeatMode === "one") return -1;
  if (!(s.duration > seconds * 2)) return -1;
  const remaining = s.duration - s.progress;
  if (remaining > seconds || remaining <= 0.25) return -1;
  const index = upcomingIndex(s);
  const next = s.queue[index];
  if (!next || index === s.currentIndex || playsInAlbumOrder(s, next)) return -1;
  return index;
}
