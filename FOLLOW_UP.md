# Approved follow-up queue

These owner-approved features are queued **after the current build and Feature 8
are delivered and pass review**. They are not part of the current implementation.
Feature 8's separately numbered specification is pending clarification; the
previously deferred ghost settings remain deferred.

## Feature 13

1. **EQ:** parametric 10-band EQ; imported AutoEq measured headphone correction;
   per-output-device profiles that switch with the device.
2. **Synced lyrics:** fullscreen karaoke, lyrics over video, and typography controls
   in Deviant Controls.
3. **Permanent blocklist:** song/artist blocks respected by DJ, radio, endless,
   mixes, and shuffle.
4. **Smart playlists:** library rules for genre, artist, year, play count,
   last played, likes, limits, and random selection; automatic refill.
5. **Local stats and recaps:** top artists/tracks, listening clock, skip rates,
   forgotten favorites, and periodic recaps; entirely on-device, zero network.
6. **Last.fm:** opt-in scrobbling with the owner's own Settings-entered API key
   and session; no shared or hardcoded credentials. Local listen log remains the
   source of truth; queue offline scrobbles and retry.
7. **Artwork showcase and Deviant button effect:** opt-in artwork-derived colors
   are confined to artwork/now-playing; the rest of the active theme stays intact.
   Port hover outline tracers and contrasting selection feedback from
   `Dollhouse-Deviants-Co/remix-4.0-Dollhouse-Deviants`. Safe Motion makes tracers
   static/off; avoid layout thrash.
8. **Local profiles:** named profiles with separate libraries, history, and
   settings; no accounts or sign-in.
9. **Library Doctor:** exact/near duplicates across playlists, unavailable video
   checks, and living replacement suggestions. Report first; never auto-delete.
10. **Wrong-version fixer:** owner-selected alternative uploads per track; ISRC
    matching where available.
11. **Visualizer extension:** `.ddviz` import/export, A/B/C/D hot-cue pads with
    hold-to-preview, 4–6 macros over the full rack, static/shuffle/script rotation.
    Design sources: the owner's `le-deviantscope` and `Lumi-Dancer` specifications
    in the Dollhouse-Deviants-Co GitHub organization.
12. **Reduced-flash enforcement:** constrain strobing parameters/presets and warn
    before enabling flashing presets; an advisory alone is insufficient.
13. **Beat and latency calibration:** beat fractions plus millisecond adjustment;
    per-output DAC/Bluetooth/TV latency profiles. Device keys are salted SHA-256
    opaque hashes, never raw MAC addresses.
14. **Multi-artist stations:** searchable YouTube Music catalog and library,
    unlimited artist seeds, saved stations using Feature 7.1.
15. **Quick Wins:** find-in-playlist and library sorting/filtering; verify stock
    before extending global hotkeys, media keys, MPRIS/SMTC, and tray controls;
    queue multi-select; uploaded or 2×2 collage playlist covers; chapters and
    one-tap frame capture; dismissible “continue watching?”; A–B loop and
    pitch-preserving tempo; localhost OBS browser source and local now-playing
    file; Radio Browser stations; typed protanopia/deuteranopia/tritanopia/
    achromatopsia modes and hearing calibration.
16. **Update notice:** on open, check this fork's GitHub releases only when the
    last check is at least 24 hours old. Show a non-intrusive link to a newer
    version; never auto-download/install. Include a disable toggle and document
    the single outbound call. This is deferred and does not authorize changing
    the current build's updater configuration.

## Not selected

Do not build SponsorBlock, a standalone sleep timer, ListenBrainz, downloads
expansion, or Discord Rich Presence as part of this queue. This does not request
removal of upstream functionality already present.

## Previously deferred settings

Stable Volume / Skip Silence / Volume Boost audio stage, scheduled auto-backup,
cache cap, adaptive player size, preferred audio language, subscription refresh,
Shorts shelf toggle, and the buffer pair remain queued pending the owner's
Feature 8 clarification. Crossfade overlap gain plumbing does not by itself
resurrect these settings.
