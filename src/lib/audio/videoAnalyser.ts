const graphs = new WeakMap<HTMLMediaElement, { context: AudioContext; analyser: AnalyserNode }>();
/** Create once, on an explicit user gesture. Keep the media-to-output path alive. */
export async function videoAnalyser(): Promise<AnalyserNode | null> {
  const root = document.querySelector('[data-flow-player-surface="video"]');
  const element = root?.querySelector<HTMLMediaElement>('audio[src]') ?? root?.querySelector<HTMLVideoElement>('video');
  if (!element) return null;
  let graph = graphs.get(element);
  try {
    if (!graph) {
      const context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      const source = context.createMediaElementSource(element);
      source.connect(analyser); analyser.connect(context.destination);
      graph = { context, analyser }; graphs.set(element, graph);
    }
    if (graph.context.state === 'suspended') await graph.context.resume();
    return graph.analyser;
  } catch { return null; }
}
