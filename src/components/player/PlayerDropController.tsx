import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Upload, Play, X } from "lucide-react";
import { classifyPlayerDrop, listenForNativePlayerDrops } from "../../lib/playerDrop";
import { importDroppedVideo, resolveDroppedVideo } from "../../lib/playerDropActions";
import { usePlayerDropStore } from "../../store/usePlayerDropStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useUiStore } from "../../store/useUiStore";

export function PlayerDropController() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const pending = usePlayerDropStore((state) => state.pending);
  const setPending = usePlayerDropStore((state) => state.setPending);
  const showToast = useUiStore((state) => state.showToast);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenForNativePlayerDrops(setPending).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(() => {});
    const onDrop = (event: DragEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("[data-flow-player-surface]")) return;
      const text = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "";
      const files = [...(event.dataTransfer?.files ?? [])].map((file) => file.name);
      if (!text && !files.length) return;
      event.preventDefault();
      setPending(classifyPlayerDrop(text ? [text] : files));
    };
    const onDragOver = (event: DragEvent) => {
      if ((event.target as Element | null)?.closest("[data-flow-player-surface]")) event.preventDefault();
    };
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => { disposed = true; unlisten?.(); window.removeEventListener("drop", onDrop); window.removeEventListener("dragover", onDragOver); };
  }, [setPending]);

  useEffect(() => {
    if (!pending) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPending(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [pending, setPending]);

  if (!pending) return null;
  const isVideo = pending.kind === "video";
  const act = async (action: "import" | "play") => {
    if (!isVideo) return;
    try {
      const video = await resolveDroppedVideo(pending.videoId);
      if (action === "import") {
        await importDroppedVideo(video, t("playerDrop.playlistName"), t("playerDrop.playlistDescription"));
        showToast({ message: t("playerDrop.imported") });
      } else {
        usePlayerStore.getState().setQueue([video], 0);
        navigate(`/watch/${video.id}`);
      }
      setPending(null);
    } catch {
      showToast({ variant: "error", message: t("playerDrop.failed") });
    }
  };

  return <div className="fixed inset-0 z-[700] grid place-items-center bg-chrome-black/70 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="player-drop-title" className="w-full max-w-md rounded-2xl border border-outline-variant bg-background p-5 text-on-surface">
      <div className="flex items-start gap-3">
        <Upload className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="player-drop-title" className="text-lg font-semibold">{t("playerDrop.title")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{isVideo ? t("playerDrop.description") : pending.kind === "local-files" ? t("playerDrop.localUnsupported") : t("playerDrop.unsupported")}</p>
        </div>
        <button ref={closeButton} type="button" onClick={() => setPending(null)} aria-label={t("playerDrop.close")} className="rounded-full p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={18} /></button>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={!isVideo} onClick={() => void act("import")} className="rounded-full border border-outline-variant px-4 py-2 text-sm disabled:opacity-40">{t("playerDrop.import")}</button>
        <button type="button" disabled={!isVideo} onClick={() => void act("play")} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-40"><Play size={16} />{t("playerDrop.play")}</button>
      </div>
    </section>
  </div>;
}
