import { describe, expect, it } from 'vitest';
import css from '../App.css?raw';
import { initialSafeMotion } from './settings/motionDefault';
import { vi } from 'vitest';
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((n) => parseInt(n, 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
}
const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

describe('sensory contrast and OS motion defaults', () => {
  it('meets WCAG AA for text and button token pairs in normal/high contrast, dark/light', () => {
    const blocks = [...css.matchAll(/(:root[^{}]+)\{([^{}]+)\}/g)].filter((m) => m[2]!.includes('--color-on-primary-val:') && m[2]!.includes('!important'));
    expect(blocks).toHaveLength(4);
    for (const [, selector, block] of blocks) {
      const values = Object.fromEntries([...block!.matchAll(/--color-([\w-]+): (#[\da-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
      for (const foreground of ['on-surface-val', 'on-surface-variant-val']) {
        for (const background of ['background-val', 'surface-val', 'surface-container-highest-val']) {
          expect(contrast(values[foreground]!, values[background]!), `${selector}: ${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(values.primary!, values['on-primary-val']!)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each([true, false])('takes Safe Motion first-run default from OS (%s)', (matches) => {
    vi.stubGlobal('matchMedia', () => ({ matches }));
    expect(initialSafeMotion()).toBe(matches);
    vi.unstubAllGlobals();
  });
});
