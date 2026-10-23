import { describe, expect, it } from "vitest";
import {
  applyLivePreview,
  createLivePreviewHistory,
  resetLivePreview,
  undoLivePreview,
} from "./livePreviewHistory";

describe("live preview history", () => {
  it("applies immediately, undoes one edit, and resets to the opening value", () => {
    const opened = createLivePreviewHistory({ strength: 1 });
    const first = applyLivePreview(opened, { strength: 2 });
    const second = applyLivePreview(first, { strength: 3 });

    expect(second.current).toEqual({ strength: 3 });
    expect(undoLivePreview(second).current).toEqual({ strength: 2 });
    expect(resetLivePreview(second).current).toEqual({ strength: 1 });
  });

  it("does not grow history for equivalent values", () => {
    const opened = createLivePreviewHistory({ enabled: true });
    const unchanged = applyLivePreview(opened, { enabled: true });
    expect(unchanged.past).toHaveLength(0);
  });
});
