import { describe, expect, it, vi } from "vitest";
import { createCustomTheme } from "./themes";
import { mergeImportedThemes, parseThemeFile, serializeThemeFile } from "./themePresetFile";

describe("theme preset files", () => {
  it("round-trips a theme with region effects", () => {
    const theme = createCustomTheme("custom-export", "Night Shift");
    theme.appearance.regions.frame.gradient.enabled = true;
    theme.appearance.regions.frame.effect = "flame";
    expect(parseThemeFile(serializeThemeFile([theme]))).toEqual([theme]);
  });

  it("rejects malformed files and replaces same-name imports", () => {
    expect(() => parseThemeFile('{"format":"wrong"}')).toThrow("theme_file_invalid");
    vi.stubGlobal("crypto", { randomUUID: () => "imported" });
    const original = createCustomTheme("custom-one", "Same");
    const incoming = createCustomTheme("custom-two", "same");
    incoming.variants.dark.primary = "#123456";
    const merged = mergeImportedThemes([original], [incoming]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe("custom-one");
    expect(merged[0]!.variants.dark.primary).toBe("#123456");
    vi.unstubAllGlobals();
  });
});
