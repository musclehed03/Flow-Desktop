import { useCallback, useEffect, useMemo, useState } from "react";

import { useLikesStore, type LikedMusicItem } from "../../store/useLikesStore";
import type { WatchHistoryRecord } from "../../types/db";
import { getMusicHistory } from "../api/db";
import { getRecapSummary, type MusicRecap } from "../api/recap";
import { ALL_TIME } from "../recap/recapFormat";
import { flushRecapQueue } from "../recap/recapQueue";
import { forgottenFavorites, lastPlayedById, type ForgottenFavorite } from "./localStats";

/** Music history rows scanned for last plays; the newest rows come first. */
const HISTORY_SCAN = 5000;

export interface LocalStatsState {
  loading: boolean;
  error: boolean;
  music: MusicRecap | null;
  forgotten: ForgottenFavorite[];
  retry: () => void;
}

/**
 * The stats page's data, all from this device: the ledger's all-time music fold,
 * the music rows of the shared history, and the liked songs. Nothing here touches
 * the network; artwork stays out so even portraits never load.
 */
export function useLocalStats(): LocalStatsState {
  const [music, setMusic] = useState<MusicRecap | null>(null);
  const [history, setHistory] = useState<WatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const likesLoaded = useLikesStore((state) => state.loaded);
  const likeItems = useLikesStore((state) => state.items);

  useEffect(() => {
    void useLikesStore.getState().load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    // What was just heard should be in the stats that open now.
    void flushRecapQueue()
      .then(() => Promise.all([getRecapSummary(ALL_TIME, "MUSIC"), getMusicHistory(HISTORY_SCAN, 0)]))
      .then(([fold, rows]) => {
        if (cancelled) return;
        setMusic(fold.music);
        setHistory(rows);
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        console.warn("Failed to load music stats", reason);
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const forgotten = useMemo(() => {
    const songs = likeItems.filter((item): item is LikedMusicItem => item.kind === "music");
    return forgottenFavorites(songs, lastPlayedById(history), Date.now());
  }, [likeItems, history]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { loading: loading || !likesLoaded, error, music, forgotten, retry };
}
