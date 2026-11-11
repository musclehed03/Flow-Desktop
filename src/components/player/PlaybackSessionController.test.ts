import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setSetting as persistSetting } from "../../lib/api/db";
import { serializePlaybackSession } from "../../lib/playbackSession";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import type { SongItem } from "../../types/music";
import { PlaybackSessionController } from "./PlaybackSessionController";

vi.mock("../../lib/api/db", () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => undefined) }));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const track = (id: string): SongItem => ({
  id,
  title: id,
  artists: [],
  album: null,
  duration: 200,
  musicVideoType: null,
  thumbnail: "",
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const savedSession = serializePlaybackSession({ queue: [track("saved-a"), track("saved-b")], currentIndex: 1, position: 30, playing: false });
const freshQueue = [track("fresh-a"), track("fresh-b")];

const settingsOriginal = useAppSettingsStore.getState();
const musicOriginal = useMusicPlayerStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  useAppSettingsStore.setState(settingsOriginal);
  useMusicPlayerStore.setState(musicOriginal);
  document.body.replaceChildren();
});

async function mountController() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(PlaybackSessionController)));
  return root;
}

function seedSettings(loadFailed: boolean) {
  useAppSettingsStore.setState({
    values: {
      ...settingsOriginal.values,
      [SETTINGS.MUSIC_PLAYBACK_SESSION]: savedSession,
      [SETTINGS.VIDEO_PLAYBACK_SESSION]: "{}",
      [SETTINGS.MUSIC_PLAYBACK_POSITION]: "30",
      [SETTINGS.VIDEO_PLAYBACK_POSITION]: "null",
      [SETTINGS.RESTORE_QUEUE_ON_OPEN]: "true",
      [SETTINGS.RESUME_PLAYBACK_ON_OPEN]: "false",
    },
    loaded: true,
    loadFailed,
  });
}

it("restores a saved session into an empty player (fixes batch #11)", async () => {
  useMusicPlayerStore.setState({ queue: [], currentTrack: null, currentIndex: -1 });
  seedSettings(false);
  const root = await mountController();
  expect(useMusicPlayerStore.getState().queue.map((t) => t.id)).toEqual(["saved-a", "saved-b"]);
  expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("saved-b");
  await act(async () => root.unmount());
});

it("never overwrites a saved session when settings failed to load (fixes batch #11)", async () => {
  useMusicPlayerStore.setState({ queue: [], currentTrack: null, currentIndex: -1 });
  seedSettings(true);
  const root = await mountController();
  // Nothing restored — and unmounting must not flush the empty player over
  // the session that is still sitting in the database.
  expect(useMusicPlayerStore.getState().queue).toEqual([]);
  await act(async () => root.unmount());
  expect(persistSetting).not.toHaveBeenCalledWith(SETTINGS.MUSIC_PLAYBACK_SESSION, expect.anything());
  expect(useAppSettingsStore.getState().values[SETTINGS.MUSIC_PLAYBACK_SESSION]).toBe(savedSession);
});

it("never clobbers a queue built before settings finished loading (fixes batch #11)", async () => {
  useMusicPlayerStore.setState({ queue: freshQueue, currentTrack: freshQueue[0]!, currentIndex: 0 });
  seedSettings(false);
  const root = await mountController();
  expect(useMusicPlayerStore.getState().queue.map((t) => t.id)).toEqual(["fresh-a", "fresh-b"]);
  expect(useMusicPlayerStore.getState().currentTrack?.id).toBe("fresh-a");
  await act(async () => root.unmount());
});
