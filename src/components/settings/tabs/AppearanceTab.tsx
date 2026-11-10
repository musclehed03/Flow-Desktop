import { useState } from "react";
import { Plus } from "lucide-react";
import { CustomThemeEditor } from "../../theme/CustomThemeEditor";
import { ThemePreview } from "../../theme/ThemePreview";
import { SearchInput } from "../../ui/SearchInput";
import { Button } from "../../ui/Button";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { useBoolPref } from "../../../lib/usePreference";
import { SETTINGS } from "../../../lib/settings/schema";
import { getString } from "../../../lib/i18n/index";
import { WHEEL_GROUP_ORDER, type WheelGroup } from "../../../lib/deviantWheel";
import {
  BUILTIN_THEMES,
  THEME_VARIANTS,
  createCustomTheme,
  type CustomThemeDefinition,
} from "../../../lib/themes";
import { useTheme } from "../../../lib/useTheme";
import { IS_LINUX_RUNTIME } from "../../../lib/platform";
import { GraphicsCompatibilitySection } from "../GraphicsCompatibilitySection";

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
  const [expressiveSliders, setExpressiveSliders] = useBoolPref(SETTINGS.EXPRESSIVE_SLIDERS_ENABLED, true);
  const [wheelGroup, setWheelGroup] = useState<"all" | WheelGroup>("all");
  const [wheelSearch, setWheelSearch] = useState("");

  const standardThemes = BUILTIN_THEMES.filter((theme) => !theme.group);
  const wheelQuery = wheelSearch.trim().toLowerCase();
  const matchesSearch = (name: string): boolean =>
    wheelQuery === "" || name.toLowerCase().includes(wheelQuery);
  const curatedThemes = BUILTIN_THEMES.filter(
    (theme) => theme.group === "curated" && matchesSearch(theme.name),
  );
  const wheelThemes = BUILTIN_THEMES.filter(
    (theme) =>
      theme.group?.startsWith("wheel-") &&
      (wheelGroup === "all" || theme.group === `wheel-${wheelGroup}`) &&
      matchesSearch(theme.name),
  );
  const deviantThemes = [...curatedThemes, ...wheelThemes];

  const createTheme = () => {
    const id = `custom-${crypto.randomUUID()}`;
    setEditingTheme(createCustomTheme(id, getString("theme_new_name")));
  };

  const saveTheme = async (theme: CustomThemeDefinition) => {
    const nextThemes = customThemes.some((item) => item.id === theme.id)
      ? customThemes.map((item) => item.id === theme.id ? theme : item)
      : [...customThemes, theme];
    const saved = await saveCustomThemes(nextThemes);
    if (saved) {
      await setTheme(theme.id);
      setEditingTheme(null);
    }
  };

  const deleteTheme = async (theme: CustomThemeDefinition) => {
    if (!window.confirm(getString("theme_delete_confirm", theme.name))) return;
    const saved = await saveCustomThemes(customThemes.filter((item) => item.id !== theme.id));
    if (saved && themeId === theme.id) await setTheme("default");
  };

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-chrome-neutral-100">{getString("settings_appearance")}</h1>
          <p className="mt-2 text-sm text-chrome-neutral-400">{getString("theme_page_description")}</p>
        </div>
        <Button onClick={createTheme} disabled={customThemes.length >= 24}>
          <Plus size={17} />
          {getString("theme_create")}
        </Button>
      </div>

      <section className="mt-8 rounded-2xl border border-chrome-neutral-800 bg-surface-container-low p-5">
        <div>
          <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_variant")}</h2>
          <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_variant_description")}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {THEME_VARIANTS.map((item) => (
            <Button key={item} variant={variant === item ? "primary" : "secondary"} onClick={() => void setVariant(item)}>
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

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_presets")}</h2>
            <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_presets_description")}</p>
          </div>
          <span className="font-mono text-xs text-chrome-neutral-500">{standardThemes.length}</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {standardThemes.map((theme) => (
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

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_wheel_title")}</h2>
            <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_wheel_description")}</p>
          </div>
          <span className="font-mono text-xs text-chrome-neutral-500">{getString("theme_wheel_count", deviantThemes.length)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant={wheelGroup === "all" ? "primary" : "secondary"} onClick={() => setWheelGroup("all")}>
            {getString("theme_wheel_group_all")}
          </Button>
          {WHEEL_GROUP_ORDER.map((group) => (
            <Button
              key={group}
              variant={wheelGroup === group ? "primary" : "secondary"}
              onClick={() => setWheelGroup(group)}
            >
              {getString(`theme_wheel_group_${group}` as Parameters<typeof getString>[0])}
            </Button>
          ))}
        </div>
        <SearchInput
          containerClassName="mt-3"
          value={wheelSearch}
          onChange={(event) => setWheelSearch(event.target.value)}
          placeholder={getString("theme_wheel_search_placeholder")}
          aria-label={getString("theme_wheel_search_placeholder")}
        />
        {deviantThemes.length === 0 ? (
          <p className="mt-4 text-sm text-chrome-neutral-400">{getString("theme_wheel_no_results")}</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {deviantThemes.map((theme) => (
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
        )}
      </section>

      {customThemes.length > 0 && (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-chrome-neutral-200">{getString("theme_custom")}</h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">{getString("theme_custom_description")}</p>
            </div>
            <span className="font-mono text-xs text-chrome-neutral-500">{customThemes.length}/24</span>
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
                onEdit={() => setEditingTheme(theme)}
                onDelete={() => void deleteTheme(theme)}
              />
            ))}
          </div>
        </section>
      )}

      {editingTheme && (
        <CustomThemeEditor
          theme={editingTheme}
          onCancel={() => setEditingTheme(null)}
          onSave={(theme) => void saveTheme(theme)}
        />
      )}
    </div>
  );
}
