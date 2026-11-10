# Posh Luxe themes for Flow — wiring note

Palette: **Posh Luxe (Posh/Mature App Palette)** — source of truth
`posh-mature-palette.css`, branch `origin/posh-mature-app-palette`, commit
`4927646` ("Add The Posh/Mature App Palette tokens"). Variant A picked
Nov 1, 2026, reconfirmed Nov 5. Date built: 2026-11-10. Validated: all
files parse with Flow's own `parseThemeFile` loader and round-trip clean
(12/12 tests, run against copies of `themes.ts` / `themePresetFile.ts` in
`/tmp`, so the review clone's merging tree was never touched).

## Files in this folder

| File | Contents |
|---|---|
| `posh-luxe-variant-a.ddtheme` | **Variant A — Velvet Boudoir & Brushed Gold** (the picked one). Dark + light + AMOLED in one file. |
| `posh-luxe-variant-b.ddtheme` | Variant B — Parisian Midnight & Chrome |
| `posh-luxe-variant-c.ddtheme` | Variant C — Victorian Astral & Antique Gold |
| `posh-luxe-variant-d.ddtheme` | Variant D — Black Diamond & Platinum |
| `posh-luxe-all-variants.ddtheme` | All four variants in one import |

Format: Flow's own `.ddtheme` (`format: "dollhouse-deviants-theme"`,
`version: 1`) — the Block F theme-studio import/export format. Each file
also carries a top-level `_meta` block (palette, source commit, date, and
the notes below); the importer ignores it.

## How to load it into Flow

1. Open Flow → **Settings → Appearance**.
2. Click **Import** (the Upload button, top right of the Appearance tab)
   and pick `posh-luxe-all-variants.ddtheme` (or a single-variant file).
   The file picker accepts `.ddtheme` / `.json`. A success toast confirms
   the import; a bad file shows the import-failed toast.
3. The four themes appear in the theme list as custom themes
   ("Posh Luxe — Velvet Boudoir", etc.). Pick one, then pick its variant
   (light / dark / AMOLED) with the normal variant control.
4. Re-importing the same file replaces the theme of the same name instead
   of duplicating it (import matches on name, case-insensitive). Max 24
   custom themes total; these four leave room for 20 more.
5. Export works the same way back out (Export All button) — the themes
   round-trip through `serializeThemeFile` unchanged.

## Token mapping (what each palette token becomes in Flow)

| Posh token | Flow token | Notes |
|---|---|---|
| `--posh-primary` | `primary` | A dark `#ad3375` / light `#7c254f` (the picked primaries) |
| `--posh-primary-text` | `onPrimary` | `#ffffff` in all variants |
| `--posh-secondary` | `secondary` | Dark teal / greenish-navy per variant (never electric cyan, per the palette direction) |
| `--posh-bg` | `background` | |
| `--posh-card` | `surface` + `surfaceContainer` | |
| `--posh-bg2` / `--posh-card2` | folded into the container shades | See below |
| `--posh-text` | `onSurface` | |
| `--posh-muted` | `onSurfaceVariant` | |
| `--posh-border` | `outline` | |
| `--posh-metal-1/2/3` | region gradient **stops** (see "Metallics") | Darkest → mid → brightest |
| — (no palette token) | `error` | **Derived**, wine-rose family (`#e0788f` dark, deep wine per variant light). The palette defines no error red; this is the one invented color and it stays inside the orchid/wine family. |
| — | `surfaceContainerLow/High/Highest` | Resolved from Flow's own `expandPalette()` color-mix formulas, so the files carry plain hex, not `color-mix()` strings. |
| — | `amoled` variant | Dark seed with `#000000` background / `#080808` surface and Flow's fixed AMOLED container shades. |

Light variants reuse the **dark** metal ramp — the palette defines no
light metal tokens. The ornament (corners / curl / buckle-brace) is
per-variant markup in the website, not a theme token; it is named in each
file's `_meta` and in the variant list above.

## Metallics — what the format can and cannot express

The theme format's only dimensional tool is the per-region gradient
(`appearance.regions.{frame,buttons,containers}.gradient`): a linear
gradient with 2–10 hex stops, an angle, and an optional `fade`/`shift`
animation, plus an `effect` (`flame`/`swirl`/`fire`/`ice`/`rain`/`snow`/
`off`). There is **no true metallic-shift field** — no per-pixel gleam,
no light-source parameter, no pinstripe layer.

