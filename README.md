<div align="center">
  <img src="assets/deviants/tuned.svg" alt="Dollhouse Deviants Tuned" />
  <img src="assets/deviants/video-first.svg" alt="Video first playback" />
  <img src="assets/deviants/build-order.svg" alt="Build order: Windows then Linux" />

  **The screen stays lit. The library stays local.**

  Dollhouse Deviants Tuned is a watching-focused fork of **Flow Desktop by Dev AE / A-EDev (Aedev), part of Flow-Tube**.
  The upstream project, original documentation, artwork, credits, and GPL terms remain below.
</div>

## Dollhouse Deviants Tuned upgrades

Upstream: [Flow-Tube / Flow-Desktop](https://github.com/Flow-Tube/Flow-Desktop).

A local cut for long nights with music videos. The video Watch player and audio music player remain separate.

- **Platform display names:** Windows uses **Flow-Tube: Dollhouse Deviants Tuned (Desktop)**; Linux uses **Flow-Tube: Dollhouse Deviants Tuned (Linux)**. Tauri forbids colons in `productName`, so package/installer names use **Flow-Tube - Dollhouse Deviants Tuned (Desktop)** / **(Linux)**; window titles and About retain the colon wording. Version `0.1.0-beta2` and bundle identifier `io.github.aedev.flow.desktop` remain unchanged.
- **Music videos first:** enabled by default in Player settings. Video songs open Watch with the queue; ATV/audio starts retain the music player. Turn it off for upstream routing and candidate filtering.
- **Keep watching view:** enabled by default in Player settings. Queue advances retain the watching layout and recover automatic PiP; manual PiP remains under your control. The auto-PiP toggle also uses the schema's `true` default.
- **Bulk TIDAL playlist import:** Import Data accepts multiple resolved `flow-playlist` version 1 JSON files or ZIP archives. All JSON entries are processed, track order is preserved, existing playlist names are skipped whole, and each file gets a result. The library is saved once per batch. CSV membership joins are not included.
- **Radio, Endless & Genius DJ:** artist and genre stations retain their identity; radio discovery offers less/moderate/more. Genius DJ defaults on, avoids automatic repeats in both players, and refills exhausted queues. Explicit replay and repeat modes stay available.
- **Dollhouse Deviants Sensory Suite:** Focus Mode, Safe Motion (OS default on first run), Readable Font, High Contrast, Color Blind Support, Light Theme, and Simplified View persist locally. Open Deviant Controls anywhere or use Appearance settings. Safe Motion pauses new videos for a photosensitivity notice; it cannot remove flashes from footage. Both players support transport shortcuts; the audio mini-player remains the dock, separate from video PiP. Adapted from [Dollhouse Deviants' Sensory Suite](https://github.com/Dollhouse-Deviants-Co/remix-4.0-Dollhouse-Deviants).
- **Radio extras:** name and resume artist/genre stations from Music Home; refill from owned playlists and downloads; see source-backed track reasons; keep one DJ played set across both players. Exactly three Daily Mix station slots use current listening and co-listen clusters; empty slots explain that more listening is needed.
- **Privacy sync design:** [SYNC_DESIGN.md](SYNC_DESIGN.md) audits the existing engine and recommends owner-controlled encrypted sync bundles. Design only: no new transport, server, account or cloud integration.
- **Related Songs:** open a library-filtered snapshot from either player. The list stays frozen across track changes; adding marks a row in place. Close and reopen for a fresh snapshot.
- **Audio visualizers:** real analyser-driven spectrum, waveform, radial, particles, and MIT Butterchurn/MilkDrop presets; named presets, palettes, inline/mini/fullscreen modes, capped FPS and automatic quality reduction. Safe Motion freezes visuals; Focus and Simplified View hide them. Animated visuals require sensory acknowledgement. See [additional third-party notices](THIRD_PARTY_NOTICES.md).
- **Musical crossfade:** off by default; choose 1–12 seconds and optionally fade explicit picks. Automatic and Next/Previous transitions use equal-power gains, per-track normalization, and an overlap-only peak limiter. Available tempo/phrase/key metadata guides alignment and clash avoidance; absent metadata uses the chosen duration. Seeks cancel overlap and suppress automatic fade triggers briefly. Watch video hand-offs remain separate.
- **Platform scope:** Apple targets and CI entries are removed; shared cross-platform source stays. RPM builds require the `rpm` / `rpmbuild` system tools. RPM packaging maps the prerelease separator to its native `~` representation while keeping the executable and all application versions at `0.1.0-beta2`.
- **Build priority:** Windows x64 NSIS first; Linux x64 Debian/RPM and AppImage second. Build artifacts only; no deployment, release, tag, updater change, or macOS work in this fork pass.

The following is the upstream README, preserved in full. Upstream download links refer to upstream builds.

---

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/banners/flow-desktop-dark.svg">
    <img alt="Flow Desktop. Privacy-first YouTube and YouTube Music for Windows and Linux." src="https://assets.flow-tube.org/v1/banners/flow-desktop-light.svg" width="100%">
  </picture>

  **A privacy-respecting YouTube and YouTube Music client with a native, fully local recommendation engine.**

  Flow Desktop is the desktop companion to [Flow for Android](https://github.com/Flow-Tube/Flow), built with Rust, Tauri, React, and TypeScript.

  <p>
  <a href="https://github.com/Flow-Tube/Flow-Desktop/releases/latest"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/pill/get-windows-dark.svg"><img alt="Download for Windows" src="https://assets.flow-tube.org/v1/badges/pill/get-windows-light.svg" height="60"></picture></a>
  <a href="https://github.com/Flow-Tube/Flow-Desktop/releases/latest"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/pill/get-linux-dark.svg"><img alt="Download for Linux" src="https://assets.flow-tube.org/v1/badges/pill/get-linux-light.svg" height="60"></picture></a>
  </p>
  <p>
  [Desktop: Windows · Linux](#downloads-and-supported-systems)
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/split/tauri-dark.svg"><img alt="Built with Rust · Tauri 2" src="https://assets.flow-tube.org/v1/badges/split/tauri-light.svg" height="32"></picture>
  <a href="LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/split/license-dark.svg"><img alt="License: GPL-3.0" src="https://assets.flow-tube.org/v1/badges/split/license-light.svg" height="32"></picture></a>
  </p>

  [**Downloads**](https://github.com/FlowNeuro/Flow-Desktop/releases) · [**Android app**](https://github.com/Flow-Tube/Flow) · [**Community**](https://www.reddit.com/r/Flow_Official/) · [**Support development**](#support--donations)
</div>

> Flow Desktop is under active development. Features and storage formats may change before the first stable release.

---

## Features

- Native video playback with quality and codec selection, SABR/DASH/HLS support, chapters, subtitles, playback speed, queues, mini-player, and Picture-in-Picture.
- YouTube Music home, search, artists, albums, playlists, queue management, synchronized lyrics, repeat, shuffle, and equalizer controls.
- A dedicated Shorts feed with comments, descriptions, saved Shorts, looping, auto-next, and timed scrolling modes.
- Local subscriptions, playlists, Watch Later, likes, albums, video and music history, Continue Watching, and regional Explore feeds.
- Channel pages with videos, Shorts, playlists, community posts, comments, and live chat support.
- SponsorBlock, DeArrow, Return YouTube Dislike, and Discord Rich Presence integrations.
- Imports from Flow backups, Google Takeout, NewPipe, LibreTube, FreeTube, and OPML.

### FlowNeuro

FlowNeuro is Flow's native local recommendation engine. It learns from watches, skips, likes, dislikes, searches, topic preferences, and creator affinity, and ranks content on your device without sending a recommendation profile to a Flow server.

The Control Center lets you inspect topic weights, time-based patterns, channel memory, learning activity, and blocked content. You can export, import, reset, or temporarily pause learning with Deep Flow mode.

---

## Privacy and security

- No Google account is required, and Flow contains no advertising or analytics SDK.
- History, settings, library data, and recommendation state are stored locally in SQLite.
- Tauri permissions are restricted to the main window and the OS, dialog, and external-link capabilities the app uses.
- A strict Content Security Policy blocks arbitrary scripts, frames, objects, and remote application code.
- Rust validates search terms, video IDs, channel IDs, browse IDs, and continuation tokens before network requests.
- Media is relayed through a tokenized loopback-only proxy instead of exposing a public local server.
- BotGuard and PO-token handling run through a native hidden WebView, with a packaged Node script retained only as a compatibility fallback.

Flow still contacts YouTube and optional services such as SponsorBlock, DeArrow, Return YouTube Dislike, and configured lyrics providers when their features are used.

---

## Downloads and supported systems

Apple builds are upstream-only — this fork ships Windows and Linux.

Release builds are published through [GitHub Releases](https://github.com/FlowNeuro/Flow-Desktop/releases).

- **Stable:** reviewed releases intended for normal use.
- **Beta / RC:** public GitHub prereleases for wider testing. These install as **Flow Beta** with isolated application data.
- **Nightly:** automatic snapshots from `main`. These install as **Flow Nightly**, use isolated data, and may be unstable. Download the latest packages from [GitHub Actions](https://github.com/FlowNeuro/Flow-Desktop/actions/workflows/build.yml) or [nightly.link](https://nightly.link/FlowNeuro/Flow-Desktop/workflows/build/main) without a GitHub account.

| Platform | Supported versions | Architectures | Packages |
| --- | --- | --- | --- |
| Windows | Windows 10 22H2, Windows 11 | x64, ARM64 | NSIS installer |
| Linux | Ubuntu 22.04+, Debian 12+, and comparable modern distributions | x64, ARM64 | AppImage, `.deb`, `.rpm` |

Linux builds require a compatible glibc, GTK 3, and WebKitGTK 4.1 environment. Legacy 32-bit systems are not supported.

### Linux media codecs

On Linux, video decoding goes through WebKitGTK and the system GStreamer plugins (Windows ships its own decoders). If audio plays but video stays frozen on a spinner, a video decoder is missing.

- **AppImage** — bundles the required GStreamer codec plugins (including `gst-libav` for H.264); no system codec packages are needed.
- **`.deb`** — declares the codec plugins as dependencies. Install with `sudo apt install ./Flow_*.deb` so they are pulled in automatically.
- **`.rpm`** — the freely licensed plugins are hard dependencies. On Fedora, H.264 decoding (`gstreamer1-libav`, `gstreamer1-plugins-bad-freeworld`) is only available from [RPM Fusion](https://rpmfusion.org/Configuration) for patent reasons: enable RPM Fusion and run `sudo dnf install gstreamer1-libav gstreamer1-plugins-bad-freeworld`, or use the AppImage instead.

### Linux startup crashes and blank windows

If the app opens to a blank or white window, that is usually the WebKitGTK DMABUF renderer failing on your graphics stack (common with NVIDIA proprietary drivers and some Wayland sessions). Flow disables it automatically and, if a launch still fails to render, **escalates GPU workarounds on the next launch on its own**: first forcing software compositing (`WEBKIT_DISABLE_COMPOSITING_MODE=1`), then falling back to X11/XWayland (`GDK_BACKEND=x11`). A clean launch resets this. You can still override any of these yourself — for example `WEBKIT_DISABLE_DMABUF_RENDERER=0` to re-enable the DMABUF renderer.

If the app aborts on startup with `Could not create default EGL display: EGL_BAD_PARAMETER` (seen on some Arch-family / Mesa systems with the **AppImage**), that is a known Tauri AppImage packaging issue: a bundled `libwayland` client library conflicts with your system's newer Mesa/EGL stack. As an interim workaround, delete the bundled Wayland libraries and run the extracted app:

```sh
./Flow_*_linux_amd64.AppImage --appimage-extract
rm squashfs-root/usr/lib/*wayland*so*
./squashfs-root/AppRun
```

On Arch-family distributions the AUR package and the planned Flatpak build avoid this class of issue; prefer those when available.

---

## Development

Requirements: Node.js 22.12+, pnpm 11.9+, stable Rust, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

Build packages for the current operating system:

```sh
pnpm test
pnpm build
pnpm tauri build
```

Windows and Linux packages are built natively by the GitHub Actions release workflow. Production Windows releases should be signed before publication.

---

<a id="support--donations"></a>
## Support & donations

Flow is free and open-source software maintained by an independent developer. Patreon supports card, PayPal, Apple Pay, recurring support, and one-time tips.

<a href="https://opencollective.com/flow-tube"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/pill/support-opencollective-dark.svg"><img alt="Support Flow on Open Collective" src="https://assets.flow-tube.org/v1/badges/pill/support-opencollective-light.svg" height="60"></picture></a>
<a href="https://patreon.com/A_EDev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/pill/support-patreon-tonal-dark.svg"><img alt="Support Flow on Patreon" src="https://assets.flow-tube.org/v1/badges/pill/support-patreon-tonal-light.svg" height="60"></picture></a>

You can also donate directly with crypto. Scan a QR code using a compatible wallet, or click it where custom wallet links are supported. The address and network are printed below every code — always verify both before sending.

<table>
  <tr>
    <td align="center">
      <strong>USDT · TRC20</strong><br><br>
      <a href="tron:TRz7VDrTWwCLCfQmYBEJakqcZgbFNWfUMP"><img src="Assets/donations/usdt-trc20.png" alt="USDT TRC20 donation QR code" width="170"></a><br><br>
      <code>TRz7VDrTWwCLCfQmYBEJakqcZgbFNWfUMP</code>
    </td>
    <td align="center">
      <strong>Bitcoin · BTC</strong><br><br>
      <a href="bitcoin:bc1qgmkkxxvzvsymtpfazqfl93jw6k4jgy0xmrtnv8?label=Flow%20Development"><img src="Assets/donations/bitcoin.png" alt="Bitcoin donation QR code" width="170"></a><br><br>
      <code>bc1qgmkkxxvzvsymtpfazqfl93jw6k4jgy0xmrtnv8</code>
    </td>
    <td align="center">
      <strong>Ethereum · ERC-20</strong><br><br>
      <a href="ethereum:0xfbac6f464fec7fe458e318971a42ba45b305b70e"><img src="Assets/donations/ethereum.png" alt="Ethereum donation QR code" width="170"></a><br><br>
      <code>0xfbac6f464fec7fe458e318971a42ba45b305b70e</code>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <strong>Solana · SOL</strong><br><br>
      <a href="solana:7b3SLgiVPb8qQUvERSPGRWoFoiGEDvkFuY98M1GEngug?label=Flow%20Development"><img src="Assets/donations/solana.png" alt="Solana donation QR code" width="170"></a><br><br>
      <code>7b3SLgiVPb8qQUvERSPGRWoFoiGEDvkFuY98M1GEngug</code>
    </td>
    <td align="center">
      <strong>Monero · XMR</strong><br><br>
      <a href="monero:8AgaxZnpEvT8VXJpczpL7BQejwSEw97saJmKYqq4zKErbe9bkYSwUhJ813msPPbdYhF11oz4N7tfEj4Zi6k27fKD83ca1if"><img src="Assets/donations/monero.png" alt="Monero donation QR code" width="170"></a><br><br>
      <code>8AgaxZnpEvT8VXJpczpL7BQejwSEw97saJmKYqq4zKErbe9bkYSwUhJ813msPPbdYhF11oz4N7tfEj4Zi6k27fKD83ca1if</code>
    </td>
  </tr>
</table>

Wallet URI support varies between wallet applications. Bitcoin, Ethereum, Solana, and Monero QR codes use their standard payment URI formats; the TRC20 code uses a Tron URI and may fall back to displaying the address in wallets that do not register the scheme.

---

## License

Flow Desktop is free software licensed under the [GNU General Public License v3.0](LICENSE).

This license requires that any project using Flow's source code, including the FlowNeuro engine, must also be released as open source under GPLv3. It may not be used in a proprietary or closed-source application.

Copyright © 2025–2026 A-EDev

---

## Star History

<a href="https://github.com/Flow-Tube/Flow-Desktop/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/stars/stars-flow-desktop-dark.svg">
    <img alt="Star history of Flow Desktop" src="https://assets.flow-tube.org/v1/stars/stars-flow-desktop-light.svg" width="100%">
  </picture>
</a>

---

<div align="center">
  <a href="https://github.com/Flow-Tube"><picture><source media="(prefers-color-scheme: dark)" srcset="https://assets.flow-tube.org/v1/badges/pill/part-of-flow-dark.svg"><img alt="Part of the Flow ecosystem" src="https://assets.flow-tube.org/v1/badges/pill/part-of-flow-light.svg" height="60"></picture></a>
</div>
