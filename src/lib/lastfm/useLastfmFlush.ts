import { useEffect } from "react";

import { sendScrobbleBatch } from "./api";
import { flushQueue, nextDueAtMs, onLastfmQueueChanged, pokeQueue } from "./queue";

/** Sends queued scrobbles on start and reconnect, and retries each batch with backoff. */
export function useLastfmFlush(): void {
  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (stopped) return;
      if (timer !== null) clearTimeout(timer);
      // Nothing waiting means no timer; the next enqueue reschedules through the listener.
      const next = nextDueAtMs();
      if (next === null) {
        timer = null;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, Math.min(Math.max(0, next - Date.now()), 2_147_483_647));
    };

    const run = async () => {
      if (stopped || running) return;
      running = true;
      try {
        await flushQueue(sendScrobbleBatch);
      } finally {
        running = false;
        schedule();
      }
    };

    const offQueue = onLastfmQueueChanged(schedule);
    const onOnline = () => {
      pokeQueue();
      void run();
    };
    window.addEventListener("online", onOnline);
    void run();
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      offQueue();
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
