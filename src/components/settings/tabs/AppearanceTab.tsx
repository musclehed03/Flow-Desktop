import { SensorySettings } from "../../accessibility/SensorySettings";
import { lazy, Suspense, useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { ThemeFileSection } from "../../theme/ThemeFileSection";
import { ThemePreview } from "../../theme/ThemePreview";
import { Button } from "../../ui/Button";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { useBoolPref } from "../../../lib/usePreference";
import { SETTINGS } from "../../../lib/settings/schema";
import { confirmAction } from "../../../lib/dialogs";
import { getString } from "../../../lib/i18n/index";
import {
  BUILTIN_THEMES,
  MAX_CUSTOM_THEMES,
  THEME_VARIANTS,
  createCustomTheme,
  parseCustomThemes,
  type CustomThemeDefinition,
} from "../../../lib/themes";
import { THEME_FILE_ID } from "../../../lib/themeFile";
import { useTheme } from "../../../lib/useTheme";
import { useThemeTransfer } from "../../../lib/useThemeTransfer";
import { IS_LINUX_RUNTIME } from "../../../lib/platform";
import { GraphicsCompatibilitySection } from "../GraphicsCompatibilitySection";
import { getSettingValue } from "../../../store/useAppSettingsStore";
import { mergeImportedThemes, parseThemeFile } from "../../../lib/themePresetFile";
import { useUiStore } from "../../../store/useUiStore";
import { SettingItem } from "../SettingItem";
import { SettingsGroup } from "../SettingsGroup";

const CustomThemeEditor = lazy(() => import("../../theme/CustomThemeEditor"));

export function AppearanceTab() {
  const {
    themeId,
    variant,
    customThemes,
    setTheme,
    setVariant,
    saveCustomThemes,
  } = useTheme();
  const [editingTheme, setEditingTheme] = useState<CustomThemeDefinition | null>(null);
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [expressiveSliders, setExpressiveSliders] = useBoolPref(SETTINGS.EXPRESSIVE_SLIDERS_ENABLED, true);
  const [tooltips, setTooltips] = useBoolPref(SETTINGS.TOOLTIPS_ENABLED, true);
  const { exportThemes } = useThemeTransfer();
  const usingThemeFile = themeId === THEME_FILE_ID;

  const openEditor = (theme: CustomThemeDefinition) => {
    editorOpenerRef.current = document.activeElement as HTMLElement | null;
    setEditingTheme(theme);
  };

  const createTheme = async () => {
    const id = `custom-${crypto.randomUUID()}`;
    const theme = createCustomTheme(id, getString("theme_new_name"));
    const saved = await saveCustomThemes([...customThemes, theme]);
    if (!saved) return;
    await setTheme(theme.id);
    openEditor(theme);
  };

  const previewTheme = (theme: CustomThemeDefinition) => {
    setEditingTheme(theme);
    if (!theme.name.trim()) return;
    const currentThemes = parseCustomThemes(getSettingValue(SETTINGS.CUSTOM_THEMES));
    const nextThemes = currentThemes.some((item) => item.id === theme.id)
      ? currentThemes.map((item) => item.id === theme.id ? theme : item)
      : [...currentThemes, theme];
    void saveCustomThemes(nextThemes);
    if (themeId !== theme.id) void setTheme(theme.id);
  };

  const deleteTheme = async (theme: CustomThemeDefinition) => {
    const confirmed = await confirmAction({
      title: getString("settings_custom_theme_delete_title", theme.name),
      message: getString("settings_custom_theme_delete_body"),
      confirmLabel: getString("delete"),
      destructive: true,
    });
    if (!confirmed) return;
    const saved = await saveCustomThemes(customThemes.filter((item) => item.id !== theme.id));
    if (saved && themeId === theme.id) await setTheme("default");
  };

  const duplicateTheme = async (theme: CustomThemeDefinition) => {
    if (customThemes.length >= MAX_CUSTOM_THEMES) return;
    const copy = { ...structuredClone(theme), id: `custom-${crypto.randomUUID()}`, name: `${theme.name} ${getString("theme_copy_suffix")}` };
    if (await saveCustomThemes([...customThemes, copy])) {
      await setTheme(copy.id);
      setEditingTheme(copy);
    }
  };

  const importThemes = async (file: File | undefined) => {
    if (!file) return;
    try {
      const merged = mergeImportedThemes(customThemes, parseThemeFile(await file.text()));
      await saveCustomThemes(merged);
      useUiStore.getState().showToast({ message: getString("theme_import_success"), variant: "success" });
    } catch {
      useUiStore.getState().showToast({ message: getString("theme_import_failed"), variant: "error" });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <SensorySettings />
      <div className="mt-6">
        <SettingsGroup title={getString("settings_group_guidance")}>
          <SettingItem title={getString("settings_tooltips")} description={getString("settings_tooltips_desc")}>
            <ToggleSwitch checked={tooltips} onChange={setTooltips} />
          </SettingItem>
        </SettingsGroup>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-chrome-neutral-100">{getString("settings_appearance")}</h1>
          <p className="mt-2 text-sm text-chrome-neutral-400">{getString("theme_page_description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importRef} type="file" accept=".ddtheme,.json,application/json" className="hidden" onChange={(event) => void importThemes(event.target.files?.[0])} />
          <Button variant="secondary" onClick={() => importRef.current?.click()}><Upload size={17} />{getString("theme_import")}</Button>
          <Button variant="secondary" onClick={() => void exportThemes(customThemes)} disabled={customThemes.length === 0}>
            <Download size={17} />
            {getString("theme_export_all")}
          </Button>
          <Button onClick={() => void createTheme()} disabled={customThemes.length >= MAX_CUSTOM_THEMES}><Plus size={17} />{getString("theme_create")}</Button>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5">
        <div>
          <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_variant")}</h2>
          <p className="mt-1 text-sm text-chrome-neutral-400">
            {getString(usingThemeFile ? "theme_variant_from_file" : "theme_variant_description")}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {THEME_VARIANTS.map((item) => (
            <Button key={item} variant={variant === item ? "primary" : "secondary"} onClick={() => void setVariant(item)} disabled={usingThemeFile}>
              {getString(`theme_variant_${item}` as Parameters<typeof getString>[0])}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-8 flex items-center justify-between gap-6 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-chrome-neutral-200">{getString("settings_expressive_sliders")}</h2>
          <p className="mt-1 text-sm text-chrome-neutral-400">{getString("settings_expressive_sliders_desc")}</p>
        </div>
        <ToggleSwitch checked={expressiveSliders} onChange={setExpressiveSliders} />
      </section>

      {IS_LINUX_RUNTIME && <GraphicsCompatibilitySection />}

      <ThemeFileSection />

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_presets")}</h2>
            <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_presets_description")}</p>
          </div>
          <span className="font-mono text-xs text-chrome-neutral-500">{BUILTIN_THEMES.length}</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {BUILTIN_THEMES.map((theme) => (
            <ThemePreview
              key={theme.id}
              name={theme.name}
              description={getString(theme.descriptionKey)}
              colors={theme.variants[variant]}
              selected={themeId === theme.id}
              selectLabel={getString("theme_select")}
              editLabel={getString("theme_edit")}
              deleteLabel={getString("theme_delete")}
              onSelect={() => void setTheme(theme.id)}
            />
          ))}
        </div>
      </section>

      {customThemes.length > 0 && (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_custom")}</h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_custom_description")}</p>
            </div>
            <span className="font-mono text-xs text-chrome-neutral-500">{customThemes.length}/{MAX_CUSTOM_THEMES}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {customThemes.map((theme) => (
              <ThemePreview
                key={theme.id}
                name={theme.name}
                description={getString("theme_custom_card_description")}
                colors={theme.variants[variant]}
                selected={themeId === theme.id}
                custom
                selectLabel={getString("theme_select")}
                editLabel={getString("theme_edit")}
                deleteLabel={getString("theme_delete")}
                onSelect={() => void setTheme(theme.id)}
                onEdit={() => openEditor(theme)}
                onDelete={() => void deleteTheme(theme)}
              />
            ))}
          </div>
        </section>
      )}

      {editingTheme && (
        <Suspense fallback={<p role="status">{getString("panel_loading")}</p>}>
          <CustomThemeEditor key={editingTheme.id} theme={editingTheme} openerRef={editorOpenerRef}
            onClose={() => setEditingTheme(null)} onChange={previewTheme} onDuplicate={(value) => void duplicateTheme(value)} />
        </Suspense>
      )}
    </div>
  );
}
