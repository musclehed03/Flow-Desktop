import { getString } from "./i18n/index";
import { useUiStore } from "../store/useUiStore";

export type QueueFeedbackResult = "added" | "duplicate";

export function showQueueFeedback(result: QueueFeedbackResult): QueueFeedbackResult {
  useUiStore.getState().showToast({
    variant: result === "added" ? "success" : "info",
    message: getString(result === "added" ? "queue_added_toast" : "queue_duplicate_toast"),
  });
  return result;
}
