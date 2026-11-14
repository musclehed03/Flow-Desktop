/**
 * AudioWorklet tap for the native engine: the music graph's samples pass
 * through here on their way to nowhere — the node feeds the Deviant Audio
 * Engine through the main thread instead of the OS mixer.
 *
 * Loaded with `audioWorklet.addModule(new URL('./nativeTapProcessor.ts',
 * import.meta.url))`; Vite compiles it as its own chunk. The node is fed by a
 * `MediaElementAudioSourceNode`, so it only ever sees what the element
 * decoded: silence (or nothing) while paused, the track's own samples while
 * playing. Nothing here touches gain, EQ, or the mix — the samples leave
 * exactly as decoded.
 *
 * Chunks are 8192 frames (~170 ms at 48 kHz), interleaved stereo f32,
 * transferred to the main thread without copying. The main thread batches
 * them into `native_audio_feed` invokes.
 */

export const NATIVE_TAP_PROCESSOR_NAME = "deviant-native-tap";
export const NATIVE_TAP_CHUNK_FRAMES = 8192;

/** The processor the worklet global provides; a plain stub under jsdom, so the class stays importable (and testable) there. */
const WorkletProcessorBase =
  (globalThis as { AudioWorkletProcessor?: new () => { readonly port: MessagePort } })
    .AudioWorkletProcessor ??
  class {
    readonly port: MessagePort = undefined as unknown as MessagePort;
  };

export class DeviantNativeTap extends WorkletProcessorBase {
  private pending = new Float32Array(NATIVE_TAP_CHUNK_FRAMES * 2);
  private filled = 0;

  /** The tap writes nothing: its outputs stay silent, which is the point — the zero-gain sink swallows the signal while the tap forwards the samples. */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const left = input?.[0];
    if (!left) return true;
    // Mono sources play the same samples on both channels.
    const right = input[1] ?? left;
    let offset = 0;
    while (offset < left.length) {
      const take = Math.min(NATIVE_TAP_CHUNK_FRAMES - this.filled, left.length - offset);
      for (let n = 0; n < take; n++) {
        const at = (this.filled + n) * 2;
        this.pending[at] = left[offset + n]!;
        this.pending[at + 1] = right[offset + n]!;
      }
      this.filled += take;
      offset += take;
      if (this.filled === NATIVE_TAP_CHUNK_FRAMES) this.flush();
    }
    return true;
  }

  private flush(): void {
    if (this.filled === 0) return;
    const chunk = this.pending.slice(0, this.filled * 2);
    this.filled = 0;
    this.port?.postMessage({ type: "pcm", samples: chunk }, [chunk.buffer]);
  }
}

const register = (
  globalThis as { registerProcessor?: (name: string, ctor: unknown) => void }
).registerProcessor;
if (typeof register === "function") register(NATIVE_TAP_PROCESSOR_NAME, DeviantNativeTap);
