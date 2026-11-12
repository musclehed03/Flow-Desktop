type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

export const webAudioSupported = (): boolean => audioContextCtor() !== null;

export function createAudioContext(options?: AudioContextOptions): AudioContext | null {
  const Ctor = audioContextCtor();
  return Ctor ? new Ctor(options) : null;
}

/**
 * How long a start waits for a suspended context. WebView2 can leave `resume()` pending forever
 * without a user gesture, so playback must never wait on it unbounded.
 */
const RESUME_TIMEOUT_MS = 400;

/** Resumes `ctx`, giving up after a short wait; the element starts either way. */
export async function resumeWithin(ctx: AudioContext, timeoutMs = RESUME_TIMEOUT_MS): Promise<void> {
  if (ctx.state === "running" || ctx.state === "closed") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ctx.resume(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // A rejected resume leaves the context as it was; the next state change retries.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resumes `ctx` whenever the system suspends or interrupts it (sleep, a Bluetooth reconnect, an
 * output device change) while something should be playing. Without this the element keeps
 * advancing with no sound until the user pauses and plays again.
 */
export function keepRunning(ctx: AudioContext, shouldRun: () => boolean): () => void {
  const recover = () => {
    // WebKit reports "interrupted", which the DOM typings do not list.
    const state = ctx.state as AudioContextState | "interrupted";
    if (state !== "running" && state !== "closed" && shouldRun()) void resumeWithin(ctx);
  };
  ctx.addEventListener("statechange", recover);
  const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  devices?.addEventListener?.("devicechange", recover);
  return () => {
    ctx.removeEventListener("statechange", recover);
    devices?.removeEventListener?.("devicechange", recover);
  };
}

/**
 * Suspends `ctx` after `delayMs` of idleness, so a context that is only needed while something
 * plays stops holding its PipeWire stream open forever. The graph stays intact and resumes
 * instantly; callers cancel the pending suspend (via the returned function) the moment
 * playback resumes. The delay keeps a track change or a seek from churning the audio thread.
 */
export function suspendAfterIdle(
  ctx: AudioContext,
  shouldRun: () => boolean,
  delayMs = 5_000,
): () => void {
  const timer = setTimeout(() => {
    if (ctx.state === "running" && !shouldRun()) void ctx.suspend().catch(() => {});
  }, delayMs);
  return () => clearTimeout(timer);
}
