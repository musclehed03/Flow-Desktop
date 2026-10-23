import { expect, it, vi } from "vitest";

import { requestVideoSeek, VIDEO_SEEK_REQUEST_EVENT } from "./playerEvents";

it("dispatches a bounded video seek request", () => {
  const listener = vi.fn();
  window.addEventListener(VIDEO_SEEK_REQUEST_EVENT, listener);

  requestVideoSeek(-4);

  expect(listener).toHaveBeenCalledOnce();
  expect((listener.mock.calls[0]?.[0] as CustomEvent<{ time: number }>).detail).toEqual({ time: 0 });
  window.removeEventListener(VIDEO_SEEK_REQUEST_EVENT, listener);
});
