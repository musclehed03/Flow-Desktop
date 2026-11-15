import { useCallback, useRef } from "react";

import { newWheelGesture, wheelStep, wheelVolumeChange } from "./wheelVolume";

export interface UseWheelVolumeOptions {
  /** From 0 to `max`, which is 1 unless the volume can go past 100%. */
  volume: number;
  max?: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onUnmute?: () => void;
  onFeedback?: (volume: number, muted: boolean) => void;
}

/**
 * Ref for a volume control that the wheel should adjust. The listener is native because only a
 * non-passive one can stop the page or the Shorts feed scrolling too. React's `onWheel` can't.
 *
 * The callback tracks the node it attached to, so it stays correct even when the caller
 * composes it inside another ref callback and drops the returned cleanup (the dock, the
 * overlay and the volume popover all do): React calls the old inline callback with null and
 * the new one with the node on every re-render, and a dropped cleanup used to leave every
 * earlier listener attached — one more volume step per wheel notch after each render, and
 * the always-mounted volume button's listeners never died at all. Now a null call detaches,
 * and re-attaching to the same node is a no-op instead of a second listener.
 */
export function useWheelVolume<T extends HTMLElement = HTMLDivElement>(options: UseWheelVolumeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const attached = useRef<{ node: T; onWheel: (event: WheelEvent) => void } | null>(null);

  const detach = () => {
    if (!attached.current) return;
    attached.current.node.removeEventListener("wheel", attached.current.onWheel);
    attached.current = null;
  };

  return useCallback((node: T | null) => {
    if (!node) {
      detach();
      return;
    }
    if (attached.current?.node === node) return () => detach();
    detach();
    const gesture = newWheelGesture();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const step = wheelStep(gesture, event.deltaY, event.deltaMode, event.timeStamp);
      if (step === 0) return;
      const { volume, muted, max, onVolumeChange, onUnmute } = latest.current;
      const change = wheelVolumeChange(volume, muted, step, max);
      if (change.unmute) onUnmute?.();
      if (change.volume !== undefined) onVolumeChange(change.volume);
      latest.current.onFeedback?.(change.volume ?? volume, change.unmute ? false : muted);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    attached.current = { node, onWheel };
    return () => detach();
  }, []);
}
