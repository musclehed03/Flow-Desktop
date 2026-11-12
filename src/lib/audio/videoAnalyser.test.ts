import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}
const contexts: FakeContext[] = [];
class FakeContext {
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    contexts.push(this);
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), { fftSize: 0 });
  }
  createMediaElementSource(_el: HTMLMediaElement) {
    return new FakeNode();
  }
}

function mountSurface(video: HTMLVideoElement) {
  const root = document.createElement("div");
  root.setAttribute("data-flow-player-surface", "video");
  root.append(video);
  document.body.append(root);
  return root;
}

beforeEach(() => {
  contexts.length = 0;
  vi.stubGlobal("AudioContext", FakeContext);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  const module = await import("./videoAnalyser");
  await module.releaseVideoAnalyser();
  vi.resetModules();
});

describe("videoAnalyser leak (fixes batch #4)", () => {
  it("keeps one context per element and closes the stale one when the element changes", async () => {
    const { videoAnalyser } = await import("./videoAnalyser");
    const first = document.createElement("video");
    const root = mountSurface(first);
    const analyser = await videoAnalyser();
    expect(analyser).not.toBeNull();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.state).toBe("running");

    const second = document.createElement("video");
    root.replaceChildren(second);
    await videoAnalyser();
    expect(contexts).toHaveLength(2);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    expect(contexts[0]!.state).toBe("closed");
    expect(contexts[1]!.state).toBe("running");
  });

  it("releaseVideoAnalyser closes the context so its stream is released", async () => {
    const { videoAnalyser, releaseVideoAnalyser } = await import("./videoAnalyser");
    mountSurface(document.createElement("video"));
    await videoAnalyser();
    expect(contexts).toHaveLength(1);
    await releaseVideoAnalyser();
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    // A later open starts fresh instead of reusing the closed context.
    await videoAnalyser();
    expect(contexts).toHaveLength(2);
    expect(contexts[1]!.state).toBe("running");
  });

  it("closeVisualizer drops the store analyser and releases the video context", async () => {
    const { videoAnalyser } = await import("./videoAnalyser");
    mountSurface(document.createElement("video"));
    const { openVisualizer, closeVisualizer, useVisualizerUi } = await import("../useVisualizer");
    await openVisualizer("video");
    expect(useVisualizerUi.getState().analyser).not.toBeNull();
    expect(contexts).toHaveLength(1);
    closeVisualizer();
    expect(useVisualizerUi.getState().open).toBe(false);
    expect(useVisualizerUi.getState().analyser).toBeNull();
    // The close is async; let it land before asserting.
    await vi.waitFor(() => expect(contexts[0]!.close).toHaveBeenCalledTimes(1));
    expect(videoAnalyser).toBeDefined();
  });
});
