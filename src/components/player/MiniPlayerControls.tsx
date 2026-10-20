import { useTranslation } from "react-i18next";
import React, { useEffect, useRef } from "react";
import { FastForward, Pause, Play, Rewind, SkipBack, SkipForward } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { PROGRESS_EVENTS, setStyleIfChanged, shouldAnimateProgress } from "../../lib/playerProgress";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface MiniPlayerControlsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  duration: number;
  seekIntervalSeconds: number;
  shouldShowControls: boolean;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  showSkipControls: boolean;
  showNextPrevControls: boolean;
}

export const MiniPlayerControls: React.FC<MiniPlayerControlsProps> = ({
  containerRef,
  isPlaying,
  duration,
  seekIntervalSeconds,
  shouldShowControls,
  togglePlay,
  seekTo,
  showSkipControls,
  showNextPrevControls,
}) => {
  const { t: sensoryText } = useTranslation("settings");
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);

  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);

  // The mini bar is always on screen, so only a paused video skips the loop.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let video = container.querySelector("video");
    const update = () => {
      if (!video?.isConnected) video = container.querySelector("video");
      if (!video) return;
      trackRef.current?.setAttribute("aria-valuenow", String(Math.round(video.currentTime)));
      const dur = video.duration || duration || 0;
      const pct = dur > 0 ? clamp((video.currentTime / dur) * 100, 0, 100) : 0;
      setStyleIfChanged(fillRef.current, "width", `${pct}%`);
    };

    update();
    const source = video;
    for (const event of PROGRESS_EVENTS) source?.addEventListener(event, update);
    let raf: number | null = null;
    if (shouldAnimateProgress(isPlaying, true, false)) {
      const tick = () => {
        update();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      for (const event of PROGRESS_EVENTS) source?.removeEventListener(event, update);
    };
  }, [containerRef, duration, isPlaying]);

  const seekFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * duration);
  };

  const skip = (delta: number) => {
    const video = containerRef.current?.querySelector("video");
    const base = video ? video.currentTime : 0;
    seekTo(base + delta);
  };

  const sideBtn =
    "grid h-8 w-8 place-items-center rounded-full text-chrome-white/90 transition-colors hover:bg-chrome-white/15";

  return (
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-gradient-to-t from-chrome-black/80 via-chrome-black/30 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200",
        shouldShowControls ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="pointer-events-auto" onClick={(event) => event.stopPropagation()}>
        {/* Progress bar */}
        <div
          ref={trackRef} role="slider" tabIndex={0} aria-label={sensoryText('sensory.player.seek')}
          aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={0}
          onKeyDown={(event) => {
            const current = usePlayerStore.getState().currentTime;
            if (event.key === 'ArrowRight') seekTo(Math.min(duration, current + 10));
            else if (event.key === 'ArrowLeft') seekTo(Math.max(0, current - 10));
            else if (event.key === 'Home') seekTo(0);
            else if (event.key === 'End') seekTo(duration);
            else return;
            event.preventDefault(); event.stopPropagation();
          }}
          className="group/mpbar relative flex h-4 cursor-pointer items-center"
          onPointerDown={(event) => {
            scrubbingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (scrubbingRef.current) seekFromClientX(event.clientX);
          }}
          onPointerUp={(event) => {
            scrubbingRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-chrome-white/25 transition-[height] duration-150 group-hover/mpbar:h-1.5">
            <div
              ref={fillRef}
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: "0%" }}
            />
          </div>
        </div>

        {/* Transport row */}
        <div className="mt-0.5 flex items-center justify-center gap-2">
          {showNextPrevControls && (
            <button type="button" title={sensoryText("sensory.player.previous")} aria-label={sensoryText("sensory.player.previous")} onClick={playPrevious} className={sideBtn}>
              <SkipBack size={16} fill="currentColor" />
            </button>
          )}
          {showSkipControls && (
            <button
              type="button"
              title={`Back ${seekIntervalSeconds}s`}
              onClick={() => skip(-seekIntervalSeconds)}
              className={sideBtn}
            >
              <Rewind size={17} />
            </button>
          )}
          <button
            type="button"
            title={sensoryText(isPlaying ? "sensory.player.pause" : "sensory.player.play")} aria-label={sensoryText(isPlaying ? "sensory.player.pause" : "sensory.player.play")} aria-pressed={isPlaying}
            onClick={togglePlay}
            className="grid h-11 w-11 place-items-center rounded-full bg-chrome-white/10 text-chrome-white transition-transform hover:bg-chrome-white/20 active:scale-95"
          >
            {isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          {showSkipControls && (
            <button
              type="button"
              title={`Forward ${seekIntervalSeconds}s`}
              onClick={() => skip(seekIntervalSeconds)}
              className={sideBtn}
            >
              <FastForward size={17} />
            </button>
          )}
          {showNextPrevControls && (
            <button type="button" title={sensoryText("sensory.player.next")} aria-label={sensoryText("sensory.player.next")} onClick={() => playNext()} className={sideBtn}>
              <SkipForward size={16} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiniPlayerControls;
