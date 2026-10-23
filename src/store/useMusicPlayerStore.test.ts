import { useDjSession, rememberPlayed } from "../lib/djSession";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SongItem } from "../types/music";

const song = (id: string): SongItem => ({
  id,
  title: `Song ${id}`,
  artists: [],
  album: null,
  duration: 200,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
  thumbnail: "",
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const { getMusicWatchQueue } = vi.hoisted(() => ({ getMusicWatchQueue: vi.fn() }));

vi.mock("../lib/api/music", () => ({
  getMusicWatchQueue,
  getMusicQueueContinuation: vi.fn(),
  rankMusicCandidates: (items: SongItem[]) => Promise.resolve(items),
}));

import { selectRadioOn, useMusicPlayerStore } from "./useMusicPlayerStore";
import { useUiStore } from "./useUiStore";

beforeEach(() => {
  getMusicWatchQueue.mockResolvedValue({
    items: [song("r1"), song("r2"), song("r3")],
    continuation: null,
    radioPlaylistId: null,
  });
  useMusicPlayerStore.setState({
    radioEnabled: false,
    radioStationActive: false,
    queueSource: null,
    isShuffle: false,
    _loadIndex: vi.fn(),
  });
});

afterEach(() => {
  useDjSession.setState({ played: [] });
  useUiStore.getState().dismissToast();
  vi.clearAllMocks();
});

describe("start radio", () => {
  it("extends the station without switching the radio setting on", async () => {
    await useMusicPlayerStore.getState().startRadio(song("seed"));
    await useMusicPlayerStore.getState()._ensureRadio();

    const state = useMusicPlayerStore.getState();
    expect(state.radioEnabled).toBe(false);
    expect(state.queue.map((t) => t.id)).toEqual(["seed", "r1", "r2", "r3"]);
  });

  it("stops extending when the radio switch is turned off", async () => {
    useMusicPlayerStore.setState({ radioEnabled: true });
    await useMusicPlayerStore.getState().startRadio(song("seed"));
    useMusicPlayerStore.getState().toggleRadio();
    await useMusicPlayerStore.getState()._ensureRadio();

    expect(getMusicWatchQueue).not.toHaveBeenCalled();
    expect(useMusicPlayerStore.getState().queue.map((t) => t.id)).toEqual(["seed"]);
  });

  it("shows as on while the station plays, and one click stops it", async () => {
    await useMusicPlayerStore.getState().startRadio(song("seed"));
    expect(selectRadioOn(useMusicPlayerStore.getState())).toBe(true);

    useMusicPlayerStore.getState().toggleRadio();
    await useMusicPlayerStore.getState()._ensureRadio();

    const state = useMusicPlayerStore.getState();
    expect(selectRadioOn(state)).toBe(false);
    expect(state.radioEnabled).toBe(false);
    expect(getMusicWatchQueue).not.toHaveBeenCalled();
  });

  it("ends with the next queue the user plays", async () => {
    await useMusicPlayerStore.getState().startRadio(song("seed"));
    await useMusicPlayerStore.getState().playQueue([song("a"), song("b")]);
    await useMusicPlayerStore.getState()._ensureRadio();

    expect(getMusicWatchQueue).not.toHaveBeenCalled();
    expect(selectRadioOn(useMusicPlayerStore.getState())).toBe(false);
    expect(useMusicPlayerStore.getState().queue.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe('queue source ("Playing from")', () => {
  it("remembers where a queue was started from", async () => {
    await useMusicPlayerStore.getState().playQueue([song("a"), song("b")], 0, "Quick picks");
    expect(useMusicPlayerStore.getState().queueSource).toBe("Quick picks");
  });

  it("forgets the source when a radio or a single track replaces the queue", async () => {
    await useMusicPlayerStore.getState().playQueue([song("a")], 0, "Quick picks");
    await useMusicPlayerStore.getState().startRadio(song("b"));
    expect(useMusicPlayerStore.getState().queueSource).toBeNull();

    await useMusicPlayerStore.getState().playQueue([song("a")], 0, "Speed dial");
    await useMusicPlayerStore.getState().playTrack(song("c"));
    expect(useMusicPlayerStore.getState().queueSource).toBeNull();
  });
});

describe("idle queue actions", () => {
  it("starts the first queued track when add to queue is used while idle", () => {
    const loadIndex = vi.fn();
    useMusicPlayerStore.setState({
      queue: [],
      currentTrack: null,
      currentIndex: -1,
      isPlaying: false,
      _loadIndex: loadIndex,
    });

    useMusicPlayerStore.getState().addToQueue(song("queued"));

    expect(useMusicPlayerStore.getState().queue.map((track) => track.id)).toEqual(["queued"]);
    expect(loadIndex).toHaveBeenCalledWith(0);
    expect(useUiStore.getState().toast?.message).toBe("Added to queue");
  });

  it("starts the existing queue head when play next is used while idle", () => {
    const loadIndex = vi.fn();
    useMusicPlayerStore.setState({
      queue: [song("head")],
      currentTrack: null,
      currentIndex: -1,
      isPlaying: false,
      _loadIndex: loadIndex,
    });

    useMusicPlayerStore.getState().playNextInQueue(song("requested"));

    expect(useMusicPlayerStore.getState().queue.map((track) => track.id)).toEqual(["head", "requested"]);
    expect(loadIndex).toHaveBeenCalledWith(0);
    expect(useUiStore.getState().toast?.message).toBe("Added to queue");
  });

  it("plays now immediately from an idle queue", async () => {
    const loadIndex = vi.fn();
    useMusicPlayerStore.setState({
      queue: [song("old")],
      currentTrack: null,
      currentIndex: -1,
      isPlaying: false,
      _loadIndex: loadIndex,
    });

    await useMusicPlayerStore.getState().playTrack(song("now"));

    expect(useMusicPlayerStore.getState().queue.map((track) => track.id)).toEqual(["now"]);
    expect(loadIndex).toHaveBeenCalledWith(0);
  });
});

import { useAppSettingsStore } from './useAppSettingsStore';
import { SETTINGS } from '../lib/settings/schema';
import { recallArtist } from '../lib/musicRecall';
vi.mock('../lib/musicRecall', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/musicRecall')>()), recallArtist: vi.fn() }));

describe('artist stations and Genius session', () => {
  it('starts an artist station with the top seed and applies the own-catalog quota', async () => {
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.GENIUS_DJ_ENABLED]: 'true', [SETTINGS.RADIO_DISCOVERY_LEVEL]: 'less' } });
    const own = Array.from({ length: 12 }, (_, i) => ({ ...song(`own-${i}`), artists: [{ id: 'artist', name: 'Artist' }] }));
    vi.mocked(recallArtist).mockResolvedValue({ topSongs: own } as Awaited<ReturnType<typeof recallArtist>>);
    getMusicWatchQueue.mockResolvedValue({ items: Array.from({ length: 10 }, (_, i) => ({ ...song(`other-${i}`), artists: [{ id: 'other', name: 'Other' }] })), continuation: null, radioPlaylistId: null });
    useMusicPlayerStore.setState({ currentTrack: null, playedIds: [], currentIndex: 0 });
    await useMusicPlayerStore.getState().startArtistRadio({ id: 'artist', title: 'Artist', thumbnail: null, channelId: null });
    await useMusicPlayerStore.getState()._ensureRadio();
    const state = useMusicPlayerStore.getState();
    expect(state.station?.type).toBe('artist');
    expect(state.queue[0]?.id).toBe('own-0');
    expect(state.queue.slice(1).filter((track) => track.artists[0]?.id === 'artist').length).toBeGreaterThanOrEqual(7);
    useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.RADIO_DISCOVERY_LEVEL]: 'moderate' } });
  });
  it('lets an explicit add replay a previously played item', () => {
    rememberPlayed('played');
    useMusicPlayerStore.setState({ queue: [song('played')], currentIndex: 0, playedIds: ['played'] });
    useMusicPlayerStore.getState().addToQueue(song('played'));
    expect(useMusicPlayerStore.getState().queue).toHaveLength(2);
    expect(useMusicPlayerStore.getState().playedIds).not.toContain('played');
  });
});
