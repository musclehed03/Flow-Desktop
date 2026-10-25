import { useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setNativeWindowBackground } from "./nativeWindowAppearance";
import { IS_MACOS_RUNTIME } from "./platform";
import { logToBackend } from "./diagnostics";
import { SETTINGS } from "./settings/schema";
import {
  DEFAULT_THEME,
  isThemeVariant,
  parseCustomThemes,
  resolveTheme,
  themeCssVariables,
  type CustomThemeDefinition,
  type ThemeVariant,
} from "./themes";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import { COLOR_BLIND_PALETTES, resolveColorBlindPalette } from "./colorBlindPalettes";

export function useTheme() {
  const themeId = useAppSettingsStore((state) => state.values[SETTINGS.THEME_ID] ?? "default");
  const variantValue = useAppSettingsStore((state) => state.values[SETTINGS.THEME_VARIANT] ?? "dark");
  const serializedCustomThemes = useAppSettingsStore((state) => state.values[SETTINGS.CUSTOM_THEMES] ?? "[]");
  const setSettingValue = useAppSettingsStore((state) => state.setSettingValue);
  const variant: ThemeVariant = isThemeVariant(variantValue) ? variantValue : "dark";
  const customThemes = useMemo(
    () => parseCustomThemes(serializedCustomThemes),
    [serializedCustomThemes],
  );
  const theme = useMemo(
    () => resolveTheme(themeId, customThemes),
    [customThemes, themeId],
  );

  return {
    theme,
    themeId,
    variant,
    customThemes,
    setTheme: (nextThemeId: string) => setSettingValue(SETTINGS.THEME_ID, nextThemeId),
    setVariant: (nextVariant: ThemeVariant) => setSettingValue(SETTINGS.THEME_VARIANT, nextVariant),
    saveCustomThemes: (themes: CustomThemeDefinition[]) =>
      setSettingValue(SETTINGS.CUSTOM_THEMES, JSON.stringify(themes)),
  };
}

export function ThemeController() {
  const { theme, variant } = useTheme();
  const colorBlindEnabled = useAppSettingsStore((state) => state.values[SETTINGS.COLOR_BLIND_ENABLED] === "true");
  const paletteValue = useAppSettingsStore((state) => state.values[SETTINGS.COLOR_BLIND_PALETTE] ?? "deuteranomaly");

  useEffect(() => {
    const root = document.documentElement;
    const palette = resolveColorBlindPalette(paletteValue);
    const effectiveVariant: ThemeVariant = palette === "achromatopsia" && colorBlindEnabled
      ? "light"
      : variant;
    const paletteVariant = effectiveVariant === "light" ? "light" : "dark";
    const colors = colorBlindEnabled
      ? COLOR_BLIND_PALETTES[palette][paletteVariant]
      : theme.variants[effectiveVariant] ?? DEFAULT_THEME.variants.dark;
    const variables = themeCssVariables(colors, effectiveVariant);
    const priority = colorBlindEnabled ? "important" : "";
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value, priority));
    root.style.setProperty("--dd-focus", colors.primary, priority);
    root.style.setProperty("--color-interactive-accent", colors.primary, priority);
    root.dataset.theme = theme.id;
    root.dataset.themeVariant = effectiveVariant;
    if (colorBlindEnabled) root.dataset.colorBlindPalette = palette;
    else delete root.dataset.colorBlindPalette;
    root.style.colorScheme = effectiveVariant === "light" ? "light" : "dark";

    if (!IS_MACOS_RUNTIME) return;
    let disposed = false;
    const appWindow = getCurrentWindow();
    void appWindow.setTheme(effectiveVariant === "light" ? "light" : "dark")
      .then(async () => {
        if (!disposed) await setNativeWindowBackground(colors.background);
      })
      .catch((cause) => {
        void logToBackend("warn", "native window appearance failed", { cause: String(cause) });
      });
    return () => { disposed = true; };
  }, [colorBlindEnabled, paletteValue, theme, variant]);

  return null;
}
