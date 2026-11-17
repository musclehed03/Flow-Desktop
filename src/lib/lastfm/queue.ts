import { profileStorage } from "../storage/profileStorage";
import { SCROBBLE_BATCH_SIZE, type LastfmScrobble } from "./rules";

/**
 * Feature 13.6: the embedded scrobbler's offline queue. Scrobbles persist to
 * this profile's local storage at enqueue time, so quitting (or crashing)
 * cannot lose one; an entry leaves only after Last.fm takes it or rejects it
 * for good. Entries carry scrobbles, never key material.
 */
export interface QueuedScrobble extends LastfmScrobble {
  /** `timestamp:artist:title`: one listen enqueues once, however often it is noted. */
  id: string;
  attempts: number;
  nextTryAtMs: number;
}

export const LASTFM_QUEUE_KEY = "lastfm_scrobble_queue_v1";
/** A long offline stretch keeps the newest, as the backend queue does. */
export const MAX_QUEUED_SCROBBLES = 2000;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 2 * 60 * 60_000;

export function retryDelayMs(failures: number): number {
  if (!Number.isFinite(failures) || failures < 1) return BASE_RETRY_MS;
  return Math.min(BASE_RETRY_MS * 2 ** Math.min(failures - 1, 8), MAX_RETRY_MS);
}

export function scrobbleId(scrobble: LastfmScrobble): string {
  return `${scrobble.timestampSec}\n${scrobble.artist}\n${scrobble.title}`;
}

function isQueuedScrobble(value: unknown): value is QueuedScrobble {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.artist === "string" &&
    typeof entry.title === "string" &&
    typeof entry.album === "string" &&
    typeof entry.durationSec === "number" &&
    typeof entry.timestampSec === "number" &&
    typeof entry.attempts === "number" &&
    typeof entry.nextTryAtMs === "number"
  );
}

/** The stored queue, oldest first; a corrupt store reads as empty, never throws. */
export function loadQueue(): QueuedScrobble[] {
  let raw: string | null = null;
  try {
    raw = profileStorage.getItem(LASTFM_QUEUE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedScrobble);
  } catch {
    return [];
  }
}

function saveQueue(entries: QueuedScrobble[]): void {
  try {
    profileStorage.setItem(LASTFM_QUEUE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Failed to save the scrobble queue", error);
  }
  notifyQueueChanged();
}

let listeners = new Set<() => void>();

/** Settings status refreshes off this; the queue itself never touches React. */
export function onLastfmQueueChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyQueueChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A status label must never break queueing.
    }
  }
}

/**
 * Queues a scrobble, returning its entry. Queueing the same listen twice
 * returns the stored entry instead of a duplicate.
 */
export function enqueueScrobble(scrobble: LastfmScrobble, nowMs: number = Date.now()): QueuedScrobble {
  const id = scrobbleId(scrobble);
  const stored = loadQueue();
  const existing = stored.find((entry) => entry.id === id);
  if (existing) return existing;
  const entry: QueuedScrobble = { ...scrobble, id, attempts: 0, nextTryAtMs: nowMs };
  const next = [...stored, entry].slice(-MAX_QUEUED_SCROBBLES);
  saveQueue(next);
  return entry;
}

/** What may send now, oldest first, excluding what is already in flight. */
export function dueScrobbles(nowMs: number = Date.now(), limit: number = SCROBBLE_BATCH_SIZE): QueuedScrobble[] {
  return loadQueue()
    .filter((entry) => entry.nextTryAtMs <= nowMs && !inFlight.has(entry.id))
    .slice(0, Math.max(0, limit));
}

export function queuedCount(): number {
  return loadQueue().length;
}

/** When the next entry comes due, or null when nothing waits. */
export function nextDueAtMs(nowMs: number = Date.now()): number | null {
  let next: number | null = null;
  for (const entry of loadQueue()) {
    if (inFlight.has(entry.id)) continue;
    if (entry.nextTryAtMs <= nowMs) return nowMs;
    if (next === null || entry.nextTryAtMs < next) next = entry.nextTryAtMs;
  }
  return next;
}

/** Everything waits no longer: a reconnect, new keys, or the owner's Send now. */
export function pokeQueue(nowMs: number = Date.now()): void {
  const stored = loadQueue();
  if (stored.some((entry) => entry.nextTryAtMs > nowMs)) {
    saveQueue(stored.map((entry) => ({ ...entry, nextTryAtMs: Math.min(entry.nextTryAtMs, nowMs) })));
  }
}

function removeEntries(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const doomed = new Set(ids);
  saveQueue(loadQueue().filter((entry) => !doomed.has(entry.id)));
}

function delayEntries(ids: readonly string[], nowMs: number): void {
  if (ids.length === 0) return;
  const delayed = new Set(ids);
  saveQueue(
    loadQueue().map((entry) => {
      if (!delayed.has(entry.id)) return entry;
      const attempts = entry.attempts + 1;
      return { ...entry, attempts, nextTryAtMs: nowMs + retryDelayMs(attempts) };
    }),
  );
}

export type QueueSendOutcome = "sent" | "retry" | "signedOut";

export interface QueueFlush {
  sent: number;
  waiting: number;
  signedOut: boolean;
}

const inFlight = new Set<string>();
let flushing: Promise<QueueFlush> | null = null;

/**
 * Sends one due batch. Entries leave only on `sent`; anything else keeps them
 * with a longer wait. Concurrent calls share the one in-flight batch, so a
 * retry can never double-send it.
 */
export function flushQueue(
  send: (batch: QueuedScrobble[]) => Promise<QueueSendOutcome>,
  nowMs: number = Date.now(),
): Promise<QueueFlush> {
  if (flushing) return flushing.then(() => flushQueue(send, nowMs));
  const batch = dueScrobbles(nowMs);
  if (batch.length === 0) return Promise.resolve({ sent: 0, waiting: queuedCount(), signedOut: false });
  for (const entry of batch) inFlight.add(entry.id);
  const ids = batch.map((entry) => entry.id);
  flushing = send(batch).then(
    (outcome) => {
      if (outcome === "sent") removeEntries(ids);
      else delayEntries(ids, nowMs);
      return { sent: outcome === "sent" ? ids.length : 0, waiting: queuedCount(), signedOut: outcome === "signedOut" };
    },
    (error) => {
      console.warn("Scrobble send failed", error);
      delayEntries(ids, nowMs);
      return { sent: 0, waiting: queuedCount(), signedOut: false };
    },
  ).finally(() => {
    for (const entry of batch) inFlight.delete(entry.id);
    flushing = null;
  });
  return flushing;
}
