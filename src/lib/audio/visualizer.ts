export type VisualizerFamily = "spectrum" | "waveform" | "radial" | "nebula" | "feedback";
export type VisualizerMirror = "none" | "horizontal" | "vertical" | "quad" | "kaleidoscope";
export type VisualizerDirection = "up" | "down" | "left" | "right";
export type VisualizerCycleMode = "off" | "hue" | "sequence";
export type VisualizerPresetCategory = "calm" | "energetic" | "experimental" | "custom";

export interface VisualizerColorStop { offset: number; color: string }
export interface VisualizerFamilyColors {
  foreground: string;
  background: string;
  stops: VisualizerColorStop[];
  angle: number;
  cycleMode: VisualizerCycleMode;
  cycleSeconds: number;
}
export interface VisualizerColorModel extends VisualizerFamilyColors {
  familyOverrides: Partial<Record<VisualizerFamily, VisualizerFamilyColors>>;
}
export interface VisualizerConfig {
  milkdropPreset?: string;
  enabled: boolean;
  family: VisualizerFamily;
  colors: VisualizerColorModel;
  mirror: VisualizerMirror;
  direction: VisualizerDirection;
  sensitivity: number;
  smoothing: number;
  density: number;
  falloff: number;
  beat: number;
  fps: 15 | 30 | 60;
  mode: "inline" | "mini" | "fullscreen";
}

const FAMILY_VALUES: VisualizerFamily[] = ["spectrum", "waveform", "radial", "nebula", "feedback"];
const MIRROR_VALUES: VisualizerMirror[] = ["none", "horizontal", "vertical", "quad", "kaleidoscope"];
const DIRECTION_VALUES: VisualizerDirection[] = ["up", "down", "left", "right"];
const CYCLE_VALUES: VisualizerCycleMode[] = ["off", "hue", "sequence"];
const HEX = /^#[0-9a-f]{6}$/i;

export const VISUALIZER_COLORS_DEFAULT: VisualizerColorModel = {
  foreground: "#ff1e89",
  background: "#0b0b10",
  stops: [{ offset: 0, color: "#ff1e89" }, { offset: 1, color: "#66d9e8" }],
  angle: 0,
  cycleMode: "off",
  cycleSeconds: 12,
  familyOverrides: {},
};

export const VISUALIZER_DEFAULT: VisualizerConfig = {
  enabled: false,
  family: "spectrum",
  colors: VISUALIZER_COLORS_DEFAULT,
  mirror: "none",
  direction: "up",
  sensitivity: 1.2,
  smoothing: 0.8,
  density: 64,
  falloff: 0.8,
  beat: 0.35,
  fps: 30,
  mode: "inline",
};

function colors(
  foreground: string,
  background: string,
  second: string,
  overrides: Partial<VisualizerFamilyColors> = {},
): VisualizerColorModel {
  return {
    ...VISUALIZER_COLORS_DEFAULT,
    foreground,
    background,
    stops: [{ offset: 0, color: foreground }, { offset: 1, color: second }],
    ...overrides,
    familyOverrides: {},
  };
}

