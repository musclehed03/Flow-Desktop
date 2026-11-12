# Upstream sync rules — what the nightly sync bot must know

This file is the memory of the nightly upstream-sync bot. The bot reads it
every run, before it touches anything. If a protected area changes, update
this file in the same commit — a rule the bot cannot see is a rule that does
not exist.

Upstream is Flow-Tube/Flow-Desktop (`main`). Our line is `deviants-tuned`
(Sonja's fork, musclehed03/Flow-Desktop). The bot keeps the two close so a
big separation never builds up again. It never decides alone what Sonja
keeps: it drafts, tests, and routes everything for review.

## How a run works

1. Fetch `origin` and `upstream` in the review clone.
2. Cut a scratch branch `sync/nightly-YYYY-MM-DD` from `origin/deviants-tuned`.
3. Merge `upstream/main` into the scratch branch. Nothing else.
4. Run the quality gates (see below) after every merge attempt and after
   every conflict draft.
5. Produce one of the three outcomes in `## Outcomes`. Never anything else.

## Hard rules — no exceptions, no judgment calls

- NEVER auto-merge or push into `deviants-tuned`, `main`, or any tracked
  branch. The bot only ever writes scratch branches (`sync/nightly-*`) and
  bundle files. Sonja pushes and merges by hand.
- NEVER force-push. Anywhere. Ever.
- NEVER bump the version — not in `package.json`, `src-tauri/tauri.conf.json`,
  or `src-tauri/Cargo.toml`. Version bumps are Sonja's, done by hand.
- NEVER relabel anything bit-perfect. Direct mode's verdict stands: true
  bit-perfect is unachievable on the current stack (lossy sources, browser
  decode, OS mixer). Nothing in a draft may claim it.
- NEVER overwrite a protected area. If upstream touched a protected file,
  draft a preservation rewrite instead: re-apply Sonja's behavior on top of
  the upstream change, keep the upstream bug fix underneath where it is real.
- NEVER strip a feature pending a strip-or-keep decision (see below). If
  upstream refactors one of those areas, preserve it and flag it.
- NEVER hardcode a user-facing string. All strings go through i18n
  (`src/locales/en/*.json`, `getString`). A draft that hardcodes a string is
  a failed draft.
- NEVER build anything on the never-build list (see below), even if upstream
  ships it in a form that looks easy to adopt.
- NEVER delete a test to make the gates pass. A red gate is a red report.
- NEVER touch `fixes/batch-1`, `engine-tie-ins`, `k3-on-sync`,
  `sync/upstream-2026-11-09`, or any branch that is not a `sync/nightly-*`
  scratch branch.
- If the review clone's working tree is dirty at the start of a run, ABORT
  with a red report. Never stash, never `checkout -- .`, never guess whose
  work that is.

## Quality gates

After every merge attempt AND after every conflict draft, run in the review
clone:

- `npm test` — full vitest run. Must be 0 failed.
- `npm run build` — tsc + vite build. Must pass.
- `cargo check` — ONLY if any `src-tauri/**` file changed in the merge.
  (The VM cannot run `cargo test` — no GTK/WebKit dev libs — so cargo check
  is the local bar and CI is the real test run.)

A gate failure after a draft means the draft is wrong: revert the draft,
record the attempt, and file a red report. Do not iterate more than twice
on the same conflict in one run — after two failed drafts, stop and report.

## Protected areas

| Area | Paths / markers | Preserve |
|---|---|---|
| Direct mode + music audio engine | `src/lib/audio/musicAudioEngine.ts`, `src/lib/audio/audioContext.ts`, `src/lib/audio/musicAudioSettings.ts`, `src/lib/audio/outputDeviceProfiles.ts`, `src/lib/audio/outputEngine.ts`, `src/components/settings/music/MusicAudioSettings.tsx`, setting `music_direct_mode` | Untouched-by-Flow playback: no graph, no gain stage, no normalization, no crossfade, speed forced 1.0 in Direct. Opus 48 kHz only; AAC/unknown-rate falls back to Standard for that track, badge says so. Visualizer + skip-silence degrade gracefully in Direct. |
| Multi-artist stations | `src/lib/musicStation.ts`, `src/lib/multiArtistSearch.ts`, `src/lib/stationLibrary.ts`, `src/components/radio/MultiArtistStationBuilder.tsx` | Multi-artist stations with unlimited seeds, discovery logic for never-ending playback, search. Never-ending songs/video is the standing principle — continuous discovery, no babysitting. |
| Deviant Audio Engine tie-ins | `docs/deviant-audio-engine.md`, `src/lib/audio/outputEngine.ts` | The engine is built in its own repo (musclehed03/Deviant-Audio-Engine). The `outputEngines` registry is the attach point: `web` registered today, `native` registers when the engine lands. Do not build a second output path in Flow. |
| Themes / palettes | `src/lib/themes.ts`, Posh Luxe theme pack (`.ddtheme` files), `src/theme/` | Posh Luxe Variant A (Velvet Boudoir & Brushed Gold) as design system; metallics only as 1px pinstripe + one small ornament; every variant ships dark + light; all meaning also in pure grayscale. Pinstripe glow SOP and east-light metallic SOP apply to anything visual. |
| Sensory Suite + typed colorblind palettes | `src/lib/colorBlindPalettes.ts`, `src/lib/useTheme.ts`, `src/components/accessibility/SensorySettings.tsx`, `src/lib/settings/schema.ts` | All 7 typed palettes: deuteranomaly, protanomaly, deuteranopia, protanopia, tritanomaly, tritanopia, achromatopsia/monochromacy. Selecting one re-palettes the whole UI. Day has achromatopsia — everything must work fully in grayscale + high contrast. |
| i18n | `src/locales/en/*.json`, `src/locales/en/settings.json`, `src/lib/i18n/strings.json` | Strings only, never hardcoded. A merge that introduces a hardcoded user-facing string gets a draft that moves it into locales. Upstream consolidated to one string system in 9fe80332 (deleted `src/locales/en/settings.json`) — our settings strings migrate into `strings.json` under the new system, the deleted file is NOT restored. |
| Monetization seams | `src/lib/monetization/status.ts`, `src/lib/monetization/tiers.ts`, `src/store/useSupporterStore.ts` (arrive with the fixes merge) | Supporter tier $8/mo, pack $10.99, site-bought packs unlock in Telegram. Seams only — no paywall, no checkout changes. Monetization gate: a first clear path must pass "ADDS HONEST QUALITY, FEATURES, EXPERIENCE". Never a bare paywall. Flow is GPLv3 — the app itself can never be paywalled. |
| Queue / playback session | `src/lib/musicQueuePersistence.ts`, `src/store/useMusicPlayerStore.ts` | Saved queue restores on refresh/update; a failed settings load must never destroy the saved queue; one bad track must never drop the queue. |
| Never-ending playback | `src/lib/musicPreload.ts`, `src/lib/musicStation.ts` | Music must never end — true gapless is core. Preload next track, retry once on failure. |

## Never-build list

Do not build, adopt, or re-enable any of these, even if upstream adds them
or makes them easy: SponsorBlock, standalone sleep timer, ListenBrainz,
downloads expansion, Discord Rich Presence.

(Upstream already ships a sleep timer and scrobbling — those stay out of
Sonja's build per the pending decisions below, not adopted by the sync.)

## Pending strip-or-keep decisions (hers, do NOT decide)

These upstream features are in the synced code and Sonja has NOT decided
whether to strip them from her build or keep them. The bot preserves them
exactly as-is and flags any upstream change to them in the report:

- FLOW-SYNC/2 device-sync system (server/LAN/WebDAV, crypto roster)
- Multi-profile system
- Scrobbling to Last.fm / Libre.fm / ListenBrainz (conflicts with her
  Last.fm rule: Last.fm stays EXACTLY as-is — user sign-in only, no changes,
  no mentions, do not remove anything)
- Downloads expansion
- Open Collective "support Flow" button

## Conflict playbook

For each conflicted file, in order:

1. **Classify it.** Protected area (table above) or not? Note the area.
2. **Read both sides.** What did upstream change — a bug fix, a refactor, a
   feature, a dependency bump? What does our side carry — a feature, a fix,
   a palette, a seam?
3. **If the file is NOT protected** and the conflict is mechanical (both
   sides added different lines, import lists, adjacent hunks): resolve by
   keeping both, run the gates.
4. **If the file IS protected:** draft a preservation rewrite. Take the
   upstream change, then re-apply Sonja's behavior on top of it in the new
   shape of the code. Keep the upstream bug fix underneath where it is real.
   Never take upstream's version wholesale; never take ours blindly if
   upstream fixed the bug underneath. Run the gates after the draft.
5. **If a draft fails the gates twice,** stop. Leave the conflicted file
   marked, record the draft attempt, and file a red report.
6. **If upstream renamed or moved a protected file,** follow the rename:
   the protection moves with the file. Note it in the report.

## Outcomes

- **(a) Clean merge + gates green.** Produce a bundle file
  (`flow-sync-nightly-YYYY-MM-DD.bundle` in `~/workspace/your_files/`)
  plus a short report: what upstream changed, grouped as features / fixes /
  dependency bumps, which upstream issues closed, and confirmation the
  gates are green. Sonja pushes and merges.
- **(b) Conflicts resolved by draft + gates green.** Bundle + report as in
  (a), PLUS one entry per conflict: file, protected area, what upstream
  changed, what the draft did. Routed for review — Baxter reviews first,
  then Sonja. The report must say plainly it needs her eyes before merging.
- **(c) Conflicts unresolvable or gates red.** NO bundle. A red report:
  each conflict, the affected protected area, the draft attempt (if any),
  and the gate failure. Routed to Baxter / Codex / Sonja to finish by hand.

## Upstream issues scan

Each run also scans upstream open issues (GitHub connector, list_issues on
Flow-Tube/Flow-Desktop) and includes genuinely new bugs/issues in the
report — new since the last run, or new since the last sync, whichever is
later. Skip pure feature requests unless they touch a protected area.

## Maintenance

- When a protected area is added, renamed, or removed, update this file in
  the same change. The bot cannot protect what is not written here.
- When Sonja makes a strip-or-keep decision, move that item out of the
  pending list and into the protected table (keep) or the never-build list
  (strip), with the date of the decision.
