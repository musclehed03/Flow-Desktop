/**
 * Frontend side of the Deviant Audio Engine attach: Tauri command client,
 * session state, and the `native` output-engine registration.
 *
 * The engine holds the device exclusively on Windows; everywhere else it
 * honestly reports unavailable and every open fails without ever opening a
 * shared stream. Nothing here claims bit-perfect: `capabilities()` reports
 * `bitPerfect: false` always, and `exclusiveMode` only while a stream is
 * actually open and exclusive. When an open or feed fails, the state keeps
 * the engine's reason so the badge can say so instead of passing as Direct.
 */
import { invokeBackend } from "../api/errors";
import type { AudioOutputEngine, OutputEngineCapabilities } from "./outputEngine";

export interface NativeAudioDevice {
  id: string;
  name: string;
}

export interface NativeAudioFormat {
  sample_rate: number;
  channels: number;
  container_bits: number;
  valid_bits: number;
  float: boolean;
}

export interface NativeAudioStreamStatus {
  active: boolean;
  exclusive: boolean;
  format: NativeAudioFormat | null;
  error: string | null;
  underrun_frames: number;
  queued_frames: number;
  pending_device_frames: number;
}

export interface NativeAudioCapabilities {
  hardware_output_available: boolean;
  supported_decoders: string[];
  stream: NativeAudioStreamStatus;
}

/** An exclusive-open attempt. A failure is data: `exclusive` false, `error` the engine's reason. */
export interface NativeAudioOpenResult {
  exclusive: boolean;
  format: NativeAudioFormat | null;
  error: string | null;
}

/** What the badge and the options UI read. */
export interface NativeAudioState {
  /** A native stream is open and holding the device exclusively. */
  engaged: boolean;
  exclusive: boolean;
  format: NativeAudioFormat | null;
  /** Why the last open or feed failed; kept until the next open succeeds. */
  error: string | null;
  /** Whether this machine can open exclusive at all (Windows + engine). */
  supported: boolean;
}

export const emptyNativeAudioState = (): NativeAudioState => ({
  engaged: false,
  exclusive: false,
  format: null,
  error: null,
  supported: false,
});

export async function fetchNativeAudioStatus(): Promise<NativeAudioCapabilities> {
  return invokeBackend<NativeAudioCapabilities>("native_audio_status");
}

export async function listNativeAudioDevices(): Promise<NativeAudioDevice[]> {
  return invokeBackend<NativeAudioDevice[]>("native_audio_devices");
}

export async function openNativeAudio(
  deviceId: string | null,
  sampleRate: number,
  channels: number,
): Promise<NativeAudioOpenResult> {
  return invokeBackend<NativeAudioOpenResult>("native_audio_open", {
    deviceId,
    sampleRate,
    channels,
  });
}

export async function feedNativeAudio(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
): Promise<NativeAudioStreamStatus> {
  return invokeBackend<NativeAudioStreamStatus>("native_audio_feed", {
    pcm,
    sampleRate,
    channels,
  });
}

export async function closeNativeAudio(): Promise<void> {
  return invokeBackend<void>("native_audio_close");
}

/** The sink `MusicAudioEngine` feeds: the native path behind a mockable seam. */
export interface NativeAudioSink {
  /** Whether this machine can open exclusive (cached probe, false until probed). */
  isAvailable(): boolean;
  open(sampleRate: number, channels: number): Promise<NativeAudioOpenResult>;
  feed(pcm: Uint8Array, sampleRate: number, channels: number): Promise<NativeAudioStreamStatus>;
  close(): Promise<void>;
}

class NativeAudioSession {
  private state: NativeAudioState = emptyNativeAudioState();
  private listeners = new Set<(state: NativeAudioState) => void>();
  private probePromise: Promise<boolean> | null = null;
  private deviceId: string | null = null;

  getState(): NativeAudioState {
    return { ...this.state };
  }

  onStateChange(listener: (state: NativeAudioState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<NativeAudioState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Probes the backend once; true when exclusive output is possible here. */
  probe(): Promise<boolean> {
    if (!this.probePromise) {
      this.probePromise = fetchNativeAudioStatus()
        .then((caps) => {
          this.setState({ supported: caps.hardware_output_available });
          return caps.hardware_output_available;
        })
        .catch(() => {
          this.setState({ supported: false });
          return false;
        });
    }
    return this.probePromise;
  }

  isSupported(): boolean {
    return this.state.supported;
  }

  /** The device to open on (`null` = the system default endpoint). */
  setDeviceId(deviceId: string | null): void {
    this.deviceId = deviceId;
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  async open(sampleRate: number, channels: number): Promise<NativeAudioOpenResult> {
    const result = await openNativeAudio(this.deviceId, sampleRate, channels);
    if (result.exclusive && result.format) {
      this.setState({ engaged: true, exclusive: true, format: result.format, error: null });
    } else {
      this.setState({
        engaged: false,
        exclusive: false,
        format: null,
        error: result.error ?? "exclusive open failed",
      });
    }
    return result;
  }

  async feed(pcm: Uint8Array, sampleRate: number, channels: number): Promise<NativeAudioStreamStatus> {
    const status = await feedNativeAudio(pcm, sampleRate, channels);
    if (!status.active || !status.exclusive) {
      this.setState({
        engaged: false,
        exclusive: false,
        error: status.error ?? "native stream ended",
      });
    }
    return status;
  }

  /** Releases exclusive control. A failure reason from the last open or feed stays until the next open succeeds. */
  async close(): Promise<void> {
    try {
      await closeNativeAudio();
    } catch {
      // Closing a dead stream is fine.
    }
    this.setState({ engaged: false, exclusive: false, format: null });
  }
}

export const nativeAudio = new NativeAudioSession();

/** Starts the one-time backend probe; call at startup so the answer is cached by first play. */
export function probeNativeAudio(): Promise<boolean> {
  return nativeAudio.probe();
}

export const nativeAudioSink: NativeAudioSink = {
  isAvailable: () => nativeAudio.isSupported(),
  open: (sampleRate, channels) => nativeAudio.open(sampleRate, channels),
  feed: (pcm, sampleRate, channels) => nativeAudio.feed(pcm, sampleRate, channels),
  close: () => nativeAudio.close(),
};

/**
 * The `native` output engine. Registered in `outputEngines` — that is the
 * attach point. `isAvailable` answers the registry's question, "what is
 * playing sound right now": true only while a native stream is open and
 * exclusive. The "can this machine do it at all" question is the probe
 * (`nativeAudio.isSupported()`), not this.
 */
export const nativeAudioOutputEngine: AudioOutputEngine = {
  id: "native",
  label: "Deviant Audio Engine",
  isAvailable: () => nativeAudio.getState().engaged,
  capabilities: (): OutputEngineCapabilities => {
    const state = nativeAudio.getState();
    return {
      exclusiveMode: state.engaged && state.exclusive,
      // Never claimed: the sources are lossy YouTube audio, and the badge
      // says so. Exclusive only means nothing else touches the stream.
      bitPerfect: false,
      path:
        state.engaged && state.format
          ? `Exclusive device · ${state.format.sample_rate} Hz · ${state.format.valid_bits}-bit`
          : state.error
            ? `Exclusive unavailable — ${state.error}`
            : "Native engine idle",
    };
  },
};
