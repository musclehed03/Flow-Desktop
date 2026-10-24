export type LaunchRestoreMode = "off" | "paused" | "playing";

export interface PlaybackSession<T> {
  queue: T[];
  currentIndex: number;
  position: number;
  playing?: boolean;
}

export function resolveLaunchRestoreMode(resumePlayback: boolean, restorePaused: boolean): LaunchRestoreMode {
  if (resumePlayback) return "playing";
  return restorePaused ? "paused" : "off";
}

export function serializePlaybackSession<T>(session: PlaybackSession<T>): string {
  return JSON.stringify(session);
}

export function parsePlaybackSession<T>(raw: string): PlaybackSession<T> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Partial<PlaybackSession<T>>;
    if (!Array.isArray(candidate.queue) || candidate.queue.length === 0) return null;
    const requestedIndex = typeof candidate.currentIndex === "number" && Number.isFinite(candidate.currentIndex)
      ? Math.trunc(candidate.currentIndex)
      : 0;
    const currentIndex = Math.max(0, Math.min(requestedIndex, candidate.queue.length - 1));
    const position = typeof candidate.position === "number" && Number.isFinite(candidate.position)
      ? Math.max(0, candidate.position)
      : 0;
    return { queue: candidate.queue, currentIndex, position, ...(typeof candidate.playing === "boolean" ? { playing: candidate.playing } : {}) };
  } catch {
    return null;
  }
}
