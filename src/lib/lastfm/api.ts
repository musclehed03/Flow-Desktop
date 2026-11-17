import { isTauriEnv } from "../api/env";
import { invokeBackend } from "../api/errors";
import { nowPlayingParams, scrobbleParams, signedForm, classifyReply, type LastfmScrobble } from "./rules";
import { lastfmCredentials } from "./settings";
import type { QueueSendOutcome } from "./queue";

export interface LastfmPostReply {
  status: number;
  body: string;
}

/**
 * Posts one signed form through the backend: the webview's CSP allows no
 * outside fetch, so Rust makes the call. The host is fixed backend-side; key
 * material travels only as this call's fields and is never stored there.
 */
export function postLastfmForm(form: Array<[string, string]>): Promise<LastfmPostReply> {
  return invokeBackend<LastfmPostReply>("lastfm_embedded_post", { form });
}

/** Sends one queued batch: sign with the owner's keys, post, classify the reply. */
export async function sendScrobbleBatch(batch: LastfmScrobble[]): Promise<QueueSendOutcome> {
  const keys = lastfmCredentials();
  if (!keys) return "signedOut";
  if (!(await isTauriEnv())) return "retry";
  let reply: LastfmPostReply;
  try {
    reply = await postLastfmForm(signedForm(scrobbleParams(batch, keys.sessionKey), keys.apiKey, keys.secret));
  } catch {
    return "retry";
  }
  return classifyReply(reply.status, reply.body).outcome;
}

/** A now-playing update never queues and never throws: playback comes first. */
export async function sendNowPlaying(entry: LastfmScrobble): Promise<void> {
  const keys = lastfmCredentials();
  if (!keys) return;
  if (!(await isTauriEnv())) return;
  try {
    await postLastfmForm(signedForm(nowPlayingParams(entry, keys.sessionKey), keys.apiKey, keys.secret));
  } catch (error) {
    console.warn("Last.fm now-playing update failed", error);
  }
}
