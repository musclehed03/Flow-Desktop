import { getString } from "../../lib/i18n/index";
import { Maximize2, PictureInPicture2 } from "lucide-react";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { toggleMusicFullscreen, toggleMusicMiniPlayer } from "../../lib/musicPresentation";

export function MusicPresentationControls() {
  const fullscreen = useMusicPlayerStore((s) => s.musicFullscreen);
  const dock = useMusicPlayerStore((s) => s.viewState === 'dock');
  return <div className="flex gap-1">
    <button type="button" aria-label={getString('sensory_musicFullscreen')} aria-pressed={fullscreen} onClick={() => void toggleMusicFullscreen()} className="rounded-full p-2 text-on-surface"><Maximize2 size={18} /></button>
    <button type="button" aria-label={getString('sensory_musicMini')} aria-pressed={dock} onClick={toggleMusicMiniPlayer} className="rounded-full p-2 text-on-surface"><PictureInPicture2 size={18} /></button>
  </div>;
}
