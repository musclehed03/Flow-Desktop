import { useState, type RefObject } from "react";
import { getString } from "../../lib/i18n/index";
import { useLivePreviewHistory } from "../../lib/livePreviewHistory";
import {
  THEME_VARIANTS,
  type CustomThemeDefinition,
  type ThemeColors,
  type ThemeVariant,
} from "../../lib/themes";
import { Button } from "../ui/Button";
import { DockablePanel } from "../ui/DockablePanel";

interface CustomThemeEditorProps {
  theme: CustomThemeDefinition;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChange: (theme: CustomThemeDefinition) => void;
}

const colorFields: { key: keyof ThemeColors; labelKey: Parameters<typeof getString>[0] }[] = [
  { key: "primary", labelKey: "theme_color_primary" },
  { key: "onPrimary", labelKey: "theme_color_on_primary" },
  { key: "secondary", labelKey: "theme_color_secondary" },
  { key: "background", labelKey: "theme_color_background" },
  { key: "surface", labelKey: "theme_color_surface" },
  { key: "surfaceContainerLow", labelKey: "theme_color_surface_low" },
  { key: "surfaceContainer", labelKey: "theme_color_surface_container" },
  { key: "surfaceContainerHigh", labelKey: "theme_color_surface_high" },
  { key: "surfaceContainerHighest", labelKey: "theme_color_surface_highest" },
  { key: "onSurface", labelKey: "theme_color_text" },
  { key: "onSurfaceVariant", labelKey: "theme_color_muted_text" },
  { key: "outline", labelKey: "theme_color_outline" },
  { key: "error", labelKey: "theme_color_error" },
];

export function CustomThemeEditor({ theme, openerRef, onClose, onChange }: CustomThemeEditorProps) {
  const { value, apply, undo, reset, canUndo } = useLivePreviewHistory(theme, onChange);
  const [variant, setVariant] = useState<ThemeVariant>("dark");

  const setColor = (key: keyof ThemeColors, color: string) => apply({
    ...value,
    variants: { ...value.variants, [variant]: { ...value.variants[variant], [key]: color } },
  });

  return (
    <DockablePanel panelId="theme-editor" title={getString("theme_editor_title")} description={getString("theme_editor_description")}
      openerRef={openerRef} onClose={onClose} onUndo={undo} onReset={reset} canUndo={canUndo}>
      <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant" htmlFor="theme-name">{getString("theme_name")}</label>
      <input id="theme-name" value={value.name} maxLength={48}
        onChange={(event) => apply({ ...value, name: event.target.value })}
        className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />

      <div className="mt-6 flex gap-2" role="tablist" aria-label={getString("theme_variant") }>
        {THEME_VARIANTS.map((item) => (
          <Button key={item} role="tab" aria-selected={variant === item} variant={variant === item ? "primary" : "secondary"} onClick={() => setVariant(item)}>
            {getString(`theme_variant_${item}` as Parameters<typeof getString>[0])}
          </Button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3">
        {colorFields.map((field) => {
          const color = value.variants[variant][field.key];
          const isHex = /^#[0-9a-f]{6}$/i.test(color);
          return (
            <label key={field.key} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface">
              <input type="color" value={isHex ? color : value.variants[variant].surface} onChange={(event) => setColor(field.key, event.target.value)} className="h-9 w-11 cursor-pointer rounded-md border-0 bg-transparent" />
              <span className="min-w-0 flex-1 truncate">{getString(field.labelKey)}</span>
              <span className="font-mono text-xs text-on-surface-variant">{color}</span>
            </label>
          );
        })}
      </div>
    </DockablePanel>
  );
}

export default CustomThemeEditor;
