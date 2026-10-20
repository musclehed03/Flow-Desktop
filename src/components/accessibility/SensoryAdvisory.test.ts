import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { SensoryAdvisory } from './SensoryAdvisory';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { SETTINGS } from '../../lib/settings/schema';
vi.mock('../../lib/streamResolution', () => ({ prefetchStreamInfo: vi.fn() }));

it('pauses each new Safe Motion video for consent while preserving fullscreen and theater', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const original = useAppSettingsStore.getState().values;
  useAppSettingsStore.setState({ values: { ...original, [SETTINGS.SAFE_MOTION_ENABLED]: 'true' } });
  usePlayerStore.getState().setQueue([{ id: 'one', title: 'One', channelName: 'Artist' }, { id: 'two', title: 'Two', channelName: 'Artist' }]);
  usePlayerStore.setState({ isVideoFullscreen: true, isTheaterMode: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SensoryAdvisory, { videoId: 'one' })));
    expect(usePlayerStore.getState()).toMatchObject({ isPlaying: false, isVideoFullscreen: true, isTheaterMode: true });
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => { usePlayerStore.getState().playNext(); root.render(createElement(SensoryAdvisory, { videoId: 'two' })); });
    expect(usePlayerStore.getState()).toMatchObject({ isPlaying: false, isVideoFullscreen: true, isTheaterMode: true });
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); usePlayerStore.getState().clearQueue();
    useAppSettingsStore.setState({ values: original }); sessionStorage.removeItem('flow-sensory-advisory');
  }
});
