import type { VisualizerConfig } from './visualizer';
export async function milkdropPresetNames(): Promise<string[]> {
  const { default: presets } = await import('butterchurn-presets');
  return Object.keys(presets.getPresets()).sort();
}
export interface MilkdropPresetGroup { name: string; presets: string[] }
export function groupMilkdropPresets(names: string[]): MilkdropPresetGroup[] {
  const groups = new Map<string, string[]>();
  names.forEach((name) => {
    const separator = name.indexOf(" - ");
    const author = separator > 0 && separator < 32 ? name.slice(0, separator).trim() : "Community";
    groups.set(author, [...(groups.get(author) ?? []), name]);
  });
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, presets]) => ({ name, presets: presets.sort((left, right) => left.localeCompare(right)) }));
}
/** Preserve the original preset equations and author metadata; tint its waveform. */
export function customizeMilkdropPreset(preset: unknown, config: VisualizerConfig, color: string): unknown {
  if (!preset || typeof preset !== 'object') return preset;
  const original = preset as { baseVals?: Record<string, unknown>; frame_eqs?: (variables: Record<string, number>) => Record<string, number> };
  const match = color.match(/^#([a-f0-9]{6})$/i);
  const rgb = match ? [0,2,4].map((offset) => parseInt(match[1]!.slice(offset,offset+2),16)/255) : [1,1,1];
  return { ...original, baseVals: { ...original.baseVals, decay:config.falloff, wave_r:rgb[0],wave_g:rgb[1],wave_b:rgb[2] },
    frame_eqs: (variables: Record<string,number>) => ({ ...(original.frame_eqs?.(variables) ?? variables), decay:config.falloff, wave_r:rgb[0],wave_g:rgb[1],wave_b:rgb[2] }) };
}

/** The published UMD build and bundlers expose different default-export depths. */
export function resolveMilkdropRenderer(value: unknown): typeof import('butterchurn')['default'] {
  let candidate = value;
  for (let depth = 0; depth < 3; depth++) {
    if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) break;
    const module = candidate as { createVisualizer?: unknown; default?: unknown };
    if (typeof module.createVisualizer === 'function') return candidate as typeof import('butterchurn')['default'];
    candidate = module.default;
  }
  throw new Error('MilkDrop renderer unavailable');
}
