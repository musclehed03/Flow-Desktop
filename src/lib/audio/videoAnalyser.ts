const graphs = new WeakMap<HTMLMediaElement, { context: AudioContext; analyser: AnalyserNode }>();
/** The one graph currently live: at most one video-analyser context exists per window. */
let lastElement: HTMLMediaElement | null = null;
let lastGraph: { context: AudioContext; analyser: AnalyserNode } | null = null;

async function closeGraph(graph: { context: AudioContext; analyser: AnalyserNode }): Promise<void> {
  try {
    await graph.context.close();
  } catch {
    // Already closed.
  }
}

/** Create once, on an explicit user gesture. Keep the media-to-output path alive. */
export async function videoAnalyser(): Promise<AnalyserNode | null> {
  const root = document.querySelector('[data-flow-player-surface="video"]');
  const element = root?.querySelector<HTMLMediaElement>('audio[src]') ?? root?.querySelector<HTMLVideoElement>('video');
  if (!element) return null;
  // The player remounts its element across navigation and pop-out windows. The previous
  // element's context is closed here instead of lingering with an open PipeWire stream
  // until the garbage collector gets to it (fixes batch #4).
  if (lastElement && lastElement !== element && lastGraph) {
    const stale = lastGraph;
    lastGraph = null;
    graphs.delete(lastElement);
    void closeGraph(stale);
  }
  lastElement = element;
  let graph = graphs.get(element);
  try {
    if (!graph) {
      const context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      const source = context.createMediaElementSource(element);
      source.connect(analyser); analyser.connect(context.destination);
      graph = { context, analyser }; graphs.set(element, graph);
    }
    lastGraph = graph;
    if (graph.context.state === 'suspended') await graph.context.resume();
    return graph.analyser;
  } catch { return null; }
}

/**
 * Closes the video analyser's context (if any) and forgets it, so its PipeWire stream is
 * released when the visualizer closes instead of running until the app exits.
 */
export async function releaseVideoAnalyser(): Promise<void> {
  if (!lastGraph) return;
  const graph = lastGraph;
  lastGraph = null;
  if (lastElement) graphs.delete(lastElement);
  lastElement = null;
  await closeGraph(graph);
}
