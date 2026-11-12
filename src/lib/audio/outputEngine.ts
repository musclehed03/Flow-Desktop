/**
 * Output-engine seam for the Deviant Audio Engine.
 *
 * The native engine (WASAPI exclusive-mode output, native decode) is being
 * built in its own repo — https://github.com/musclehed03/Deviant-Audio-Engine
 * — and attaches here later. See docs/deviant-audio-engine.md.
 *
 * This file is the reservation: every output path in the app goes through
 * this registry. Today only the web engine is registered. The native engine
 * registers itself as `native` when it lands; nothing else needs to change
 * at the seam.
 *
 * Honesty rule: `bitPerfect` is never claimed here. The web path plays
 * through the browser decoder and the OS mixer, from lossy sources, so it
 * reports exactly that. The native engine reports its own capabilities when
 * it registers — and only what it can prove.
 */
import { webAudioSupported } from './audioContext';

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
 * Registered output engines. `native` stays null until the Deviant Audio
 * Engine lands and registers itself — that is the attach point.
 */
export const outputEngines: Record<OutputEngineId, AudioOutputEngine | null> = {
  web: webAudioOutputEngine,
  native: null,
};

/** The engine actually playing sound right now. Always `web` until `native` registers. */
export function activeOutputEngine(): AudioOutputEngine {
  return outputEngines.native ?? webAudioOutputEngine;
}
