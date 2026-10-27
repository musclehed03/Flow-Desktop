# Mixed-media playlists: phase 1

Stored playlists keep the existing `StoredPlaylist` and `VideoSummary` shapes. Music rows use two additive optional `VideoSummary` fields: `mediaKind: "music"` identifies the engine, and `musicTrack` preserves the complete `SongItem` metadata. Existing video-only playlists remain unchanged.

`useMixedMediaQueueStore` is the fork-owned router. It owns the complete ordered playlist and starts only the consecutive run for the active engine. The music and Watch players continue to own decoding, controls, history, and their native queues. When the run ends, a cancelable local event lets the router hand the next item to the other engine and replace the route. Same-engine transitions retain the existing music crossfade behavior; cross-engine transitions are clean cuts.

Phase 1 supports creating, storing, reopening, shuffling, and sequentially playing mixed playlists. It deliberately does not merge the two media engines, add cross-engine crossfades, create a unified fullscreen surface, or change sync/canonical playlist mapping. Older installs ignore the optional fields and continue to treat rows as videos.
