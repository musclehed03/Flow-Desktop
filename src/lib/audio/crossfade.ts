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
