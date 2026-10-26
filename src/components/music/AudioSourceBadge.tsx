import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { getString } from "../../lib/i18n/index";

const codec = (mimeType: string) => {
  const value = mimeType.toLowerCase();
  if (value.includes("opus")) return "Opus";
  if (value.includes("mp4a") || value.includes("aac")) return "AAC";
  if (value.includes("webm")) return "WebM audio";
  return mimeType.split(";")[0]?.replace("audio/", "").toUpperCase() || getString("audio_source_unknown");
};

export function AudioSourceBadge() {
  const format = useMusicPlayerStore((state) => state.streamFormat);
  if (!format) return null;
  const details = [codec(format.mimeType), format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : null, format.sampleRate ? `${Number((format.sampleRate / 1000).toFixed(1))} kHz` : null].filter(Boolean);
  return <p className="mt-2 inline-flex rounded-full border border-outline-variant px-2.5 py-1 text-xs text-on-surface-variant" aria-label={getString("audio_source_details")}>{getString("audio_source_lossy")} · {details.join(" · ")}</p>;
}
