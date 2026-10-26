import { createElement, useEffect, useMemo } from "react";
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
  themeRegionGradient,
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
    const appearance = "appearance" in theme ? theme.appearance : null;
    for (const region of ["frame", "buttons", "containers"] as const) {
      const style = appearance?.regions[region];
      root.dataset[`theme${region[0]!.toUpperCase()}${region.slice(1)}Effect` as keyof DOMStringMap] = style?.effect ?? "off";
      root.dataset[`theme${region[0]!.toUpperCase()}${region.slice(1)}Gradient` as keyof DOMStringMap] = style?.gradient.enabled ? "true" : "false";
      root.dataset[`theme${region[0]!.toUpperCase()}${region.slice(1)}Animation` as keyof DOMStringMap] = style?.gradient.animation ?? "off";
      if (style) {
        root.style.setProperty(`--theme-${region}-gradient`, themeRegionGradient(style));
        root.style.setProperty(`--theme-${region}-animation-seconds`, `${style.gradient.seconds}s`);
      } else {
        root.style.removeProperty(`--theme-${region}-gradient`);
        root.style.removeProperty(`--theme-${region}-animation-seconds`);
      }
    }
    const updateFocus = () => root.classList.toggle("theme-window-inactive", !document.hasFocus());
    updateFocus();
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);

    if (!IS_MACOS_RUNTIME) return () => {
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
    };
    let disposed = false;
    const appWindow = getCurrentWindow();
    void appWindow.setTheme(effectiveVariant === "light" ? "light" : "dark")
      .then(async () => {
        if (!disposed) await setNativeWindowBackground(colors.background);
      })
      .catch((cause) => {
        void logToBackend("warn", "native window appearance failed", { cause: String(cause) });
      });
    return () => {
      disposed = true;
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
    };
  }, [colorBlindEnabled, paletteValue, theme, variant]);

  return createElement("div", { className: "theme-ambient-layer", "aria-hidden": "true" });
}
