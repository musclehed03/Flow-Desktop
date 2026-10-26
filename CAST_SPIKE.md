# Cast and DLNA spike

Date: 2026-10-26

## Decision

Do not expose a Cast button in this build. Flow Desktop has no network-reachable media URL that a television can consume, so a device picker would discover renderers and then fail at playback. The honest next path is a short-lived, authenticated LAN relay followed by DLNA/UPnP AVTransport. Google Cast remains a separate experiment.

## What exists today

- The media proxy binds to `127.0.0.1:0` in `src-tauri/src/streaming/proxy.rs`. Every music, progressive video, DASH, HLS, and SABR URL returned to the UI is rewritten to that loopback listener.
- SABR manifests also contain loopback segment URLs. Replacing only the hostname in the current playing URL would leave the manifest unusable on another device.
- Proxy sessions preserve upstream headers, byte ranges, and expiring YouTube URLs. Sending the raw upstream URL to a television would bypass those requirements and is not a reliable fallback.
- The existing LAN sync listener binds on all interfaces, but it is a different encrypted protocol. It must not be repurposed for unauthenticated media serving.

## Sender and discovery audit

Crate metadata was checked through crates.io on 2026-10-26:

| Path | Candidate | Latest checked | License | Finding |
| --- | --- | --- | --- | --- |
| Google Cast | [`rust_cast`](https://crates.io/crates/rust_cast) | 0.21.0, published 2025-12-30 | MIT | Maintained enough for a prototype, but unofficial. It implements the receiver protocol; Tauri has no official desktop sender SDK. It still needs a receiver-reachable media URL. |
| DLNA device/control | [`rupnp`](https://crates.io/crates/rupnp) | 3.0.0, published 2025-04-25 | MIT OR Apache-2.0 | Solid typed UPnP discovery/control foundation. It does not solve media relay or renderer codec compatibility. |
| SSDP only | [`ssdp-client`](https://crates.io/crates/ssdp-client) | 2.1.0, published 2025-04-25 | MIT OR Apache-2.0 | Mature discovery building block, already covered at a higher level by `rupnp`. |
| DLNA convenience | [`upnp-client`](https://crates.io/crates/upnp-client) | 0.1.11, published 2025-06-19 | MIT | Smaller API and download base. It still depends on a reachable media URL and gives less control over renderer quirks. |

All licenses are compatible with this GPL-3.0-only fork. No crate was added during this spike.

## Why DLNA was not shipped yet

DLNA discovery and `SetAVTransportURI` are achievable. End-to-end playback is not solid until Flow has a second proxy listener designed for LAN exposure. Changing the existing listener from loopback to `0.0.0.0` would expose every active token to the local network and would weaken the proxy's current trust boundary. It would also require rewriting nested manifest URLs, choosing the correct LAN interface, handling firewall prompts, expiring sessions, and testing Range behavior on Windows and Linux renderers.

The always-works fallback, “Play on…” with a URL another device opens, has the same relay dependency. A loopback URL copied from the current player cannot work off-device.

## Recommended implementation

1. Add a separate, opt-in LAN relay that starts only for an active cast session. Bind it to the selected private LAN interface, use a cryptographically random per-session path, expire it on stop or timeout, allow only private/link-local clients, and never log the token.
2. Reuse `StreamingManager` sessions behind that relay so Range, content type, required upstream headers, and expiration behavior remain identical. Rewrite DASH/SABR/HLS nested URLs to the relay origin.
3. Add `rupnp` discovery and AVTransport control behind a Tauri command module. Keep discovery idle until the device panel opens, then stop multicast work when it closes.
4. Test progressive audio, progressive video, and adaptive video against at least one Windows network and one Linux network plus two renderer families. Show an explicit unsupported-codec result rather than retrying forever.
5. Only then add the Block B device panel and the shared player Cast controls. Label Google Cast experimental only after a separate `rust_cast` receiver test passes.

## Threat model and performance budget

The default remains no listener and no multicast discovery. Starting a session exposes only one random, expiring media route to private LAN addresses. The relay must reject directory traversal, unknown tokens, non-private peers, oversized headers, and methods other than those required for streaming. Discovery should run for a bounded window of about five seconds. Relaying should remain streaming and backpressured, with no whole-file buffering or transcoding.

This decision avoids a control that can discover a TV but cannot deliver media. No Cast/DLNA UI or behavior was added in this block.
