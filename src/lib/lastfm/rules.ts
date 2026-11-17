import type { SongItem } from "../../types/music";

/**
 * Feature 13.6: the embedded Last.fm scrobbler's rules. These mirror the backend
 * scrobbler's (`src-tauri/src/scrobble/rules.rs`, `audioscrobbler.rs`) so both
 * paths agree on what counts and how a call is signed; the signatures here are
 * covered by the same vectors as the backend's tests.
 */

/** A track this long or shorter never counts, however much of it played. */
export const MIN_SCROBBLE_DURATION_MS = 30_000;
/** A track counts after this much even when half of it is longer. */
export const MAX_SCROBBLE_THRESHOLD_MS = 4 * 60_000;
/** Scrobbles sent per call, the API's own batch cap. */
export const SCROBBLE_BATCH_SIZE = 50;

/** How long a track must play before it counts; null when too short to ever count. */
export function scrobbleThresholdMs(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= MIN_SCROBBLE_DURATION_MS) return null;
  return Math.min(Math.floor(durationMs / 2), MAX_SCROBBLE_THRESHOLD_MS);
}

/** Whether `playedMs` of a `durationMs` track counts as a play under Last.fm's rules. */
export function countsAsPlayed(durationMs: number, playedMs: number): boolean {
  if (!Number.isFinite(playedMs) || playedMs < 0) return false;
  const threshold = scrobbleThresholdMs(durationMs);
  return threshold !== null && playedMs >= threshold;
}

export interface LastfmScrobble {
  artist: string;
  title: string;
  album: string;
  durationSec: number;
  timestampSec: number;
}

const TOPIC_SUFFIX = " - Topic";

/** The scrobble for a track, or null when it has no artist or title to send. */
export function scrobbleEntryFor(track: SongItem, startedAtMs: number): LastfmScrobble | null {
  const first = track.artists[0]?.name ?? "";
  const artist = first.endsWith(TOPIC_SUFFIX) ? first.slice(0, -TOPIC_SUFFIX.length).trim() : first.trim();
  const title = track.title.trim();
  if (!artist || !title) return null;
  const albumRaw = (track.album?.name ?? "").trim();
  const album = albumRaw.toLowerCase() === "unknown album" ? "" : albumRaw;
  const durationSec = Math.max(0, Math.floor(track.duration ?? 0));
  return { artist, title, album, durationSec, timestampSec: Math.floor(startedAtMs / 1000) };
}

/** MD5 of a string's UTF-8 bytes, lowercase hex. Web Crypto has no MD5 and the api_sig needs it. */
export function md5hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = ((((bytes.length + 8) / 64) | 0) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, (bytes.length * 8) >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bytes.length / 0x20000000), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotate = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));
  for (let block = 0; block < paddedLength; block += 64) {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(block + i * 4, true);
    let [aa, bb, cc, dd] = [a, b, c, d];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (bb & cc) | (~bb & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * i + 5) % 16;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * i) % 16;
      }
      const shifts =
        i < 16 ? [7, 12, 17, 22] : i < 32 ? [5, 9, 14, 20] : i < 48 ? [4, 11, 16, 23] : [6, 10, 15, 21];
      const shift = shifts[i % 4]!;
      f = (f + aa + MD5_TABLE[i]! + words[g]!) | 0;
      aa = dd;
      dd = cc;
      cc = bb;
      bb = (bb + rotate(f, shift)) | 0;
    }
    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a, true);
  outView.setUint32(4, b, true);
  outView.setUint32(8, c, true);
  outView.setUint32(12, d, true);
  return [...out].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const MD5_TABLE = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));

/**
 * The documented api_sig: every parameter but format and callback, sorted and
 * joined with the secret, MD5'd.
 */
export function lastfmSignature(params: Record<string, string>, secret: string): string {
  const names = Object.keys(params)
    .filter((name) => name !== "format" && name !== "callback")
    .sort();
  return md5hex(names.map((name) => name + (params[name] ?? "")).join("") + secret);
}

type FormField = [string, string];

/** The form a call posts: parameters plus the API key, the signature and the JSON format. */
export function signedForm(
  params: Record<string, string>,
  apiKey: string,
  secret: string,
): FormField[] {
  const withKey = { ...params, api_key: apiKey };
  const sig = lastfmSignature(withKey, secret);
  const form = Object.entries(withKey).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  form.push(["api_sig", sig]);
  form.push(["format", "json"]);
  return form;
}

export function scrobbleParams(entries: LastfmScrobble[], sessionKey: string): Record<string, string> {
  const params: Record<string, string> = { method: "track.scrobble", sk: sessionKey };
  for (const [index, entry] of entries.slice(0, SCROBBLE_BATCH_SIZE).entries()) {
    params[`artist[${index}]`] = entry.artist;
    params[`track[${index}]`] = entry.title;
    params[`timestamp[${index}]`] = String(entry.timestampSec);
    if (entry.album.trim()) params[`album[${index}]`] = entry.album;
    if (entry.durationSec > 0) params[`duration[${index}]`] = String(entry.durationSec);
  }
  return params;
}

export function nowPlayingParams(entry: LastfmScrobble, sessionKey: string): Record<string, string> {
  const params: Record<string, string> = {
    method: "track.updateNowPlaying",
    artist: entry.artist,
    track: entry.title,
    sk: sessionKey,
  };
  if (entry.album.trim()) params.album = entry.album;
  if (entry.durationSec > 0) params.duration = String(entry.durationSec);
  return params;
}

export type LastfmOutcome = "sent" | "retry" | "signedOut";

export interface LastfmReply {
  outcome: LastfmOutcome;
  /** The API's error code when it named one. */
  errorCode: number | null;
}

/**
 * What a reply means for the batch. Session and key errors invalidate the
 * credentials; outages and rate limits retry; anything else drops the batch,
 * because sending it again would fail the same way.
 */
export function classifyReply(status: number, body: string): LastfmReply {
  if (status === 429) return { outcome: "retry", errorCode: 29 };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { outcome: "retry", errorCode: null };
  }
  const code = (parsed as { error?: unknown })?.error;
  if (typeof code !== "number") return { outcome: "sent", errorCode: null };
  if (code === 4 || code === 9 || code === 10 || code === 26) return { outcome: "signedOut", errorCode: code };
  if (code === 8 || code === 11 || code === 16 || code === 29) return { outcome: "retry", errorCode: code };
  return { outcome: "sent", errorCode: code };
}
