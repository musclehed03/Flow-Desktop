import { createWindowFullscreenController } from "./windowFullscreen";
import { isTauriEnv } from "./api/env";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";

const fullscreen = createWindowFullscreenController();
export async function setMusicFullscreen(active: boolean) {
  if (active) useMusicPlayerStore.getState().openOverlay('full');
  let applied = false;
  if (await isTauriEnv()) applied = await fullscreen.sync(active);
  else {
    try {
      if (active) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      applied = true;
    } catch { /* The overlay remains usable when a browser denies fullscreen. */ }
  }
  useMusicPlayerStore.setState({ musicFullscreen: active && applied });
}
export const toggleMusicFullscreen = () => setMusicFullscreen(!useMusicPlayerStore.getState().musicFullscreen);
export function toggleMusicMiniPlayer() {
  const state = useMusicPlayerStore.getState();
  if (state.musicFullscreen) void setMusicFullscreen(false);
  if (state.viewState === 'dock') state.openOverlay(); else state.closeOverlay();
}
