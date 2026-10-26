import { expect, it } from 'vitest';
import { groupMilkdropPresets, resolveMilkdropRenderer } from './milkdrop';
it('resolves the published UMD renderer and normalized bundler exports', async () => {
  const module = await import('butterchurn');
  expect(typeof resolveMilkdropRenderer(module).createVisualizer).toBe('function');
  const renderer = { createVisualizer: () => undefined };
  expect(resolveMilkdropRenderer(renderer)).toBe(renderer);
  const umdClass = Object.assign(function Renderer() {}, renderer);
  expect(resolveMilkdropRenderer({ default: { default: umdClass } })).toBe(umdClass);
  expect(resolveMilkdropRenderer({ default: { default: renderer } })).toBe(renderer);
  expect(() => resolveMilkdropRenderer({ default: {} })).toThrow('unavailable');
});
it('groups MilkDrop preset packs by their credited author', () => {
  expect(groupMilkdropPresets(['Geiss - A', 'Aderrasi - B', 'Untitled'])).toEqual([
    { name: 'Aderrasi', presets: ['Aderrasi - B'] },
    { name: 'Community', presets: ['Untitled'] },
    { name: 'Geiss', presets: ['Geiss - A'] },
  ]);
});
