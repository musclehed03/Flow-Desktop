import { create } from 'zustand';
import { usePreference } from './usePreference';
import { SETTINGS } from './settings/schema';
import { parseVisualizerConfig } from './audio/visualizer';
import { videoAnalyser } from './audio/videoAnalyser';
const hasConsent = () => { try { return sessionStorage.getItem('flow-visualizer-advisory') === 'true'; } catch { return false; } };
export const useVisualizerUi = create<{ open: boolean; surface: 'music' | 'video'; analyser: AnalyserNode | null; consented: boolean }>(() => ({ open: false, surface: 'music', analyser: null, consented: hasConsent() }));
export function acceptVisualizerAdvisory(consented: boolean) {
  useVisualizerUi.setState({ consented });
  try { sessionStorage.setItem('flow-visualizer-advisory', String(consented)); } catch { /* Consent still lasts for this window's lifetime. */ }
}
export function useVisualizerConfig() {
  const [raw, set] = usePreference(SETTINGS.VISUALIZER_CONFIG);
  return [parseVisualizerConfig(raw), (value: ReturnType<typeof parseVisualizerConfig>) => set(JSON.stringify(value))] as const;
}
export async function openVisualizer(surface: 'music' | 'video') {
  useVisualizerUi.setState({ surface, open: true, analyser: surface === 'video' ? await videoAnalyser() : null });
}
