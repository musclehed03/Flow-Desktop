import { Maximize2, PictureInPicture2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { toggleMusicFullscreen, toggleMusicMiniPlayer } from "../../lib/musicPresentation";

export function MusicPresentationControls() {
  const { t } = useTranslation('settings');
  const fullscreen = useMusicPlayerStore((s) => s.musicFullscreen);
  const dock = useMusicPlayerStore((s) => s.viewState === 'dock');
  return <div className="flex gap-1">
    <button type="button" aria-label={t('sensory.musicFullscreen')} aria-pressed={fullscreen} onClick={() => void toggleMusicFullscreen()} className="rounded-full p-2 text-on-surface"><Maximize2 size={18} /></button>
    <button type="button" aria-label={t('sensory.musicMini')} aria-pressed={dock} onClick={toggleMusicMiniPlayer} className="rounded-full p-2 text-on-surface"><PictureInPicture2 size={18} /></button>
  </div>;
}
