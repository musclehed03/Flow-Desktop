import type { SongItem } from "../types/music";

export type QueueRepeatMode = "none" | "one" | "all";

export interface QueuePosition {
  queue: SongItem[];
  currentIndex: number;
  isShuffle: boolean;
  repeatMode: QueueRepeatMode;
  playedIds?: readonly string[];
}

const pickRandomIndex = (length: number, exclude: number): number => {
  if (length <= 1) return 0;
  let next = exclude;
  while (next === exclude) next = Math.floor(Math.random() * length);
  return next;
};

// Shuffle's next pick, made once per track so the track warmed ahead of time is
// the one that actually plays.
let shuffleNext: { from: number; to: number } | null = null;

/**
 * The queue index that plays after the current one, or -1 when none does.
 * Repeat-one replays what is already loaded, so it has no next track.
 */
export function upcomingIndex({ queue, currentIndex, isShuffle, repeatMode, playedIds }: QueuePosition): number {
  if (queue.length === 0 || currentIndex < 0 || repeatMode === "one") return -1;
  if (isShuffle && queue.length > 1) {
    const candidates = playedIds && repeatMode !== "all"
      ? queue.map((song, index) => ({ song, index })).filter(({ song, index }) => index !== currentIndex && !playedIds.includes(song.videoId ?? song.id)).map(({ index }) => index)
      : null;
    if (candidates && candidates.length === 0) return -1;
    if (candidates && (!shuffleNext || shuffleNext.from !== currentIndex || !candidates.includes(shuffleNext.to))) {
      shuffleNext = { from: currentIndex, to: candidates[Math.floor(Math.random() * candidates.length)]! };
    }
    if (!shuffleNext || shuffleNext.from !== currentIndex || shuffleNext.to >= queue.length) {
      shuffleNext = { from: currentIndex, to: pickRandomIndex(queue.length, currentIndex) };
    }
    return shuffleNext.to;
  }
  let nextIndex = currentIndex + 1;
  if (playedIds && repeatMode !== "all") {
    while (nextIndex < queue.length && playedIds.includes(queue[nextIndex]!.videoId ?? queue[nextIndex]!.id)) nextIndex++;
  }
  if (nextIndex < queue.length) return nextIndex;
  return repeatMode === "all" ? 0 : -1;
}

/** Forget shuffle's pending pick, for when the queue is torn down. */
export function resetQueueOrder(): void {
  shuffleNext = null;
}
