# Privacy Focused, But Feature Rich

This is a design for the tuned desktop fork, not an implemented sync feature. Default: nothing leaves the device. No accounts, social sign-in, vendor relay, analytics, discovery broadcasts, or hosted service are proposed.

## Existing engine audit

The inspected baseline is Flow Desktop 3617a0d. The fork has not changed `src-tauri/src/sync/`.

- `canonical.rs`, `mapping.rs`, `export.rs`, `apply.rs`: canonical NDJSON collections include watch history, likes, playlists, settings, subscription groups, subscribed channels, FlowNeuro and MusicBrain. Playlist membership and ordering have canonical identities and tombstones; the legacy `user_playlists` settings blob is mapped into canonical playlists. Its `is_music` is hardcoded false, so it cannot reconstruct an Android playlist's music flag. Imported TIDAL video metadata and ordering survive this mapping.
- `settings_map.rs` uses explicit shared and desktop-only whitelists, translates typed Android setting names, and excludes device-specific paths, credentials and codec preferences. New tuned settings, saved stations, discovery level and Sensory Suite keys are **not automatically covered** by declaring them app-data settings. They need a future audited whitelist/schema extension. Existing settings backups are distinct from the sync wire format.
- `brainmap.rs`, `brain_attrib.rs`, `brain_rekey.rs`, `export.rs`: resident brains must be flushed first; per-device contribution state is folded into merged CRDT state. FlowNeuro exports per-device snapshots; MusicBrain exports merged state. Taste is transferable without uploading raw media. Keep the video/music recommendation boundaries and history `is_music` semantics.
- `merge.rs`, `ledger.rs`, `tombstones.rs`, `local_edits.rs`: merge clocks, edit stamps, tombstones and per-peer ledger state support deterministic reconciliation and deletions. A file transport must retain these semantics; copying raw SQLite databases or settings JSON over live databases is unsafe.
- `transport.rs`, `qr.rs`, `crypto.rs`, `protocol.rs`: explicit LAN session, ephemeral listener, plaintext WebSocket **with AES-256-GCM encrypted payloads**. A random 32-byte master secret and session id pass out of band in a QR payload. HKDF-SHA256 derives directional keys, authenticated sequence/type/session fields protect frames, and a six-digit comparison code confirms pairing. The QR contains the secret: screenshots must be treated as sensitive. The code comparison is authentication confirmation, not a password or key.
- Protocol v1 is one-way per session: host sends, receiver confirms selection/consent, validates manifest hashes, stages records, applies, then acknowledges. Two opposite sessions are required for bidirectional convergence today. This is not unattended multi-device synchronization.
- Download records, absolute paths, media files, active decoder state and ephemeral DJ played sets are not portable library sync. Stations should transport seeds and preferences, never expiring continuation tokens. Subscription export uses existing settings mappings rather than a dedicated desktop subscriptions table.

Audit references are the source files above, not a claim that new tuned data already syncs. Existing sync golden/fuzz/scale/roundtrip tests remain mandatory for a future implementation.

## Options

| Option | Advantages | Costs / risks |
| --- | --- | --- |
| Explicit LAN pairing | Existing encrypted engine and consent UI; direct device-to-device | Both devices online together; firewall and address changes; v1 one-way |
| Encrypted bundle via user-selected file, USB or Syncthing-style folder | Works offline and asynchronously across Windows/Linux; owner chooses transport; no service required | Needs versioned envelope, durable identities, replay handling, atomic import and key lifecycle; sync-folder conflicts must not overwrite state |
| QR or manual pairing | Out-of-band authentication independent of accounts | This is key establishment, not a transport; low-entropy short codes alone cannot encrypt bundles safely |
| Optional self-hosted endpoint on owner's hardware | Convenient when devices are apart | Additional attack surface, availability, patching and metadata exposure; unnecessary for first delivery |

## Recommendation: encrypted, local-first sync bundles

Use the canonical collection engine behind an explicit **Export encrypted sync bundle / Import encrypted sync bundle** workflow. The owner moves immutable bundle files by USB or an existing personally configured folder transport. The application does not install Syncthing, operate a server, watch a folder, or connect to any endpoint by default. LAN pairing can exchange the bundle key directly later, reusing the existing authenticated session. This single path works without simultaneous device availability and does not require the owner to run a server.

A future envelope should include protocol/schema versions, sender identity, monotonically increasing sender bundle number, collection capabilities, manifest hashes and authenticated creation metadata. Encrypt canonical payloads with a reviewed AEAD construction and a fresh random nonce per envelope. Do not reuse current frame keys or nonce namespaces for files: derive a domain-separated bundle key. Use a high-entropy random recovery key, exchanged directly by QR or a full manual encoded key, stored using platform-protected secret storage. An optional password mode requires a reviewed memory-hard KDF with bounded parameters, never a six-digit SAS. Authenticate envelope metadata and reject tampering before parsing collections. Bundle size, decompression ratio and record limits are necessary for local hostile files.

### Threat model

Protect library, settings, stations, listening preferences and taste against an untrusted transport provider, lost USB media and LAN observers. A transport can observe file sizes/timing, delete bundles or delay delivery; encryption cannot guarantee availability or conceal every metadata signal. A compromised unlocked device, malware reading process memory, a photographed pairing QR, or someone holding the recovery key can read data. Revoking a device requires rotating the group key and pairing remaining devices again; previously decrypted copies cannot be recalled.

Unpaired input is never trusted. Require explicit peer fingerprint verification, preview collection counts, and opt-in consent before first import. Persist accepted sender counters/identities, reject unauthorized senders, and make duplicate bundle application idempotent. Out-of-order transport must merge authenticated records by canonical clocks rather than replacing newer state wholesale. Preserve deletion tombstones until all paired peers acknowledge them, with an explicit stale-device removal policy. Show stale/missing bundles and import failures visibly. Export, pairing secrets and recovery keys must never enter logs or telemetry.

## Phased implementation plan

1. **Coverage and compatibility:** specify canonical station records (type, seed identifiers/name, user name, discovery and mix seeds), whitelist portable tuned settings, add roundtrip tests for all new fields and TIDAL ordering. Separate machine-local theme/accessibility choices with per-setting sync selection; never sync download paths or hardware codec settings. Test old-peer capability negotiation and deliberate exclusion instead of silent loss.
2. **Manual encrypted files:** reviewed envelope/crypto, explicit export/import consent, platform key storage and recovery workflow; canonical staged transactional apply and rollback. Golden vectors, tamper/wrong-key/replay/truncation/zip-bomb tests and offline cross-platform roundtrips. No background networking.
3. **Owner-controlled folder transport:** opt-in immutable inbox/outbox, atomic temporary-file rename, deduplication and sender counters; multiple-writer conflict tests, interrupted writes, lost devices, bounded retention and recovery. The user configures any external folder transport independently.
4. **Optional direct pairing:** reuse LAN session security to exchange/rotate bundle keys with fingerprints and SAS confirmation; expire pairing listeners. Keep manual full-key pairing accessible without a camera. Test wrong-peer, replay, disconnect and revocation paths.
5. **Only if later requested:** evaluate an owner-hosted opaque blob endpoint, authenticated device access and deletion, with no third-party relay. This is not part of this build or the recommended initial path.

Acceptance for that future work: default zero sync network traffic, no account flow, owner-readable coverage report, two-platform convergence including deletions, deterministic brain merges, malicious-input rejection and successful key recovery/revocation exercises. This run adds only this document.