export const VISUALIZER_DEFAULTS = [
  { key: "noir", category: "calm", flashRisk: false, config: VISUALIZER_DEFAULT },
  { key: "quiet", category: "calm", flashRisk: false, config: { ...VISUALIZER_DEFAULT, family: "waveform", colors: colors("#f5f5f5", "#08080c", "#9b9ba6"), fps: 15, beat: 0, smoothing: 0.95 } },
  { key: "horizon", category: "calm", flashRisk: false, config: { ...VISUALIZER_DEFAULT, family: "spectrum", colors: colors("#66d9e8", "#071014", "#b5f2f6"), direction: "right", density: 48, smoothing: 0.9 } },
  { key: "moonwave", category: "calm", flashRisk: false, config: { ...VISUALIZER_DEFAULT, family: "waveform", colors: colors("#c9c2ff", "#090811", "#66d9e8"), mirror: "vertical", fps: 15, smoothing: 0.92 } },
  { key: "orbit", category: "energetic", flashRisk: false, config: { ...VISUALIZER_DEFAULT, family: "radial", density: 96, sensitivity: 1.4, beat: 0.5 } },
  { key: "ladder", category: "energetic", flashRisk: false, config: { ...VISUALIZER_DEFAULT, colors: colors("#ff1e89", "#09090e", "#ffd166", { angle: 90 }), mirror: "horizontal", density: 80, falloff: 0.72 } },
  { key: "cyanSplit", category: "energetic", flashRisk: false, config: { ...VISUALIZER_DEFAULT, colors: colors("#66d9e8", "#071014", "#f5f5f5"), mirror: "quad", density: 72, sensitivity: 1.35 } },
  { key: "deviantRush", category: "energetic", flashRisk: true, config: { ...VISUALIZER_DEFAULT, colors: colors("#ff1e89", "#0b0b10", "#66d9e8", { cycleMode: "sequence", cycleSeconds: 3 }), fps: 60, density: 128, beat: 0.8, falloff: 0.58 } },
  { key: "nebulaBloom", category: "experimental", flashRisk: false, config: { ...VISUALIZER_DEFAULT, family: "nebula", colors: colors("#ff1e89", "#080812", "#66d9e8", { angle: 45 }), mirror: "kaleidoscope", density: 100, smoothing: 0.86 } },
  { key: "quadReactor", category: "experimental", flashRisk: true, config: { ...VISUALIZER_DEFAULT, family: "radial", colors: colors("#ffd166", "#09090d", "#ff1e89", { cycleMode: "hue", cycleSeconds: 4 }), mirror: "quad", fps: 60, beat: 0.75 } },
  { key: "milkdropVoltage", category: "experimental", flashRisk: true, config: { ...VISUALIZER_DEFAULT, family: "feedback", colors: colors("#ff1e89", "#050508", "#66d9e8"), sensitivity: 1.5, smoothing: 0.72, fps: 60, beat: 0.7 } },
  { key: "prismStep", category: "experimental", flashRisk: true, config: { ...VISUALIZER_DEFAULT, family: "spectrum", colors: colors("#ff1e89", "#07070b", "#66d9e8", { cycleMode: "sequence", cycleSeconds: 2 }), direction: "left", mirror: "kaleidoscope", density: 112, fps: 60, smoothing: 0.62 } },
] as const satisfies ReadonlyArray<{ key: string; category: Exclude<VisualizerPresetCategory, "custom">; flashRisk: boolean; config: VisualizerConfig }>;

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;

function parseStops(value: unknown, fallback: VisualizerColorStop[]): VisualizerColorStop[] {
  if (!Array.isArray(value)) return fallback.map((stop) => ({ ...stop }));
  const parsed = value.slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const stop = entry as Partial<VisualizerColorStop>;
    if (typeof stop.color !== "string" || !HEX.test(stop.color)) return [];
    return [{ offset: clamp(stop.offset, 0, 0, 1), color: stop.color.toLowerCase() }];
  }).sort((left, right) => left.offset - right.offset);
  return parsed.length ? parsed : fallback.map((stop) => ({ ...stop }));
}

function parseFamilyColors(value: unknown, fallback: VisualizerFamilyColors): VisualizerFamilyColors {
  const record = value && typeof value === "object" ? value as Partial<VisualizerFamilyColors> : {};
  return {
    foreground: color(record.foreground, fallback.foreground),
    background: color(record.background, fallback.background),
    stops: parseStops(record.stops, fallback.stops),
    angle: clamp(record.angle, fallback.angle, 0, 360),
    cycleMode: CYCLE_VALUES.includes(record.cycleMode ?? "off") ? record.cycleMode! : fallback.cycleMode,
    cycleSeconds: clamp(record.cycleSeconds, fallback.cycleSeconds, 2, 60),
  };
}

function legacyColors(palette: unknown): VisualizerColorModel {
  if (palette === "cyan") return colors("#66d9e8", "#0b0b10", "#b5f2f6");
  if (palette === "mono") return colors("#f5f5f5", "#0b0b10", "#a6a6a6");
  return { ...VISUALIZER_COLORS_DEFAULT, stops: VISUALIZER_COLORS_DEFAULT.stops.map((stop) => ({ ...stop })), familyOverrides: {} };
}

export function parseVisualizerColors(value: unknown, palette?: unknown): VisualizerColorModel {
  const fallback = legacyColors(palette);
  const parsed = parseFamilyColors(value, fallback);
  const record = value && typeof value === "object" ? value as { familyOverrides?: unknown } : {};
  const rawOverrides = record.familyOverrides && typeof record.familyOverrides === "object"
    ? record.familyOverrides as Partial<Record<VisualizerFamily, unknown>>
    : {};
  const familyOverrides: VisualizerColorModel["familyOverrides"] = {};
  for (const family of FAMILY_VALUES) {
    if (rawOverrides[family]) familyOverrides[family] = parseFamilyColors(rawOverrides[family], parsed);
  }
  return { ...parsed, familyOverrides };
}

