# Block J delivery notes

## Wired in this block

- Scheduled local backups now run daily, weekly, or monthly after the owner chooses a folder. The existing backup scopes and serializer are reused, and failures surface as a toast.
- Startup subscription refresh rehydrates subscribed-channel metadata in bounded batches of four.
- Preferred Watch audio language now feeds the existing audio-track selector instead of forcing `original`.
- Adaptive Watch sizing follows the selected stream's real aspect ratio and retains 16:9 when disabled.
- Both custom buffer thresholds are marked wired because `Player.tsx` already consumes and clamps them.
- Permanent per-song blocking is distinct from temporary “not interested” feedback and feeds the existing queue/radio/mix filter. Permanent artist blocking was already present.
- Library Lab adds private, on-device plays/hours/skips and a report-only duplicate/incomplete-entry scan. Its pure smart-playlist evaluator supports artist, stored genre, publication year, play count, last-played age, likes, limits, and random order; a full saved-rule editor remains listed below.
- Automatic update checks now make at most one request per 24 hours to `https://api.github.com/repos/musclehed03/Flow-Desktop/releases/latest`, show an actionable notice, and link to this fork. Manual signed-updater checks remain available; Tauri updater config is unchanged.

## Existing work verified

- Synced and word-timed lyrics, full-screen music presentation, artist blocking, playlist find/sort/filter, chapters, continue-watching dismissal, keyboard/media-session transport controls, typed colorblind modes, and hashed output-device EQ profiles already exist in the branch.

## Named scope cuts

- The media cache cap remains disabled. The current backend has no byte accounting that separates disposable cache pages from the SQLite file's user data; enforcing a nominal size would risk deleting user data or claiming reclaimed space that SQLite has not reclaimed.
- Lyrics over Watch video and lyric typography controls were not added. The two-player split has no Watch lyric source contract yet; the existing music karaoke canvas remains intact.
- Saved smart-playlist rule editing is not surfaced yet. The local evaluator is complete, but genre metadata is absent from most current `VideoSummary` rows and needs a library metadata backfill before a trustworthy editor.
- Last.fm scrobbling is not shipped. The local history ring still cannot provide a complete durable retry ledger, and Last.fm authentication requires the owner's API secret/session flow; no shared credential or lossy queue was substituted.
- Local profiles are not shipped. Correct isolation requires namespacing every library/history/settings key and a migration/rollback design; switching only visible settings would leak data across profiles.
- Library Doctor does not make network availability probes or replacement suggestions. This pass is report-only and local, so it cannot falsely mark temporarily unavailable YouTube items dead.
- The wrong-version fixer is not shipped because the legacy music lookup stack is scheduled for upstream replacement; building its candidate contract on the removed stack would create immediate sync debt.
- Beat/latency calibration and the unlimited multi-artist station builder are not surfaced. Device IDs are already salted SHA-256 hashes, but playback does not yet expose a stable output-latency primitive, and the station UI needs catalog/library artist search plus saved multi-seed schema.
- Quick Wins still missing are queue multi-select, custom playlist covers, A–B loop/pitch-preserving tempo, OBS overlay, Radio Browser, and hearing calibration. Chapters were intentionally left to the existing/upstream implementation. SponsorBlock, sleep timer, ListenBrainz, download expansion, and Discord Rich Presence were not added.

No files under `src-tauri/src/sync/` or `src-tauri/src/flow_neuro/` were touched.
