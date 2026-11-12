import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../../lib/settings/schema";
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
  const directActive = useMusicPlayerStore((state) => state.directActive);
  const volume = useMusicPlayerStore((state) => state.volume);
  const directMode = useAppSettingsStore((state) => state.values[SETTINGS.MUSIC_DIRECT_MODE] === "true");
  if (!format) return null;
  const details = [codec(format.mimeType), format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : null, format.sampleRate ? `${Number((format.sampleRate / 1000).toFixed(1))} kHz` : null].filter(Boolean);
  // Direct is a mode, not a quality claim: the source stays lossy, and the
  // volume slider still scales the element — both stay visible. An AAC (or
  // unknown-rate) track with the mode on falls back to Standard, and says so
  // instead of passing as Direct.
  const mode = directActive ? getString("audio_source_direct") : directMode ? getString("audio_source_standard") : null;
  const volumeNote = directActive && volume < 1 ? getString("audio_source_direct_volume", Math.round(volume * 100)) : null;
  const pill = [mode, getString("audio_source_lossy"), ...details, volumeNote].filter(Boolean).join(" · ");
  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <p className="inline-flex rounded-full border border-outline-variant px-2.5 py-1 text-xs text-on-surface-variant" aria-label={getString("audio_source_details")}>{pill}</p>
      {directMode && !directActive ? <p className="text-xs text-on-surface-variant">{getString("audio_source_direct_unavailable")}</p> : null}
    </div>
  );
}
