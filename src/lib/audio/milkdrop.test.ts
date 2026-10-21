import { expect, it } from 'vitest';
import { resolveMilkdropRenderer } from './milkdrop';
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
