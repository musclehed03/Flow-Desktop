export const GRAPHIC_BAND_COUNTS = [10, 15, 31] as const;
export type GraphicBandCount = (typeof GRAPHIC_BAND_COUNTS)[number];
export type ParametricFilterType = "peaking" | "lowshelf" | "highshelf" | "lowpass" | "highpass" | "notch";

export interface ParametricEqBand {
  id: string;
  frequency: number;
  gain: number;
  q: number;
  type: ParametricFilterType;
}

export interface DynamicsConfig {
  preampDb: number;
  balance: number;
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  limiterEnabled: boolean;
}

export interface AudioProcessingConfig {
  enabled: boolean;
  mode: "graphic" | "parametric";
  bandCount: GraphicBandCount;
  graphicGains: Record<GraphicBandCount, number[]>;
  parametricBands: ParametricEqBand[];
  dynamics: DynamicsConfig;
}

const STANDARD_FREQUENCIES: Record<GraphicBandCount, number[]> = {
  10: [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
  31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
export const graphicFrequencies = (count: GraphicBandCount) => STANDARD_FREQUENCIES[count];
export const formatFrequency = (frequency: number) => frequency >= 1000 ? `${Number((frequency / 1000).toFixed(2))}k` : `${Number(frequency.toFixed(1))}`;
export const normalizeGraphicGains = (gains: readonly number[], count: GraphicBandCount) => graphicFrequencies(count).map((_, index) => clamp(gains[index] ?? 0, -15, 15));

export function resampleGraphicCurve(gains: readonly number[], from: GraphicBandCount, to: GraphicBandCount): number[] {
  const sourceFrequencies = graphicFrequencies(from);
  const source = normalizeGraphicGains(gains, from);
  return graphicFrequencies(to).map((frequency) => {
    if (frequency <= sourceFrequencies[0]!) return source[0]!;
    if (frequency >= sourceFrequencies[sourceFrequencies.length - 1]!) return source[source.length - 1]!;
    const upper = sourceFrequencies.findIndex((item) => item >= frequency);
    const lower = upper - 1;
    const position = (Math.log(frequency) - Math.log(sourceFrequencies[lower]!)) / (Math.log(sourceFrequencies[upper]!) - Math.log(sourceFrequencies[lower]!));
    return Number((source[lower]! + (source[upper]! - source[lower]!) * position).toFixed(2));
  });
}

export function defaultAudioProcessingConfig(): AudioProcessingConfig {
  return {
    enabled: false,
    mode: "graphic",
    bandCount: 10,
    graphicGains: { 10: Array(10).fill(0), 15: Array(15).fill(0), 31: Array(31).fill(0) },
    parametricBands: [
      { id: "low", frequency: 80, gain: 0, q: .8, type: "lowshelf" },
      { id: "body", frequency: 500, gain: 0, q: 1.2, type: "peaking" },
      { id: "presence", frequency: 3000, gain: 0, q: 1.2, type: "peaking" },
      { id: "air", frequency: 12000, gain: 0, q: .8, type: "highshelf" },
    ],
    dynamics: { preampDb: 0, balance: 0, compressorEnabled: false, compressorThreshold: -18, compressorRatio: 2, compressorAttack: .01, compressorRelease: .25, limiterEnabled: true },
  };
}

export function normalizeAudioProcessingConfig(input: unknown): AudioProcessingConfig {
  const fallback = defaultAudioProcessingConfig();
  if (!input || typeof input !== "object") return fallback;
  const value = input as Partial<AudioProcessingConfig>;
  const bandCount = GRAPHIC_BAND_COUNTS.includes(value.bandCount as GraphicBandCount) ? value.bandCount as GraphicBandCount : 10;
  const stored = value.graphicGains ?? fallback.graphicGains;
  const parametricBands = Array.isArray(value.parametricBands) ? value.parametricBands.slice(0, 31).flatMap((band, index) => {
    if (!band || typeof band !== "object") return [];
    const item = band as Partial<ParametricEqBand>;
    const types: ParametricFilterType[] = ["peaking", "lowshelf", "highshelf", "lowpass", "highpass", "notch"];
    return [{ id: typeof item.id === "string" ? item.id : `band-${index}`, frequency: clamp(Number(item.frequency), 20, 20000), gain: clamp(Number(item.gain), -15, 15), q: clamp(Number(item.q), .1, 18), type: types.includes(item.type as ParametricFilterType) ? item.type as ParametricFilterType : "peaking" }];
  }) : fallback.parametricBands;
  const dynamics = value.dynamics ?? fallback.dynamics;
  return {
    enabled: Boolean(value.enabled), mode: value.mode === "parametric" ? "parametric" : "graphic", bandCount,
    graphicGains: { 10: normalizeGraphicGains(stored[10] ?? [], 10), 15: normalizeGraphicGains(stored[15] ?? [], 15), 31: normalizeGraphicGains(stored[31] ?? [], 31) },
    parametricBands: parametricBands.length ? parametricBands : fallback.parametricBands,
    dynamics: {
      preampDb: clamp(Number(dynamics.preampDb), -15, 15), balance: clamp(Number(dynamics.balance), -1, 1),
      compressorEnabled: Boolean(dynamics.compressorEnabled), compressorThreshold: clamp(Number(dynamics.compressorThreshold), -60, 0), compressorRatio: clamp(Number(dynamics.compressorRatio), 1, 20), compressorAttack: clamp(Number(dynamics.compressorAttack), 0, 1), compressorRelease: clamp(Number(dynamics.compressorRelease), .01, 1), limiterEnabled: dynamics.limiterEnabled !== false,
    },
  };
}

export function parseAutoEq(text: string): ParametricEqBand[] {
  const bands: ParametricEqBand[] = [];
  const graphic = text.match(/GraphicEQ:\s*(.+)/i)?.[1];
  if (graphic) {
    for (const pair of graphic.split(";")) {
      const [frequency, gain] = pair.trim().split(/\s+/).map(Number);
      if (Number.isFinite(frequency) && Number.isFinite(gain)) bands.push({ id: `autoeq-${bands.length}`, frequency: clamp(frequency!, 20, 20000), gain: clamp(gain!, -15, 15), q: 1.41, type: "peaking" });
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/Filter\s+\d+:\s+ON\s+(PK|LSC?|HSC?|LP|HP|NO)\s+Fc\s+([\d.]+)\s+Hz(?:\s+Gain\s+([+-]?[\d.]+)\s+dB)?(?:\s+Q\s+([\d.]+))?/i);
      if (!match) continue;
      const type: Record<string, ParametricFilterType> = { PK: "peaking", LS: "lowshelf", LSC: "lowshelf", HS: "highshelf", HSC: "highshelf", LP: "lowpass", HP: "highpass", NO: "notch" };
      bands.push({ id: `autoeq-${bands.length}`, type: type[match[1]!.toUpperCase()] ?? "peaking", frequency: clamp(Number(match[2]), 20, 20000), gain: clamp(Number(match[3] ?? 0), -15, 15), q: clamp(Number(match[4] ?? 1.41), .1, 18) });
    }
  }
  if (!bands.length) throw new Error("autoeq_invalid");
  return bands.slice(0, 31);
}

export function responsePath(config: AudioProcessingConfig, width = 640, height = 140): string {
  const points = Array.from({ length: 96 }, (_, index) => {
    const frequency = 20 * Math.pow(1000, index / 95);
    let gain = config.dynamics.preampDb;
    if (config.mode === "graphic") {
      const source = graphicFrequencies(config.bandCount);
      const values = config.graphicGains[config.bandCount];
      const nearest = source.reduce((best, item, itemIndex) => Math.abs(Math.log(item / frequency)) < Math.abs(Math.log(source[best]! / frequency)) ? itemIndex : best, 0);
      gain += values[nearest] ?? 0;
    } else for (const band of config.parametricBands) gain += band.gain * Math.exp(-Math.pow(Math.log2(frequency / band.frequency), 2) * band.q);
    return `${index ? "L" : "M"}${(index / 95 * width).toFixed(1)},${(height / 2 - clamp(gain, -18, 18) / 36 * height).toFixed(1)}`;
  });
  return points.join(" ");
}
