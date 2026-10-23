export const REQUIRED_PLAYER_CONTROLS = [
  "playPause",
  "previousNext",
  "seek",
  "volumeMute",
  "queue",
  "fullscreen",
  "visualizer",
  "deviantControls",
] as const;

type RequiredPlayerControl = (typeof REQUIRED_PLAYER_CONTROLS)[number];
type SurfaceAvailability = Record<RequiredPlayerControl, string>;

export const PLAYER_CONTROL_MATRIX = {
  watch: {
    playPause: "player controls",
    previousNext: "player controls",
    seek: "timeline",
    volumeMute: "expandable volume control",
    queue: "Watch sidebar",
    fullscreen: "native fullscreen",
    visualizer: "player controls",
    deviantControls: "global quick-access control",
  },
  musicDock: {
    playPause: "dock transport",
    previousNext: "dock transport",
    seek: "dock edge scrubber",
    volumeMute: "volume popover",
    queue: "queue overlay",
    fullscreen: "expands to the full music overlay",
    visualizer: "dock action",
    deviantControls: "global quick-access control",
  },
  musicOverlay: {
    playPause: "overlay transport",
    previousNext: "overlay transport",
    seek: "large scrubber",
    volumeMute: "expandable volume control",
    queue: "queue pane",
    fullscreen: "music fullscreen action",
    visualizer: "overlay action",
    deviantControls: "global quick-access control",
  },
  videoMiniPip: {
    playPause: "compact transport",
    previousNext: "compact transport when enabled by the existing preference",
    seek: "compact timeline",
    volumeMute: "expandable compact volume control",
    queue: "queue panel in the pop-out window or Watch surface",
    fullscreen: "native fullscreen action",
    visualizer: "compact action",
    deviantControls: "compact action and global quick-access control",
  },
  visualizerStrip: {
    playPause: "shared compact transport",
    previousNext: "shared compact transport",
    seek: "compact scrubber",
    volumeMute: "expandable compact volume control",
    queue: "returns fullscreen visualizer to mini before opening the queue",
    fullscreen: "surface fullscreen action",
    visualizer: "customizer action",
    deviantControls: "strip action",
  },
} satisfies Record<string, SurfaceAvailability>;
