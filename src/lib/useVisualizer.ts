import { create } from 'zustand';
import { usePreference } from './usePreference';
import { SETTINGS } from './settings/schema';
import { parseVisualizerConfig } from './audio/visualizer';
import { videoAnalyser } from './audio/videoAnalyser';
const hasConsent = () => { try { return sessionStorage.getItem('flow-visualizer-advisory') === 'true'; } catch { return false; } };
export const useVisualizerUi = create<{ open: boolean; surface: 'music' | 'video'; analyser: AnalyserNode | null; consented: boolean; opener: HTMLElement | null }>(() => ({ open: false, surface: 'music', analyser: null, consented: hasConsent(), opener: null }));
export function acceptVisualizerAdvisory(consented: boolean) {
  useVisualizerUi.setState({ consented });
  try { sessionStorage.setItem('flow-visualizer-advisory', String(consented)); } catch { /* Consent still lasts for this window's lifetime. */ }
}
export function useVisualizerConfig() {
  const [raw, set] = usePreference(SETTINGS.VISUALIZER_CONFIG);
  return [parseVisualizerConfig(raw), (value: ReturnType<typeof parseVisualizerConfig>) => set(JSON.stringify(value))] as const;
}
export async function openVisualizer(surface: 'music' | 'video') {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useVisualizerUi.setState({ surface, open: true, opener, analyser: surface === 'video' ? await videoAnalyser() : null });
}
export function openVisualizerCustomizer() {
  useVisualizerUi.setState({ open: true, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null });
}
