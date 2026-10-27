import { useEffect } from "react";

import { getString } from "../../lib/i18n/index";
import { refreshSubscriptionsOnStartup, runScheduledBackup } from "../../lib/maintenance";
import { useUiStore } from "../../store/useUiStore";

/** Runs opt-in, low-priority launch maintenance after playback restoration settles. */
export function MaintenanceController() {
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await runScheduledBackup();
        if (!cancelled && result === "written") useUiStore.getState().showToast({ variant: "success", message: getString("scheduled_backup_complete") });
      } catch (error) {
        console.warn("Scheduled backup failed", error);
        if (!cancelled) useUiStore.getState().showToast({ variant: "error", message: getString("scheduled_backup_failed") });
      }
      try { await refreshSubscriptionsOnStartup(); } catch (error) { console.warn("Subscription refresh failed", error); }
    }, 6000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  return null;
}
