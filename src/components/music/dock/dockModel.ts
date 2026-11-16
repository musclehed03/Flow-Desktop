import type { CSSProperties, Ref, RefObject } from "react";

import type { ControlledDevice } from "../../../lib/live/usePlayOn";
import type { MiniBarButton, MiniPlayerLook } from "../../../lib/music/miniPlayerLook";
import type { SongItem } from "../../../types/music";
import type { MusicMenuAction, useMusicContextMenu } from "../MusicCardMenu";

/** What the mini player shows and the state its buttons read, shared by the Pill and Classic bodies. */
export interface DockModel {
  shown: { thumbnail: string | null | undefined; title: string; by: string };
  track: SongItem | null;
  /** The device this one controls, when the dock shows its music. */
  away: ControlledDevice | null;
  playing: boolean;
  busy: boolean;
  muted: boolean;
  eqActive: boolean;
  popover: null | "eq" | "vol";
  setPopover: (update: (current: null | "eq" | "vol") => null | "eq" | "vol") => void;
  accentActive: CSSProperties;
  volumeRef: Ref<HTMLButtonElement>;
  /** Where the volume popover returns focus; the trigger lives in the dock body. */
  volumeTriggerRef: RefObject<HTMLElement | null>;
  /** Where the EQ popover returns focus; the trigger lives in the dock body. */
  eqTriggerRef: RefObject<HTMLElement | null>;
  menu: ReturnType<typeof useMusicContextMenu>;
  menuActions: MusicMenuAction[];
  buttons: MiniBarButton[];
  look: MiniPlayerLook;
}
