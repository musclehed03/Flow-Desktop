import type { VisualizerConfig } from './visualizer';
export async function milkdropPresetNames(): Promise<string[]> {
  const { default: presets } = await import('butterchurn-presets');
  return Object.keys(presets.getPresets()).sort();
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
