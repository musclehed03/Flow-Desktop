import { ListMusic, MonitorPlay, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";

export default function PlayerHub() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const musicQueue = useMusicPlayerStore((state) => state.queue);
  const musicIndex = useMusicPlayerStore((state) => state.currentIndex);
  const musicPlaying = useMusicPlayerStore((state) => state.isPlaying);
  const openOverlay = useMusicPlayerStore((state) => state.openOverlay);
  const videoQueue = usePlayerStore((state) => state.queue);
  const videoIndex = usePlayerStore((state) => state.currentIndex);
  const videoPlaying = usePlayerStore((state) => state.isPlaying);
  const video = videoQueue[Math.max(0, videoIndex)] ?? null;
  const music = musicQueue[Math.max(0, musicIndex)] ?? null;
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (music && (musicPlaying || !videoPlaying)) openOverlay("full");
    else if (video) navigate(`/watch/${video.id}`, { replace: true });
  }, [music, musicPlaying, navigate, openOverlay, video, videoPlaying]);

  return <main data-flow-player-surface="hub" className="mx-auto flex min-h-[60vh] w-full max-w-4xl flex-col justify-center px-5 py-10">
    <div className="rounded-2xl border border-outline-variant bg-surface-container p-6">
      <div className="flex items-center gap-3">
        <MonitorPlay className="h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">{t("playerHub.title")}</h1>
          <p className="text-sm text-on-surface-variant">{t("playerHub.description")}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={!music} onClick={() => openOverlay("full")} className="rounded-xl border border-outline-variant p-4 text-left disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ListMusic className="mb-2 h-5 w-5" aria-hidden="true" />
          <span className="block font-medium">{t("playerHub.music")}</span>
          <span className="mt-1 block truncate text-sm text-on-surface-variant">{music?.title ?? t("playerHub.emptyQueue")}</span>
        </button>
        <button type="button" disabled={!video} onClick={() => video && navigate(`/watch/${video.id}`)} className="rounded-xl border border-outline-variant p-4 text-left disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <MonitorPlay className="mb-2 h-5 w-5" aria-hidden="true" />
          <span className="block font-medium">{t("playerHub.watch")}</span>
          <span className="mt-1 block truncate text-sm text-on-surface-variant">{video?.title ?? t("playerHub.emptyQueue")}</span>
        </button>
      </div>
      <div className="mt-6 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant px-5 text-center">
        <Upload className="mb-3 h-7 w-7 text-primary" aria-hidden="true" />
        <p className="font-medium">{t("playerHub.dropTitle")}</p>
        <p className="mt-1 max-w-lg text-sm text-on-surface-variant">{t("playerHub.dropDescription")}</p>
      </div>
    </div>
  </main>;
}