What I did with that:

- Every region's gradient **stops are the variant's metal ramp**
  (metal-1 darkest → metal-2 → metal-3 brightest), **angle 45°** — the
  Metallic light-source SOP's northeast/sunrise emittance point, gleam
  inside on the upper-right/east side, shadow lower-left/west.
- Gradients are **`enabled: false`** on all three regions, effects `off`,
  animation `off`. Deliberate: the palette rule is metal ONLY as a 1px
  pinstripe + one small ornament. Enabling the gradient would wash whole
  regions (frame / all buttons / all containers) in metal and break that
  rule. The stops stay in the file as the dimensional metal data for the
  code that will render the pinstripe.
- The **pinstripe glow SOP** (5-layer crisp pinstripe, 0.25px steps to
  1.25px, blur 0, odd counts only; white ivory→Bristol→gleaming, pink
  `#a31356`→`#e91a7c`→`#FF1E89`, cyan `#00707e`→`#00c2dc`→`#00E5FF`)
  is **not expressible in the theme format at all** — there is no
  text-shadow / multi-layer field. It lives in Flow's CSS as the existing
  Deviants text-accent exception, not in the theme file. Do not fake it
  with a gradient or effect; it would do nothing or the wrong thing.

## Colorblind palettes — how this theme interacts

Selecting a typed colorblind palette in Flow **replaces the theme's
colors entirely** (`useTheme.ts`: when Color Blind Support is on, the
active palette's fixed light/dark set is used instead of the theme's
variants). That is existing, correct behavior and this theme does not
break it:

- The Posh hues are **not** remapped per colorblind type — the fixed
  typed palettes (deuteranomaly, protanomaly, deuteranopia, protanopia,
  tritanomaly, tritanopia, achromatopsia) take over as designed.
- **Achromatopsia / grayscale (Day):** the fixed achromatopsia set is a
  pure-grayscale ramp with bold contrast, so the UI stays fully usable
  in grayscale + high contrast while the palette is on. The Posh theme
  itself was also built so meaning never rides on color alone (borders,
  labels, line styles) — that carries over whenever the theme is active.
- No action needed: turn Color Blind Support on and the Posh theme steps
  aside; turn it off and Posh returns. If a future change wants the
  Posh *hues* remapped per colorblind type instead of replaced, that is
  a code change in `colorBlindPalettes.ts` / `useTheme.ts`, not a theme
  file change.

## Gaps the format cannot express (do not fake these)

1. **True metallic shift** — the 360° gleam-inside-the-color, light-from-
   the-east rendering. The format has no light-source or shift field.
   The 45° metal stops are the closest it gets.
2. **Pinstripe glow layers** — no multi-layer text effect field.
3. **Per-variant ornaments** (corners / curl / buckle-brace) — markup,
   not theme data.
4. **The 1px metal pinstripe itself** — no border-gradient token in the
   theme format; it must be drawn by CSS from the metal stops.

## Making Variant A the default Deviant theme (after the sync lands)

Do this in code, not in a theme file — an imported custom theme can never
be the out-of-the-box default:

1. In the fork's `src/lib/themes.ts`, add a `PaletteSeed` for Posh Luxe
   Variant A (dark seed `primary #ad3375`, light seed `primary #7c254f`,
   the seeds above) to the `seeds` array, or promote it to `DEFAULT_THEME`
   if it should replace Flow Default for Deviants builds. Keep the
   existing built-ins; add, don't replace, unless she says so.
2. Keep `expandPalette()` as-is — the container math in these files
   already matches it, so the built-in and the import will agree.
3. Add the metal ramp + 45° angle as code constants next to the seed so
   the 1px pinstripe (`posh-metal-line` equivalent) can be drawn from the
   active theme instead of hardcoded website CSS.
4. Do **not** do this on the sync branch — land it after the upstream
   sync is green, on `deviants-tuned`, so it doesn't collide with the
   merge. Then re-export the built-in as a `.ddtheme` to confirm the
   import and the built-in produce identical colors.
5. Version stays `0.1.0-beta2`; no version bump for a theme addition.
