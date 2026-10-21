export type VisualizerFamily = 'spectrum' | 'waveform' | 'radial' | 'nebula' | 'feedback';
export interface VisualizerConfig {
  milkdropPreset?: string;
  enabled: boolean; family: VisualizerFamily; palette: 'deviants' | 'cyan' | 'mono';
  sensitivity: number; smoothing: number; density: number; falloff: number; beat: number;
  fps: 15 | 30 | 60; mode: 'inline' | 'mini' | 'fullscreen';
}
export const VISUALIZER_DEFAULT: VisualizerConfig = { enabled: false, family: 'spectrum', palette: 'deviants', sensitivity: 1.2, smoothing: .8, density: 64, falloff: .8, beat: .35, fps: 30, mode: 'inline' };
export const VISUALIZER_DEFAULTS = [
  { key: 'noir', config: VISUALIZER_DEFAULT },
  { key: 'orbit', config: { ...VISUALIZER_DEFAULT, family: 'radial' as const, density: 96, sensitivity: 1.4, beat: .5 } },
  { key: 'quiet', config: { ...VISUALIZER_DEFAULT, family: 'waveform' as const, palette: 'mono' as const, fps: 15 as const, beat: 0, smoothing: .95 } },
];
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function parseVisualizerConfig(raw: string): VisualizerConfig {
  let value: Partial<VisualizerConfig>;
  try { const parsed: unknown = JSON.parse(raw); value = parsed && typeof parsed === 'object' ? parsed as Partial<VisualizerConfig> : {}; } catch { value = {}; }
  return { ...(typeof value.milkdropPreset === "string" ? { milkdropPreset: value.milkdropPreset } : {}), enabled: value.enabled === true, family: ['spectrum','waveform','radial','nebula','feedback'].includes(value.family ?? '') ? value.family! : 'spectrum',
    palette: ['deviants','cyan','mono'].includes(value.palette ?? '') ? value.palette! : 'deviants',
    sensitivity: clamp(value.sensitivity, 1.2, .2, 3), smoothing: clamp(value.smoothing, .8, 0, .98),
    density: Math.round(clamp(value.density, 64, 16, 160)), falloff: clamp(value.falloff, .8, .1, .98), beat: clamp(value.beat, .35, 0, 1),
    fps: [15,30,60].includes(value.fps ?? 0) ? value.fps! : 30,
    mode: ['inline','mini','fullscreen'].includes(value.mode ?? '') ? value.mode! : 'inline' };
}
export interface VisualizerPreset { name: string; config: VisualizerConfig }
export function parseVisualizerPresets(raw: string): VisualizerPreset[] {
  try { const list: unknown = JSON.parse(raw); return Array.isArray(list) ? list.filter((value) => value && typeof value.name === 'string' && value.name.trim()).slice(0, 100).map((value) => ({ name: value.name, config: parseVisualizerConfig(JSON.stringify(value.config)) })) : []; } catch { return []; }
}
export function degradeVisualizer(fps: number, density: number, averageDrawMs: number) {
  return averageDrawMs > 1000 / fps * .65 ? { fps: fps > 30 ? 30 : 15, density: Math.max(16, Math.floor(density * .75)) } : { fps, density };
}

export function drawVisualizer(ctx: CanvasRenderingContext2D, width: number, height: number, frequency: Uint8Array, wave: Uint8Array, config: VisualizerConfig, colors: [string,string,string], peaks: Float32Array, phase: number) {
  const [primary, utility, background] = colors;
  ctx.globalAlpha = 1; ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  const count = Math.min(config.density, peaks.length);
  const bass = frequency.slice(0, 12).reduce((sum, value) => sum + value, 0) / (12 * 255);
  ctx.strokeStyle = primary; ctx.fillStyle = primary; ctx.lineWidth = 2;
  if (config.family === 'waveform') {
    ctx.beginPath();
    const points = Math.min(wave.length, config.density * 4);
    for (let index = 0; index < points; index++) { const sample = Math.floor(index / points * wave.length); const x = index / (points - 1) * width; const y = height / 2 + (wave[sample]! / 128 - 1) * height * .35 * config.sensitivity; if (!index) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke(); return;
  }
  for (let index = 0; index < count; index++) {
    const bin = Math.min(frequency.length - 1, Math.floor(Math.pow(index / count, 1.8) * frequency.length * .75));
    const level = Math.min(1, frequency[bin]! / 255 * config.sensitivity);
    peaks[index] = Math.max(level, (peaks[index] ?? 0) * config.falloff);
    const amplitude = peaks[index]!;
    ctx.fillStyle = index % 4 === 0 ? utility : primary;
    if (config.family === 'spectrum') { ctx.fillRect(index * width / count + 1, height * (1 - amplitude * .9), Math.max(1, width / count - 2), height * amplitude * .9); }
    else if (config.family === 'radial') {
      const angle = index / count * Math.PI * 2;
      const radius = Math.min(width,height) * (.2 + bass * config.beat * .08);
      ctx.beginPath(); ctx.strokeStyle = ctx.fillStyle;
      ctx.moveTo(width/2 + Math.cos(angle)*radius,height/2 + Math.sin(angle)*radius);
      ctx.lineTo(width/2 + Math.cos(angle)*(radius+amplitude*height*.22),height/2 + Math.sin(angle)*(radius+amplitude*height*.22)); ctx.stroke();
    } else if (config.family === 'nebula') {
      const angle = index * 2.399963 + phase * .1;
      const radius = Math.sqrt(index / count) * Math.min(width,height) * (.35 + bass * config.beat * .08);
      ctx.globalAlpha = .4 + amplitude * .5;
      ctx.beginPath(); ctx.arc(width/2+Math.cos(angle)*radius,height/2+Math.sin(angle)*radius,2+amplitude*6,0,Math.PI*2);ctx.fill();
    } else {
      // Original feedback-style geometry; no MilkDrop equations, shaders or third-party presets.
      const angle = index / count * Math.PI * 2 + phase * .08;
      const radius = Math.min(width,height) * (.22 + Math.sin(index*.2+phase*.2)*.08 + amplitude*.15);
      ctx.globalAlpha = .65; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();ctx.moveTo(width/2+Math.cos(angle)*radius,height/2+Math.sin(angle)*radius);
      ctx.lineTo(width/2+Math.cos(angle+1.2)*(radius*.7),height/2+Math.sin(angle+1.2)*(radius*.7));ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
