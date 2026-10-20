import { useEffect, useRef } from "react";
import { getSettingValue } from "../store/useAppSettingsStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { SETTINGS } from "./settings/schema";
import type { VideoSummary } from "../types/video";

/** Route-driven starts must not undo an advance while its route replacement is pending. */
export function useWatchQueue(
  videoId: string | undefined,
  offlineVideo: VideoSummary | null,
  retryNonce: number,
  resetError: () => void,
) {
  const currentVideo = usePlayerStore((s) => s.currentVideo);
  const previousRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    const routeChanged = previousRoute.current !== videoId;
    previousRoute.current = videoId;
    if (!videoId || currentVideo?.id === videoId) return;
    const store = usePlayerStore.getState();
    if (getSettingValue(SETTINGS.KEEP_WATCHING_VIEW_ENABLED) !== "false"
      && !routeChanged && currentVideo && store.queue.some((item) => item.id === currentVideo.id)) return;

    const queuedIndex = store.queue.findIndex((item) => item.id === videoId);
    if (queuedIndex >= 0) {
      store.playQueueItem(queuedIndex);
      return;
    }
    // Cold opens resolve immediately from an ID; optional metadata arrives later.
    resetError();
    store.setQueue([offlineVideo ?? { id: videoId, title: "", channelName: "" }], 0);
  }, [videoId, currentVideo, retryNonce, offlineVideo, resetError]);
}
