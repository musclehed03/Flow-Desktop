# Dollhouse Deviants Tuned — Roadmap

Living status list for Flow-Tube (Dollhouse Deviants Tuned fork). Stages: Idea → Coming soon → Being built → Shipped.

The nightly upstream-sync bot reads this file every run and flags any upstream change (or new upstream issue) that touches a listed item as a potential future conflict. That check is in the bot's SOPs (cron `flow-nightly-upstream-sync`, 2026-11-14).

Source: this file lives at the repo root (`ROADMAP.md`) on `deviants-tuned` in `musclehed03/Flow-Desktop`. Backup copy: this file, in the goal workspace (`workspace/goals/flow-tube-dollhouse-deviants-tuned-fork/files/ROADMAP.md`).

## Being built

- **Attach the native Deviant Audio Engine** — exclusive WASAPI + native decode into Flow as the native audio path. Hardware test passed 2026-11-14 on the CM01 (exclusive mode confirmed, test tones heard). Engine repo `musclehed03/Deviant-Audio-Engine`, main at `8df460f2`. Honesty rule: quality seals reflect what's actually playing, never what's selected.
- **Upstream catch-up** — merge sync draft `sync/nightly-2026-11-14` (168 upstream commits, 64 conflicts drafted; gates 1 vitest failure left: upstream's new `direction.test.ts`, 15-file RTL pass).
- **SponsorBlock: keep, default off** — branch `sponsorblock-default-off`, decided 2026-11-14; fold into the sync merge.

## Coming soon

- **Final all-changes installer** (Windows + Linux from CI) — after the engine attach + upstream catch-up land and all gates are green on `deviants-tuned`.
- **In-app updater** — Tauri built-in updater, auto-check ≤once/24h (already queued in Feature 13). Standard, free for everyone, never gated.

## Idea

- **Hosted accounts / sync** — server-side library + settings sync, no reimport/export. Needs server budget. Opt-in only; local/off-grid stays first-class and fully working, never gated, no subscription API cost.
- **Saved themes sync** — `.ddtheme` packs + color schemes sync via the hosted account. Same opt-in rule; local themes keep working with zero account needed.

## Shipped

- Upstream sync Nov 11, 2026 (398 commits, merged into `deviants-tuned`).
- K3 multi-artist stations — merged 2026-11-12.
- Fixes batch (20 items) — merged 2026-11-12.
- DDT icon — merged 2026-11-12.
