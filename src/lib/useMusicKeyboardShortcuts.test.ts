import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useMusicKeyboardShortcuts } from './useMusicKeyboardShortcuts';
import { useMusicPlayerStore } from '../store/useMusicPlayerStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { toggleMusicFullscreen, toggleMusicMiniPlayer } from './musicPresentation';
vi.mock('./musicPresentation', () => ({ setMusicFullscreen: vi.fn(), toggleMusicFullscreen: vi.fn(), toggleMusicMiniPlayer: vi.fn() }));
function Controller() { useMusicKeyboardShortcuts(); return null; }

it('operates the audio player with transport, fullscreen and mini-player keys without capturing typing or native controls', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const saved = useMusicPlayerStore.getState();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const actions = { togglePlay: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(), next: vi.fn(), previous: vi.fn() };
  usePlayerStore.getState().clearQueue();
  useMusicPlayerStore.setState({ ...actions, currentTrack: { id: 'audio' } as NonNullable<typeof saved.currentTrack>, progress: 20, duration: 100, volume: .5, viewState: 'full' });
  try {
    await act(async () => root.render(createElement(Controller)));
    for (const key of ['k', 'j', 'l', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'm', 'n', 'p', 'f', 'i']) {
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    }
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    expect(actions.seek).toHaveBeenCalledWith(10);
    expect(actions.seek).toHaveBeenCalledWith(30);
    expect(actions.setVolume).toHaveBeenCalledWith(.55);
    expect(actions.setVolume).toHaveBeenCalledWith(.45);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(toggleMusicFullscreen).toHaveBeenCalledTimes(1);
    expect(toggleMusicMiniPlayer).toHaveBeenCalledTimes(1);
    const input = document.createElement('input'); host.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    const button = document.createElement('button'); host.append(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); useMusicPlayerStore.setState(saved); }
});
