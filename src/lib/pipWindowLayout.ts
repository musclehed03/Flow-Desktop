import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Restores the native pop-out to a predictable, fully visible starting box. */
export async function resetPipWindowLayout(): Promise<void> {
  const window = getCurrentWindow();
  await window.setSize(new LogicalSize(480, 270));
  await window.setPosition(new LogicalPosition(48, 48));
}
