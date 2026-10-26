import { parseVisualizerPresets, type VisualizerPreset } from "./visualizer";

export const DDVIZ_FORMAT = "dollhouse-deviants-visualizer";
export const DDVIZ_VERSION = 1;
export const DDVIZ_MAX_BYTES = 2 * 1024 * 1024;

interface DdvizPackage {
  format: typeof DDVIZ_FORMAT;
  version: typeof DDVIZ_VERSION;
  exportedAt: string;
  presets: VisualizerPreset[];
}

export function encodeDdviz(presets: VisualizerPreset[], exportedAt = new Date().toISOString()): string {
  const data: DdvizPackage = {
    format: DDVIZ_FORMAT,
    version: DDVIZ_VERSION,
    exportedAt,
    presets: parseVisualizerPresets(JSON.stringify(presets)),
  };
  return JSON.stringify(data, null, 2);
}

export function parseDdviz(raw: string): VisualizerPreset[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("invalid-json"); }
  if (!value || typeof value !== "object") throw new Error("invalid-package");
  const data = value as Partial<DdvizPackage>;
  if (data.format !== DDVIZ_FORMAT || data.version !== DDVIZ_VERSION || !Array.isArray(data.presets)) {
    throw new Error("unsupported-package");
  }
  return parseVisualizerPresets(JSON.stringify(data.presets));
}

export async function readDdvizFile(file: File): Promise<VisualizerPreset[]> {
  if (file.size > DDVIZ_MAX_BYTES) throw new Error("file-too-large");
  return parseDdviz(await file.text());
}

export function mergeVisualizerPresets(current: VisualizerPreset[], incoming: VisualizerPreset[]): VisualizerPreset[] {
  const merged = new Map(current.map((preset) => [preset.name.toLowerCase(), preset]));
  incoming.forEach((preset) => merged.set(preset.name.toLowerCase(), preset));
  return [...merged.values()].slice(0, 100);
}

export function downloadDdviz(presets: VisualizerPreset[], filename = "dollhouse-deviants-presets.ddviz") {
  const url = URL.createObjectURL(new Blob([encodeDdviz(presets)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
