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
import { ThemeController } from '../../lib/useTheme';

const original = useAppSettingsStore.getState().values;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  useAppSettingsStore.setState({ values: original });
  for (const [name] of SENSORY_SETTINGS) document.documentElement.classList.remove(`sensory-${name}`);
});

it('keeps settings, importer and quick controls operable across all 128 sensory combinations', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function(this: HTMLDialogElement) {
    this.setAttribute('open', ''); this.querySelector<HTMLButtonElement>('button')?.focus();
  });
  const close = vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function(this: HTMLDialogElement) {
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'));
  });
  try {
    await act(async () => root.render(createElement(SensoryRoot, null,
      createElement(ThemeController), createElement(DeviantControls), createElement(SensorySettings), createElement(PlayerTab), createElement(ImportData))));
    for (let mask = 0; mask < 128; mask++) {
      const values = { ...original, [SETTINGS.THEME_VARIANT]: mask & 64 ? 'light' : 'dark' };
      SENSORY_SETTINGS.forEach(([, key], index) => { values[key] = String(Boolean(mask & (1 << index))); });
      await act(async () => useAppSettingsStore.setState({ values }));
      for (const [name, key] of SENSORY_SETTINGS) expect(document.documentElement.classList.contains(`sensory-${name}`), `mode ${mask}, ${name}`).toBe(values[key] === 'true');
      expect(document.documentElement.dataset.themeVariant).toBe(mask & 64 ? 'light' : 'dark');
      const switches = host.querySelectorAll<HTMLButtonElement>('[role="switch"]');
      expect(switches.length).toBeGreaterThan(4);
      switches.forEach((button) => expect(button.getAttribute('aria-label'), `unnamed switch in ${mask}`).toBeTruthy());
      expect(host.querySelector('input[type="file"][multiple]')?.getAttribute('accept')).toBe('.json,.zip');
      const trigger = host.querySelector<HTMLButtonElement>('[aria-controls="deviant-controls-dialog"]')!;
      await act(async () => trigger.click());
      expect(host.querySelector('dialog')?.open).toBe(true);
      const dialogButtons = host.querySelectorAll('dialog button[aria-pressed]');
      expect(dialogButtons).toHaveLength(7);
      dialogButtons.forEach((button) => expect(button.getAttribute('aria-label')).toBeTruthy());
      await act(async () => host.querySelector<HTMLButtonElement>('dialog > button')!.click());
      expect(document.activeElement).toBe(trigger);
    }
  } finally {
    await act(async () => root.unmount()); host.remove(); showModal.mockRestore(); close.mockRestore();
  }
}, 30000);
