import { parseCustomThemes, type CustomThemeDefinition } from "./themes";

export const THEME_FILE_FORMAT = "dollhouse-deviants-theme";
export const THEME_FILE_VERSION = 1;
const MAX_THEME_FILE_BYTES = 2 * 1024 * 1024;

interface ThemeFile {
  format: typeof THEME_FILE_FORMAT;
  version: typeof THEME_FILE_VERSION;
  exportedAt: string;
  themes: CustomThemeDefinition[];
}

export function serializeThemeFile(themes: readonly CustomThemeDefinition[]): string {
  const file: ThemeFile = {
    format: THEME_FILE_FORMAT,
    version: THEME_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    themes: [...themes],
  };
  return JSON.stringify(file, null, 2);
}

export function parseThemeFile(text: string): CustomThemeDefinition[] {
  if (new TextEncoder().encode(text).byteLength > MAX_THEME_FILE_BYTES) throw new Error("theme_file_too_large");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("theme_file_invalid");
  const file = parsed as Partial<ThemeFile>;
  if (file.format !== THEME_FILE_FORMAT || file.version !== THEME_FILE_VERSION || !Array.isArray(file.themes)) {
    throw new Error("theme_file_invalid");
  }
  const themes = parseCustomThemes(JSON.stringify(file.themes));
  if (themes.length !== file.themes.length || themes.length === 0) throw new Error("theme_file_invalid");
  return themes;
}

export function mergeImportedThemes(current: readonly CustomThemeDefinition[], incoming: readonly CustomThemeDefinition[]) {
  const merged = [...current];
  for (const theme of incoming) {
    const existing = merged.findIndex((item) => item.name.trim().toLocaleLowerCase() === theme.name.trim().toLocaleLowerCase());
    const imported = { ...structuredClone(theme), id: existing >= 0 ? merged[existing]!.id : `custom-${crypto.randomUUID()}` };
    if (existing >= 0) merged[existing] = imported;
    else if (merged.length < 24) merged.push(imported);
  }
  return merged;
}

export function downloadThemeFile(themes: readonly CustomThemeDefinition[], filename = "dollhouse-deviants-theme.ddtheme") {
  const url = URL.createObjectURL(new Blob([serializeThemeFile(themes)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
