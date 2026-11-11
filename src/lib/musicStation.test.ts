import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankStationBatch, trackStation, targetNovelty, fetchStationPage, multiArtistStation, recallMultiArtistSeeds, expandStationCandidates } from './musicStation';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { SETTINGS } from './settings/schema';
import { getMusicMoodGenre, getMusicWatchQueue, getMusicArtistPage, getMusicQueueContinuation } from './api/music';
import type { SongItem, ArtistItem, ArtistPage } from '../types/music';
vi.mock('./api/music', () => ({
  rankMusicCandidates: async (songs: SongItem[]) => songs,
  getMusicMoodGenre: vi.fn(), getMusicWatchQueue: vi.fn(), getMusicQueueContinuation: vi.fn(),
  getMusicArtistPage: vi.fn(),
}));
const original = useAppSettingsStore.getState().values;
const song = (id: string, artist = 'anchor'): SongItem => ({ id, videoId: id, title: id,
  artists: [{ id: artist, name: artist }], album: null, duration: 180, musicVideoType: null,
  thumbnail: '', explicit: false, playlistId: null, params: null });
afterEach(() => useAppSettingsStore.setState({ values: original }));
function level(value: string) {
  useAppSettingsStore.setState({ values: { ...original, [SETTINGS.GENIUS_DJ_ENABLED]: 'true', [SETTINGS.RADIO_DISCOVERY_LEVEL]: value } });
}
describe('radio discovery', () => {
  it('maps less and more while moderate retains the learned-appetite pipeline', () => {
    level('less'); expect(targetNovelty()).toBe(0.10);
    level('more'); expect(targetNovelty()).toBe(0.65);
    level('moderate'); expect(targetNovelty()).toBeUndefined();
  });
  it('reserves at least seven of ten for the seed artist when available', async () => {
    level('less');
    const candidates = [...Array.from({ length: 10 }, (_, i) => song(`other-${i}`, 'other')),
      ...Array.from({ length: 12 }, (_, i) => song(`own-${i}`))];
    const batch = await rankStationBatch(candidates, trackStation(song('seed')));
    expect(batch).toHaveLength(10);
    expect(batch.filter((s) => s.artists[0]?.id === 'anchor')).toHaveLength(7);
  });
  it('uses every available own-catalog track when fewer than seven remain', async () => {
    level('less');
    const batch = await rankStationBatch([song('o1', 'other'), song('own')], trackStation(song('seed')));
    expect(batch.map((s) => s.id)).toEqual(['own', 'o1']);
  });
  it('alternates genre continuation with the track station without losing genre identity', async () => {
    vi.mocked(getMusicMoodGenre).mockResolvedValue({ title: 'Genre', items: [{ type: 'song', ...song('genre') }], continuation: 'genre-next' });
    vi.mocked(getMusicWatchQueue).mockResolvedValue({ items: [song('station')], continuation: 'station-next', radioPlaylistId: 'station-id' } as Awaited<ReturnType<typeof getMusicWatchQueue>>);
    const station = { ...trackStation(song('seed')), type: 'genre' as const, browseId: 'genre', params: 'params', title: 'Genre', genreContinuation: 'genre-token' };
    const first = await fetchStationPage(station, song('seed'));
    expect(getMusicMoodGenre).toHaveBeenCalledWith('genre', 'params', 'genre-token');
    const next = await fetchStationPage(first.station, song('last'));
    expect(next.station).toMatchObject({ type: 'genre', browseId: 'genre', genreContinuation: 'genre-next', continuation: 'station-next', genreTurn: true });
  });
});
describe('multi-artist stations', () => {
  const artist = (id: string, title: string): ArtistItem => ({ id, title, thumbnail: null, channelId: null });
  const artistPage = (id: string, songs: SongItem[], related: string[] = []): ArtistPage => ({
    artist: artist(id, id),
    sections: [
      { title: 'Top songs', items: songs.map((s) => ({ type: 'song', ...s })), moreEndpointBrowseId: null, moreEndpointParams: null, kind: 'topSongs' },
      { title: 'Related', items: related.map((r) => ({ type: 'artist', ...artist(r, r) })), moreEndpointBrowseId: null, moreEndpointParams: null, kind: 'relatedArtists' },
    ],
    description: null, subscriberCountText: null, monthlyListenerCount: null, isSubscribed: false,
  } as ArtistPage);
  it('builds a titled station from picker roots', () => {
    const station = multiArtistStation([artist('a', 'A'), artist('b', 'B')], song('seed'));
    expect(station.type).toBe('multi-artist');
    expect(station.title).toBe('A + B');
    expect(station.roots).toHaveLength(2);
    expect(station.rootCursor).toBe(0);
  });
  it('recalls only four roots at startup, round-robined', async () => {
    const roots = Array.from({ length: 6 }, (_, i) => artist(`root-${i}`, `Root ${i}`));
    const pages: Record<string, ArtistPage> = {};
    for (let i = 0; i < 6; i++) pages[`root-${i}`] = artistPage(`root-${i}`,
      [song(`r${i}-s0`, `root-${i}`), song(`r${i}-s1`, `root-${i}`), song(`r${i}-s2`, `root-${i}`), song(`r${i}-s3`, `root-${i}`)]);
    vi.mocked(getMusicArtistPage).mockClear();
    vi.mocked(getMusicArtistPage).mockImplementation(async (id: string) => pages[id]!);
    const { songs, rootSeeds } = await recallMultiArtistSeeds(multiArtistStation(roots, song('seed')));
    expect(songs.map((s) => s.id)).toEqual(['r0-s0', 'r1-s0', 'r2-s0', 'r3-s0', 'r0-s1', 'r1-s1', 'r2-s1', 'r3-s1', 'r0-s2', 'r1-s2', 'r2-s2', 'r3-s2']);
    expect(Object.keys(rootSeeds)).toEqual(['root-0', 'root-1', 'root-2', 'root-3']);
    expect(vi.mocked(getMusicArtistPage)).not.toHaveBeenCalledWith('root-4');
  });
  it('rotates roots one page each and continues each root where it left off', async () => {
    const roots = [artist('root-0', 'Root 0'), artist('root-1', 'Root 1')];
    vi.mocked(getMusicArtistPage).mockImplementation(async (id: string) =>
      artistPage(id, [song(`${id}-top`, id)], id === 'root-0' ? ['rel-0'] : []));
    vi.mocked(getMusicWatchQueue).mockImplementation(async (videoId?: string) => ({
      items: [song(`${videoId ?? "seed"}-q0`)], continuation: `${videoId ?? "seed"}-next`, radioPlaylistId: `RD-${videoId ?? "seed"}`, radioParams: null,
    } as Awaited<ReturnType<typeof getMusicWatchQueue>>));
    vi.mocked(getMusicQueueContinuation).mockResolvedValue({ items: [song('root-0-top-q1')], continuation: null } as Awaited<ReturnType<typeof getMusicQueueContinuation>>);
    const station = multiArtistStation(roots, song('seed'));
    const first = await fetchStationPage(station, song('seed'));
    expect(first.songs.map((s) => s.id)).toEqual(['root-0-top-q0']);
    expect(first.station.rootCursor).toBe(1);
    expect(first.station.frontier).toEqual(['rel-0']);
    const second = await fetchStationPage(first.station, song('seed'));
    expect(second.songs.map((s) => s.id)).toEqual(['root-1-top-q0']);
    expect(second.station.rootCursor).toBe(0);
    const third = await fetchStationPage(second.station, song('seed'));
    expect(third.songs.map((s) => s.id)).toEqual(['root-0-top-q1']);
    expect(vi.mocked(getMusicQueueContinuation)).toHaveBeenCalledWith('root-0-top-next');
  });
  it('walks the frontier two artists at a time on more discovery', async () => {
    level('more');
    vi.mocked(getMusicArtistPage).mockImplementation(async (id: string) =>
      artistPage(id, [song(`${id}-top`, id)], id === 'f1' ? ['new-1'] : []));
    const station = { ...multiArtistStation([artist('root-0', 'Root 0')], song('seed')), discovery: 'more' as const, frontier: ['f1', 'f2', 'f3'] };
    const expanded = await expandStationCandidates(station, [song('page-song')]);
    expect(expanded.songs.map((s) => s.id)).toEqual(['page-song', 'f1-top', 'f2-top']);
    expect(expanded.station.frontier).toEqual(['f3', 'new-1']);
  });
  it('counts any root as own for the less-discovery quota', async () => {
    level('less');
    const station = multiArtistStation([artist('root-0', 'Root 0'), artist('root-1', 'Root 1')], song('seed'));
    const candidates = [...Array.from({ length: 10 }, (_, i) => song(`other-${i}`, 'other')),
      ...Array.from({ length: 6 }, (_, i) => song(`own-a-${i}`, 'root-0')),
      ...Array.from({ length: 6 }, (_, i) => song(`own-b-${i}`, 'root-1'))];
    const batch = await rankStationBatch(candidates, station);
    expect(batch).toHaveLength(10);
    expect(batch.filter((s) => s.artists[0]?.id === 'root-0' || s.artists[0]?.id === 'root-1')).toHaveLength(7);
  });
});
