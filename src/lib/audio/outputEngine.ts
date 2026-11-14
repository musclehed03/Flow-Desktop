/**
 * Output-engine seam for the Deviant Audio Engine.
 *
 * The native engine (WASAPI exclusive-mode output, native decode) lives in
 * its own repo — https://github.com/musclehed03/Deviant-Audio-Engine — and
 * attaches here. See docs/deviant-audio-engine.md.
 *
 * This file is the reservation: every output path in the app goes through
 * this registry. The native engine registered itself as `native` on attach
 * (2026-11-14); nothing else needs to change at the seam.
 *
 * Honesty rule: `bitPerfect` is never claimed here. The web path plays
 * through the browser decoder and the OS mixer, from lossy sources, so it
 * reports exactly that. The native engine reports its own capabilities when
 * it registers — and only what it can prove.
 */
import { webAudioSupported } from './audioContext';
import { nativeAudioOutputEngine } from './nativeAudio';

export type OutputEngineId = 'web' | 'native';

export interface OutputEngineCapabilities {
  /** Takes the output device exclusively; nothing else touches the stream. */
  exclusiveMode: boolean;
  /** True only when the engine can prove bit-perfect delivery for the track. */
  bitPerfect: boolean;
  /** The path the samples take, in plain language for the badge. */
  path: string;
}

export interface AudioOutputEngine {
  id: OutputEngineId;
  /** User-facing name, e.g. "Web audio" / "Deviant Audio Engine". */
  label: string;
  isAvailable(): boolean;
  capabilities(): OutputEngineCapabilities;
}

export const webAudioOutputEngine: AudioOutputEngine = {
  id: 'web',
  label: 'Web audio',
  isAvailable: () => webAudioSupported(),
  capabilities: () => ({
    exclusiveMode: false,
    bitPerfect: false,
    path: 'Browser decode, OS mixer in the path, lossy sources stay lossy.',
  }),
};

/**
 * Registered output engines. `native` is the Deviant Audio Engine, attached
 * 2026-11-14: it is present in the registry from the start, but it only ever
 * *plays* while a native stream is open — `activeOutputEngine` below checks
 * `isAvailable()` rather than mere registration.
 */
export const outputEngines: Record<OutputEngineId, AudioOutputEngine | null> = {
  web: webAudioOutputEngine,
  native: nativeAudioOutputEngine,
};

/** The engine actually playing sound right now. `native` only while its stream is open and exclusive; otherwise `web`. */
export function activeOutputEngine(): AudioOutputEngine {
  const native = outputEngines.native;
  return native && native.isAvailable() ? native : webAudioOutputEngine;
}
