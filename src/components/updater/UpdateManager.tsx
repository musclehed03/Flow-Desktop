import { useEffect, useRef } from "react";
import { useUpdaterStore } from "../../store/useUpdaterStore";
import { UpdateDialog } from "./UpdateDialog";
import { checkForkRelease } from "../../lib/forkUpdateCheck";
import { openExternal } from "../../lib/openExternal";
import { getString } from "../../lib/i18n/index";
import { useUiStore } from "../../store/useUiStore";

/**
 * Delay the startup check so it never competes with first paint or the initial
 * data loads — the update prompt is low priority relative to getting the app
 * usable.
 */
const STARTUP_CHECK_DELAY_MS = 4000;

/**
 * Runs a one-shot silent update check shortly after launch (when `enabled` and
 * the user hasn't disabled auto-checks) and hosts the global update dialog.
 * Mount once at the app root.
 */
export function UpdateManager({ enabled }: { enabled: boolean }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const store = useUpdaterStore.getState();
      await store.loadPreferences();
      if (cancelled || !useUpdaterStore.getState().autoCheck) return;
      try {
        const release = await checkForkRelease();
        if (!cancelled && release) useUiStore.getState().showToast({
          title: getString("fork_update_available"),
          message: getString("fork_update_version", release.version),
          actionLabel: getString("fork_update_view"),
          onAction: () => void openExternal(release.url),
          durationMs: 12000,
        });
      } catch (error) { console.warn("Fork update check failed", error); }
    }, STARTUP_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  return <UpdateDialog />;
}
