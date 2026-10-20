import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import { SETTINGS } from "./settings/schema";
import { audioMusicOnly } from "./musicRecall";
import { isPlayableAudio } from "../store/useMusicPlayerStore";
import { shouldWatchSong, songToVideoSummary } from "./musicVideoRouting";
import type { SongItem } from "../types/music";

vi.mock("./streamResolution", () => ({ prefetchStreamInfo: vi.fn() }));
const song = (type: string | null, id = "id"): SongItem => ({
  id, videoId: id, title: "Title", artists: [{ name: "Artist", id: "channel" }], album: null,
  duration: 200, musicVideoType: type, thumbnail: "art", explicit: false, playlistId: null, params: null,
});
const original = useAppSettingsStore.getState().values;
afterEach(() => useAppSettingsStore.setState({ values: original }));

describe("video-first candidate gating", () => {
  it.each([true, false])("gates video rejection when enabled=%s", (enabled) => {
    useAppSettingsStore.setState({ values: { ...original, [SETTINGS.MUSIC_VIDEO_FIRST_ENABLED]: String(enabled) } });
    const audio = song("MUSIC_VIDEO_TYPE_ATV");
    const omv = song("MUSIC_VIDEO_TYPE_OMV", "omv");
    const ugc = song("MUSIC_VIDEO_TYPE_UGC", "ugc");
    expect([audio, omv, ugc].map(isPlayableAudio)).toEqual([true, enabled, enabled]);
    expect(audioMusicOnly([audio, omv, ugc, omv]).map((s) => s.id)).toEqual(enabled ? ["id", "omv", "ugc"] : ["id"]);
    expect(shouldWatchSong(omv)).toBe(enabled);
    expect(shouldWatchSong(audio)).toBe(false);
    expect(shouldWatchSong(song(null))).toBe(false);
    expect(shouldWatchSong(song("MUSIC_VIDEO_TYPE_OMV", ""))).toBe(false);
    expect(isPlayableAudio({ ...omv, duration: 4 })).toBe(false);
    expect(audioMusicOnly([{ ...audio, duration: 1400 }, song(null, "")])).toEqual([]);
  });
  it("converts metadata using the playable video ID", () => {
    expect(songToVideoSummary({ ...song("MUSIC_VIDEO_TYPE_OMV"), videoId: "playable" })).toEqual({
      id: "playable", title: "Title", channelName: "Artist", channelId: "channel", thumbnailUrl: "art", durationSeconds: 200,
    });
  });
});
