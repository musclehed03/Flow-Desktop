import { useEffect } from "react";
import { useMusicPlayerStore } from "../store/useMusicPlayerStore";
import { isInteractiveMediaTarget, musicOwnsKeyboard } from "./mediaKeyboard";
import { setMusicFullscreen, toggleMusicFullscreen, toggleMusicMiniPlayer } from "./musicPresentation";

export function useMusicKeyboardShortcuts() {
  const current = useMusicPlayerStore((s) => s.currentTrack);
  const presentation = useMusicPlayerStore((s) => s.musicFullscreen);
  useEffect(() => {
    if (!current && presentation) void setMusicFullscreen(false);
  }, [current, presentation]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isInteractiveMediaTarget(event.target) || !musicOwnsKeyboard(event.target)) return;
      const state = useMusicPlayerStore.getState();
      if (!state.currentTrack) return;
      switch (event.key.toLowerCase()) {
        case ' ': case 'k': state.togglePlay(); break;
        case 'j': case 'arrowleft': state.seek(Math.max(0, state.progress - 10)); break;
        case 'l': case 'arrowright': state.seek(Math.min(state.duration, state.progress + 10)); break;
        case 'arrowup': state.setVolume(state.volume + 0.05); break;
        case 'arrowdown': state.setVolume(state.volume - 0.05); break;
        case 'm': state.toggleMute(); break;
        case 'n': state.next(); break;
        case 'p': state.previous(); break;
        case 'f': void toggleMusicFullscreen(); break;
        case 'i': toggleMusicMiniPlayer(); break;
        case 'escape': if (state.musicFullscreen) void setMusicFullscreen(false); else return; break;
        default: return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