export function parseVisualizerConfig(raw: string): VisualizerConfig {
  let value: Partial<VisualizerConfig> & { palette?: unknown };
  try {
    const parsed: unknown = JSON.parse(raw);
    value = parsed && typeof parsed === "object" ? parsed as typeof value : {};
  } catch { value = {}; }
  return {
    ...(typeof value.milkdropPreset === "string" ? { milkdropPreset: value.milkdropPreset } : {}),
    enabled: value.enabled === true,
    family: FAMILY_VALUES.includes(value.family ?? "spectrum") ? value.family! : "spectrum",
    colors: parseVisualizerColors(value.colors, value.palette),
    mirror: MIRROR_VALUES.includes(value.mirror ?? "none") ? value.mirror! : "none",
    direction: DIRECTION_VALUES.includes(value.direction ?? "up") ? value.direction! : "up",
    sensitivity: clamp(value.sensitivity, 1.2, 0.2, 3),
    smoothing: clamp(value.smoothing, 0.8, 0, 0.98),
    density: Math.round(clamp(value.density, 64, 16, 160)),
    falloff: clamp(value.falloff, 0.8, 0.1, 0.98),
    beat: clamp(value.beat, 0.35, 0, 1),
    fps: [15, 30, 60].includes(value.fps ?? 0) ? value.fps! : 30,
    mode: ["inline", "mini", "fullscreen"].includes(value.mode ?? "") ? value.mode! : "inline",
  };
}

export interface VisualizerPreset {
  name: string;
  category: VisualizerPresetCategory;
  flashRisk: boolean;
  config: VisualizerConfig;
}

export function parseVisualizerPresets(raw: string): VisualizerPreset[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((value) => value && typeof value.name === "string" && value.name.trim()).slice(0, 100).map((value) => {
      const preset = value as Partial<VisualizerPreset>;
      return {
        name: preset.name!.trim().slice(0, 80),
        category: ["calm", "energetic", "experimental", "custom"].includes(preset.category ?? "") ? preset.category! : "custom",
        flashRisk: preset.flashRisk === true,
        config: parseVisualizerConfig(JSON.stringify(preset.config)),
      };
    });
  } catch { return []; }
}

export function resolveVisualizerColors(config: VisualizerConfig): VisualizerFamilyColors {
  const override = config.colors.familyOverrides[config.family];
  return override ? { ...override, stops: override.stops.map((stop) => ({ ...stop })) } : {
    foreground: config.colors.foreground,
    background: config.colors.background,
    stops: config.colors.stops.map((stop) => ({ ...stop })),
    angle: config.colors.angle,
    cycleMode: config.colors.cycleMode,
    cycleSeconds: config.colors.cycleSeconds,
  };
}

export function enforceReducedFlash(config: VisualizerConfig): VisualizerConfig {
  const family = config.family === "feedback" ? "radial" : config.family;
  const resolved = resolveVisualizerColors(config);
  const constrained = { ...resolved, cycleMode: "off" as const, cycleSeconds: Math.max(8, resolved.cycleSeconds) };
  return {
    ...config,
    family,
    colors: {
      ...config.colors,
      ...constrained,
      familyOverrides: { ...config.colors.familyOverrides, [family]: constrained },
    },
    mirror: config.mirror === "kaleidoscope" ? "none" : config.mirror,
    sensitivity: Math.min(config.sensitivity, 1.4),
    smoothing: Math.max(config.smoothing, 0.82),
    falloff: Math.max(config.falloff, 0.78),
    beat: Math.min(config.beat, 0.35),
    fps: config.fps > 30 ? 30 : config.fps,
  };
}

export function degradeVisualizer(fps: number, density: number, averageDrawMs: number) {
  return averageDrawMs > 1000 / fps * 0.65
    ? { fps: fps > 30 ? 30 : 15, density: Math.max(16, Math.floor(density * 0.75)) }
    : { fps, density };
}

