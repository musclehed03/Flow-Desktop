export type MixedMediaKind = "music" | "video";
export type MixedMediaDirection = "next" | "previous";
export const MIXED_MEDIA_ENDED_EVENT = "flow:mixed-media-ended";
export const MIXED_MEDIA_ROUTE_EVENT = "flow:mixed-media-route";

export function dispatchMixedMediaEnded(kind: MixedMediaKind): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent(MIXED_MEDIA_ENDED_EVENT, { cancelable: true, detail: { kind } });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function dispatchMixedMediaPrevious(kind: MixedMediaKind): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent(MIXED_MEDIA_ENDED_EVENT, {
    cancelable: true,
    detail: { kind, direction: "previous" satisfies MixedMediaDirection },
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
