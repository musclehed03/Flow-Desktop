import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMixedMediaQueueStore } from "../../lib/mixedMediaQueue";
import { MIXED_MEDIA_ENDED_EVENT, MIXED_MEDIA_ROUTE_EVENT, type MixedMediaDirection, type MixedMediaKind } from "../../lib/mixedMediaEvents";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { usePlayerStore } from "../../store/usePlayerStore";

export function MixedMediaQueueController() {
  const navigate = useNavigate();
  useEffect(() => {
    const route = (raw: Event) => {
      const event = raw as CustomEvent<{ kind: MixedMediaKind; id: string }>;
      navigate(event.detail.kind === "video" ? `/watch/${event.detail.id}` : "/player");
    };
    const ended = (raw: Event) => {
      const event = raw as CustomEvent<{ kind: MixedMediaKind; direction?: MixedMediaDirection }>;
      const mixed = useMixedMediaQueueStore.getState();
      if (!mixed.active || mixed.queue[mixed.currentIndex]?.kind !== event.detail.kind) return;
      if (event.detail.direction === "previous") {
        if (mixed.currentIndex <= 0) return;
        event.preventDefault();
        mixed.retreat();
        return;
      }
      const hasEngineNext = event.detail.kind === "music"
        ? useMusicPlayerStore.getState().currentIndex + 1 < useMusicPlayerStore.getState().queue.length
        : usePlayerStore.getState().currentIndex + 1 < usePlayerStore.getState().queue.length;
      if (hasEngineNext) return;
      event.preventDefault();
      mixed.advance();
    };
    const musicUnsubscribe = useMusicPlayerStore.subscribe((state, previous) => {
      const id = state.currentTrack?.videoId ?? state.currentTrack?.id;
      if (id && id !== (previous.currentTrack?.videoId ?? previous.currentTrack?.id)) useMixedMediaQueueStore.getState().syncEngineItem("music", id);
    });
    const videoUnsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.currentVideo && state.currentVideo.id !== previous.currentVideo?.id) useMixedMediaQueueStore.getState().syncEngineItem("video", state.currentVideo.id);
    });
    window.addEventListener(MIXED_MEDIA_ROUTE_EVENT, route);
    window.addEventListener(MIXED_MEDIA_ENDED_EVENT, ended);
    return () => { musicUnsubscribe(); videoUnsubscribe(); window.removeEventListener(MIXED_MEDIA_ROUTE_EVENT, route); window.removeEventListener(MIXED_MEDIA_ENDED_EVENT, ended); };
  }, [navigate]);
  return null;
}
