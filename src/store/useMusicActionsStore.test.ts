import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongItem } from "../types/music";

const settings = new Map<string, string>();
vi.mock("../lib/api/db", () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => { settings.set(key, value); },
}));
vi.mock("../lib/api/music", () => ({ blockMusicArtist: vi.fn(), dislikeMusicArtist: vi.fn(), unblockMusicArtist: vi.fn() }));

import { useMusicActionsStore } from "./useMusicActionsStore";
import { useMusicPlayerStore } from "./useMusicPlayerStore";

const track: SongItem = { id: "song", videoId: "video", title: "Blocked song", artists: [], album: null,
  duration: 100, musicVideoType: "MUSIC_VIDEO_TYPE_ATV", thumbnail: "", explicit: false, playlistId: null, params: null };

beforeEach(() => {
  settings.clear();
  useMusicActionsStore.setState({ dismissedTrackIds: new Set(), blockedTracks: new Map(), blockedArtists: new Map(), suppressedArtistKeys: new Map(), loaded: true });
});

describe("permanent song block", () => {
  it("persists independently from not-interested artist suppression and reaches the player filter", async () => {
    const setHiddenPredicate = vi.fn();
    useMusicPlayerStore.setState({ setHiddenPredicate, pruneQueue: vi.fn() });
    await useMusicActionsStore.getState().blockTrack(track);
    expect(useMusicActionsStore.getState().blockedTracks.get("video")).toBe("Blocked song");
    expect(JSON.parse(settings.get("music_actions_state_v1") ?? "{}").blockedTracks).toEqual([["video", "Blocked song"]]);
    const predicate = setHiddenPredicate.mock.calls[setHiddenPredicate.mock.calls.length - 1]?.[0] as (song: SongItem) => boolean;
    expect(predicate(track)).toBe(true);
  });
});