export const VISUALIZER_SILENCE_THRESHOLD = 0.012;
export const VISUALIZER_SILENCE_HOLD_MS = 1_500;
export const VISUALIZER_SILENCE_POLL_MS = 500;
export function visualizerSignalLevel(frequency: Uint8Array): number {
  if (!frequency.length) return 0;
  let total = 0;
  for (let index = 0; index < frequency.length; index++) total += frequency[index]!;
  return total / (frequency.length * 255);
}

function rotateHue(hex: string, degrees: number): string {
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  if (delta) {
    if (max === rgb[0]) hue = 60 * (((rgb[1]! - rgb[2]!) / delta) % 6);
    else if (max === rgb[1]) hue = 60 * ((rgb[2]! - rgb[0]!) / delta + 2);
    else hue = 60 * ((rgb[0]! - rgb[1]!) / delta + 4);
  }
  hue = ((hue + degrees) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs(segment % 2 - 1));
  const parts = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x]
    : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = light - chroma / 2;
  return `#${parts.map((part) => Math.round((part + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function animatedVisualizerStops(model: VisualizerFamilyColors, phase: number, reducedFlash: boolean): VisualizerColorStop[] {
  if (reducedFlash || model.cycleMode === "off" || model.stops.length < 2) return model.stops;
  if (model.cycleMode === "hue") {
    const degrees = phase / model.cycleSeconds * 360;
    return model.stops.map((stop) => ({ ...stop, color: rotateHue(stop.color, degrees) }));
  }
  const shift = Math.floor(phase / model.cycleSeconds) % model.stops.length;
  const colors = model.stops.map((stop) => stop.color);
  return model.stops.map((stop, index) => ({ ...stop, color: colors[(index + shift) % colors.length]! }));
}

function gradientPaint(ctx: CanvasRenderingContext2D, width: number, height: number, model: VisualizerFamilyColors, phase: number, reducedFlash: boolean): string | CanvasGradient {
  const stops = animatedVisualizerStops(model, phase, reducedFlash);
  if (stops.length < 2 || typeof ctx.createLinearGradient !== "function") return stops[0]?.color ?? model.foreground;
  const radians = model.angle * Math.PI / 180;
  const half = Math.abs(width * Math.cos(radians)) / 2 + Math.abs(height * Math.sin(radians)) / 2;
  const centerX = width / 2, centerY = height / 2;
  const gradient = ctx.createLinearGradient(centerX - Math.cos(radians) * half, centerY - Math.sin(radians) * half, centerX + Math.cos(radians) * half, centerY + Math.sin(radians) * half);
  stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  return gradient;
}

function directionLayer(ctx: CanvasRenderingContext2D, width: number, height: number, direction: VisualizerDirection, draw: (drawWidth: number, drawHeight: number) => void) {
  if (direction === "up" || typeof ctx.save !== "function") { draw(width, height); return; }
  ctx.save();
  if (direction === "down") { ctx.translate(0, height); ctx.scale(1, -1); draw(width, height); }
  else if (direction === "left") { ctx.translate(0, height); ctx.rotate(-Math.PI / 2); draw(height, width); }
  else { ctx.translate(width, 0); ctx.rotate(Math.PI / 2); draw(height, width); }
  ctx.restore();
}

function mirroredLayers(ctx: CanvasRenderingContext2D, width: number, height: number, config: VisualizerConfig, draw: (drawWidth: number, drawHeight: number) => void) {
  const layer = () => directionLayer(ctx, width, height, config.direction, draw);
  if (config.mirror === "none" || typeof ctx.save !== "function") { layer(); return; }
  const transformed = (translateX: number, translateY: number, scaleX: number, scaleY: number, rotate = 0) => {
    ctx.save(); ctx.translate(translateX, translateY); if (rotate) ctx.rotate(rotate); ctx.scale(scaleX, scaleY); layer(); ctx.restore();
  };
  if (config.mirror === "horizontal") {
    transformed(0, 0, 0.5, 1); transformed(width, 0, -0.5, 1);
  } else if (config.mirror === "vertical") {
    transformed(0, 0, 1, 0.5); transformed(0, height, 1, -0.5);
  } else if (config.mirror === "quad") {
    transformed(0, 0, 0.5, 0.5); transformed(width, 0, -0.5, 0.5);
    transformed(0, height, 0.5, -0.5); transformed(width, height, -0.5, -0.5);
  } else {
    for (let index = 0; index < 4; index++) transformed(width / 2, height / 2, 0.5, 0.5, index * Math.PI / 2);
  }
}

function drawLayer(ctx: CanvasRenderingContext2D, width: number, height: number, frequency: Uint8Array, wave: Uint8Array, config: VisualizerConfig, paint: string | CanvasGradient, peaks: Float32Array, phase: number) {
  const count = Math.min(config.density, peaks.length);
  let bassTotal = 0;
  for (let index = 0; index < Math.min(12, frequency.length); index++) bassTotal += frequency[index]!;
  const bass = bassTotal / (Math.min(12, frequency.length) * 255 || 1);
  ctx.strokeStyle = paint; ctx.fillStyle = paint; ctx.lineWidth = 2;
  if (config.family === "waveform") {
    ctx.beginPath();
    const points = Math.min(wave.length, config.density * 4);
    for (let index = 0; index < points; index++) {
      const sample = Math.floor(index / points * wave.length);
      const x = index / Math.max(1, points - 1) * width;
      const y = height / 2 + (wave[sample]! / 128 - 1) * height * 0.35 * config.sensitivity;
      if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); return;
  }
  for (let index = 0; index < count; index++) {
    const bin = Math.min(frequency.length - 1, Math.floor(Math.pow(index / count, 1.8) * frequency.length * 0.75));
    const level = Math.min(1, frequency[bin]! / 255 * config.sensitivity);
    peaks[index] = Math.max(level, (peaks[index] ?? 0) * config.falloff);
    const amplitude = peaks[index]!;
    if (config.family === "spectrum") {
      ctx.fillRect(index * width / count + 1, height * (1 - amplitude * 0.9), Math.max(1, width / count - 2), height * amplitude * 0.9);
    } else if (config.family === "radial") {
      const angle = index / count * Math.PI * 2;
      const radius = Math.min(width, height) * (0.2 + bass * config.beat * 0.08);
      ctx.beginPath();
      ctx.moveTo(width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius);
      ctx.lineTo(width / 2 + Math.cos(angle) * (radius + amplitude * height * 0.22), height / 2 + Math.sin(angle) * (radius + amplitude * height * 0.22));
      ctx.stroke();
    } else if (config.family === "nebula") {
      const angle = index * 2.399963 + phase * 0.1;
      const radius = Math.sqrt(index / count) * Math.min(width, height) * (0.35 + bass * config.beat * 0.08);
      ctx.globalAlpha = 0.4 + amplitude * 0.5;
      ctx.beginPath(); ctx.arc(width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius, 2 + amplitude * 6, 0, Math.PI * 2); ctx.fill();
    } else {
      const angle = index / count * Math.PI * 2 + phase * 0.08;
      const radius = Math.min(width, height) * (0.22 + Math.sin(index * 0.2 + phase * 0.2) * 0.08 + amplitude * 0.15);
      ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.moveTo(width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius);
      ctx.lineTo(width / 2 + Math.cos(angle + 1.2) * (radius * 0.7), height / 2 + Math.sin(angle + 1.2) * (radius * 0.7)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawVisualizer(ctx: CanvasRenderingContext2D, width: number, height: number, frequency: Uint8Array, wave: Uint8Array, config: VisualizerConfig, peaks: Float32Array, phase: number, reducedFlash = false) {
  const model = resolveVisualizerColors(config);
  ctx.globalAlpha = 1; ctx.fillStyle = model.background; ctx.fillRect(0, 0, width, height);
  const paint = gradientPaint(ctx, width, height, model, phase, reducedFlash);
  mirroredLayers(ctx, width, height, config, (drawWidth, drawHeight) => drawLayer(ctx, drawWidth, drawHeight, frequency, wave, config, paint, peaks, phase));
  ctx.globalAlpha = 1;
}

export function drawMirroredImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, config: VisualizerConfig, phase = 0, reducedFlash = false) {
  const model = resolveVisualizerColors(config);
  const stops = animatedVisualizerStops(model, phase, reducedFlash);
  ctx.fillStyle = model.background;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "screen";
  if (!reducedFlash && model.cycleMode === "hue") ctx.filter = `hue-rotate(${phase / model.cycleSeconds * 360}deg)`;
  mirroredLayers(ctx, width, height, config, (drawWidth, drawHeight) => ctx.drawImage(image, 0, 0, drawWidth, drawHeight));
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  if (!reducedFlash && model.cycleMode === "sequence" && stops[0]) {
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = stops[0].color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
