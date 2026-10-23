export const VIDEO_SEEK_REQUEST_EVENT = "flow-player-seek";

export function requestVideoSeek(seconds: number) {
  const bounded = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  window.dispatchEvent(new CustomEvent<{ time: number }>(VIDEO_SEEK_REQUEST_EVENT, {
    detail: { time: bounded },
  }));
}
