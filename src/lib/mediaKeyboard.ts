import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { usePlayerStore } from "../store/usePlayerStore";

export function isInteractiveMediaTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"],dialog[open]');
}
export function musicOwnsKeyboard(target: EventTarget | null): boolean {
  const surface = target instanceof Element ? target.closest('[data-flow-player-surface]')?.getAttribute('data-flow-player-surface') : null;
  if (surface) return surface === 'music';
  const music = useMusicPlayerStore.getState();
  return !!music.currentTrack && (music.viewState !== 'dock' || !usePlayerStore.getState().currentVideo || !usePlayerStore.getState().isPlaying);
}
