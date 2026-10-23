import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";

import { useDismissOnOutsideInteraction } from "../../lib/useDismissOnOutsideInteraction";
import { Slider } from "../ui/Slider";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

interface TransportLabels {
  previous: string;
  play: string;
  pause: string;
  next: string;
}

export function PlayerTransportControls({
  isPlaying,
  onPrevious,
  onTogglePlay,
  onNext,
  labels,
  className,
  buttonClassName,
  playButtonClassName,
}: {
  isPlaying: boolean;
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  labels: TransportLabels;
  className?: string;
  buttonClassName?: string;
  playButtonClassName?: string;
}) {
  const sideButton = cx(
    "grid h-8 w-8 place-items-center rounded-full text-current transition-colors hover:bg-chrome-white/15",
    buttonClassName,
  );
  return (
    <div className={cx("flex items-center justify-center gap-2", className)}>
      <button type="button" data-player-control="previous" title={labels.previous} aria-label={labels.previous} onClick={onPrevious} className={sideButton}>
        <SkipBack size={16} fill="currentColor" />
      </button>
      <button
        type="button"
        data-player-control="play-pause"
        title={isPlaying ? labels.pause : labels.play}
        aria-label={isPlaying ? labels.pause : labels.play}
        aria-pressed={isPlaying}
        onClick={onTogglePlay}
        className={cx(
          "grid h-10 w-10 place-items-center rounded-full bg-chrome-white/10 text-current transition-transform hover:bg-chrome-white/20 active:scale-95",
          playButtonClassName,
        )}
      >
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      <button type="button" data-player-control="next" title={labels.next} aria-label={labels.next} onClick={onNext} className={sideButton}>
        <SkipForward size={16} fill="currentColor" />
      </button>
    </div>
  );
}

interface VolumeLabels {
  mute: string;
  unmute: string;
  volume: string;
}

export function PlayerVolumeControl({
  volume,
  muted,
  onToggleMute,
  onVolumeChange,
  labels,
  className,
  buttonClassName,
}: {
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  labels: VolumeLabels;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const controlRef = useDismissOnOutsideInteraction<HTMLDivElement>({
    open,
    onDismiss: () => setOpen(false),
    restoreFocusRef: triggerRef,
  });
  const silent = muted || volume === 0;

  return (
    <div
      ref={controlRef}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => {
        if (!controlRef.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocusCapture={() => setOpen(true)}
      className={cx("flex items-center rounded-full", open && "pr-2", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        data-player-control="volume-mute"
        title={silent ? labels.unmute : labels.mute}
        aria-label={silent ? labels.unmute : labels.mute}
        aria-pressed={silent}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          onToggleMute();
        }}
        className={cx("grid h-8 w-8 place-items-center rounded-full hover:bg-chrome-white/10", buttonClassName)}
      >
        {silent ? <VolumeX size={18} /> : volume < 0.55 ? <Volume1 size={18} /> : <Volume2 size={18} />}
      </button>
      <div className={cx(
        "overflow-hidden transition-[width,opacity]",
        open ? "w-20 opacity-100" : "pointer-events-none w-0 opacity-0",
      )}>
        <Slider
          aria-label={labels.volume}
          min={0}
          max={1}
          step={0.01}
          value={silent ? 0 : volume}
          onChange={onVolumeChange}
        />
      </div>
    </div>
  );
}
