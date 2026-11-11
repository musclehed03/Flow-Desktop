import type { SongItem } from "../types/music";
import type { MusicAudioQuality } from "./api/music";
import { listedSeconds } from "./audio/listedLength";
import { musicAudioEngine } from "./audio/musicAudioEngine";
import { resolveMusicStream } from "./musicStreamResolution";
import { findDownloadedRecord } from "./useDownloads";
import { recordPlayerEvent } from "./playerDiagnostics";

/**
 * How long before a track ends the next one starts buffering on the standby
 * element. A minute: resolving the link plus fetching the first audio takes
 * far longer than 30 seconds on a slow link or a loaded machine, and the fade
 * window opens only in the last few seconds — with a 30-second lead the next
 * track was too often not ready when the fade was due, so the fade never
 * armed and the track ended into silence while the next one resolved. A skip
 * wastes a little more speculative download at this lead; never-ending music
 * is worth more than that.
 */
export const PRELOAD_LEAD_SECONDS = 60;

/** One retry, this long after a failed preload resolve, while there is still time. */
export const PRELOAD_RETRY_MS = 10_000;

let preloading: string | null = null;

/**
 * Buffer `track` on the standby element so it can take over the instant the
 * current one ends. `stillUpcoming` is asked again after the network wait,
 * because the queue may have changed while the link was resolving.
 *
 * Downloaded tracks are left alone: they load from disk at once, and their
 * saved artwork and lyrics are applied by the normal load path.
 */
export async function preloadTrack(
  track: SongItem,
  quality: MusicAudioQuality,
  stillUpcoming: (videoId: string) => boolean,
  attempt = 0,
): Promise<void> {
  const videoId = track.videoId ?? track.id;
  if (preloading === videoId || musicAudioEngine.hasPreloaded(videoId)) return;
  if (findDownloadedRecord(videoId, "audio")) return;

  preloading = videoId;
  recordPlayerEvent(`music preload start: ${videoId}`);
  try {
    const info = await resolveMusicStream(videoId, quality, { preferAac: musicAudioEngine.wantsAac() });
    if (stillUpcoming(videoId)) {
      musicAudioEngine.preload(videoId, info.audioUrl, info.loudnessDb, info.mimeType, listedSeconds(info, track), {
        mimeType: info.mimeType,
        bitrate: info.bitrate,
        sampleRate: info.sampleRate ?? null,
      });
    }
  } catch {
    // A single transient failure used to doom the transition: the fade never
    // armed, the track ended, and the next one resolved from silence. Try
    // once more while there is still time; the queue may have moved on by
    // then, so stillUpcoming is asked again before the second attempt.
    if (attempt === 0) {
      recordPlayerEvent(`music preload retry: ${videoId}`);
      setTimeout(() => {
        if (stillUpcoming(videoId)) void preloadTrack(track, quality, stillUpcoming, 1);
      }, PRELOAD_RETRY_MS);
    }
  } finally {
    if (preloading === videoId) preloading = null;
  }
}
