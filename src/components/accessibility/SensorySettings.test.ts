import { Visualizers, VisualizerToggle } from "../visualizer/Visualizers";
import { useVisualizerUi } from "../../lib/useVisualizer";
import { RelatedSongsSidebar, RelatedSongsToggle } from "../radio/RelatedSongsSidebar";
import { useRelatedSnapshot } from "../../lib/relatedSnapshot";
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { SensoryRoot } from '../../lib/useSensorySuite';
import { SENSORY_SETTINGS } from '../../lib/accessibility';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';
import { SETTINGS } from '../../lib/settings/schema';
import { SensorySettings } from './SensorySettings';
import { DeviantControls } from './DeviantControls';
import { PlayerTab } from '../settings/tabs/PlayerTab';
import { ImportData } from '../../pages/ImportData';
import { GeniusControls } from '../radio/GeniusControls';
import { SavedStations } from '../radio/SavedStations';
import { ThemeController } from '../../lib/useTheme';

const original = useAppSettingsStore.getState().values;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  useAppSettingsStore.setState({ values: original });
  for (const [name] of SENSORY_SETTINGS) document.documentElement.classList.remove(`sensory-${name}`);
  document.documentElement.classList.remove('sensory-reducedFlash');
});

it('keeps settings, importer and quick controls operable across all 128 sensory combinations', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const showModal = vi.fn(function(this: HTMLDialogElement) {
    this.setAttribute('open', ''); this.querySelector<HTMLButtonElement>('button')?.focus();
  });
  const close = vi.fn(function(this: HTMLDialogElement) {
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'));
  });
  const previousShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const previousClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  try {
    await act(async () => root.render(createElement(SensoryRoot, null,
      createElement(ThemeController), createElement(DeviantControls), createElement(SensorySettings), createElement(PlayerTab), createElement(ImportData), createElement(GeniusControls, { surface: "music" }), createElement(SavedStations), createElement(RelatedSongsToggle, { surface: "music" }), createElement(RelatedSongsSidebar), createElement(VisualizerToggle, { surface: "music" }), createElement(Visualizers))));
    for (let mask = 0; mask < 128; mask++) {
      const values = { ...original, [SETTINGS.THEME_VARIANT]: mask & 64 ? 'light' : 'dark', [SETTINGS.REDUCED_FLASH_ENABLED]: String(Boolean(mask & 32)) };
      SENSORY_SETTINGS.forEach(([, key], index) => { values[key] = String(Boolean(mask & (1 << index))); });
      await act(async () => useAppSettingsStore.setState({ values }));
      for (const [name, key] of SENSORY_SETTINGS) expect(document.documentElement.classList.contains(`sensory-${name}`), `mode ${mask}, ${name}`).toBe(values[key] === 'true');
      expect(document.documentElement.classList.contains('sensory-reducedFlash')).toBe(Boolean(mask & 32));
      expect(document.documentElement.dataset.themeVariant).toBe(mask & 64 ? 'light' : 'dark');
      await act(async () => useRelatedSnapshot.setState({ open: true, rows: [{ id: 'snapshot', title: 'Snapshot', artist: 'Artist' }], added: [], loading: false, error: false }));
      const related = host.querySelector('#related-songs-sidebar');
      expect(related).not.toBeNull();
      expect(related?.querySelectorAll('button')).toHaveLength(3);
      related?.querySelectorAll('button').forEach((button) => expect(button.getAttribute('aria-label')).toBeTruthy());
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(useRelatedSnapshot.getState().open).toBe(false);
      const switches = host.querySelectorAll<HTMLButtonElement>('[role="switch"]');
      expect(switches.length).toBeGreaterThan(4);
      switches.forEach((button) => expect(button.getAttribute('aria-label'), `unnamed switch in ${mask}`).toBeTruthy());
      expect(host.querySelector('input[type="file"][multiple]')?.getAttribute('accept')).toBe('.json,.zip');
      const trigger = host.querySelector<HTMLButtonElement>('[aria-controls="deviant-controls-dialog"]')!;
      await act(async () => trigger.click());
      expect(host.querySelector('dialog')?.open).toBe(true);
      const dialogButtons = host.querySelectorAll('#deviant-controls-dialog button[aria-pressed]');
      expect(dialogButtons).toHaveLength(7);
      dialogButtons.forEach((button) => expect(button.getAttribute('aria-label')).toBeTruthy());
      await act(async () => host.querySelector<HTMLButtonElement>('dialog > button')!.click());
      expect(document.activeElement).toBe(trigger);
      await act(async () => useVisualizerUi.setState({ open: true }));
      await act(async () => { await import('../visualizer/VisualizerCustomizerPanel'); await Promise.resolve(); });
      const visualizer = document.querySelector<HTMLElement>('[data-dockable-panel="visualizer-editor"]')!;
      expect(visualizer).not.toBeNull();
      expect(visualizer.getAttribute('aria-modal')).toBe('false');
      expect(visualizer.querySelectorAll('input[type="range"]')).toHaveLength(9);
      expect(visualizer.querySelectorAll('select')).toHaveLength(6);
      visualizer.querySelectorAll('select, input').forEach((control) => {
        expect(control.closest('[data-tooltip-detail]'), `visualizer control missing explainer: ${control.getAttribute('aria-label') ?? control.getAttribute('type')}`).not.toBeNull();
      });
      await act(async () => visualizer.querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!.click());
      expect(document.querySelector('[data-dockable-panel="visualizer-editor"]')).toBeNull();
    }
  } finally {
    await act(async () => root.unmount()); host.remove();
    if (previousShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', previousShow); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (previousClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', previousClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  }
}, 120000);
