import { create } from 'zustand';
import { usePreference } from './usePreference';
import { SETTINGS } from './settings/schema';
import { parseVisualizerConfig } from './audio/visualizer';
import { videoAnalyser, releaseVideoAnalyser } from './audio/videoAnalyser';
import { getSessionFlag, setSessionFlag } from "./storage/sessionFlag";
const hasConsent = () => getSessionFlag("flow-visualizer-advisory");
export const useVisualizerUi = create<{ open: boolean; surface: 'music' | 'video'; analyser: AnalyserNode | null; consented: boolean; opener: HTMLElement | null }>(() => ({ open: false, surface: 'music', analyser: null, consented: hasConsent(), opener: null }));
export function acceptVisualizerAdvisory(consented: boolean) {
  useVisualizerUi.setState({ consented });
  setSessionFlag("flow-visualizer-advisory", consented);
}
export function useVisualizerConfig() {
  const [raw, set] = usePreference(SETTINGS.VISUALIZER_CONFIG);
  return [parseVisualizerConfig(raw), (value: ReturnType<typeof parseVisualizerConfig>) => set(JSON.stringify(value))] as const;
}
export async function openVisualizer(surface: 'music' | 'video') {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useVisualizerUi.setState({ surface, open: true, opener, analyser: surface === 'video' ? await videoAnalyser() : null });
}
/** Closes the visualizer and releases the video analyser's context (fixes batch #4). */
export function closeVisualizer() {
  const { surface } = useVisualizerUi.getState();
  useVisualizerUi.setState({ open: false, analyser: null });
  if (surface === 'video') void releaseVideoAnalyser();
}
export function openVisualizerCustomizer() {
  useVisualizerUi.setState({ open: true, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null });
}
