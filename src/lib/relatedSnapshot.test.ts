import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRelatedSnapshot, filterRelatedSnapshot, useRelatedSnapshot } from './relatedSnapshot';
import { relatedSongs } from './musicRecall';
import { useMusicPlayerStore } from '../store/useMusicPlayerStore';
import type { SongItem } from '../types/music';
vi.mock('./playlistLibrary', () => ({ loadStoredPlaylists: async () => [
  { source: 'Owned', tracks: [{ id: 'owned' }] }, { source: 'Saved', tracks: [{ id: 'saved' }] },
] }));
vi.mock('./musicRecall', () => ({ relatedSongs: vi.fn(), ranked: async (songs: SongItem[]) => songs, recallArtist: vi.fn(), audioMusicOnly: (songs: SongItem[]) => songs }));
vi.mock('./streamResolution', () => ({ prefetchStreamInfo: vi.fn() }));
const song = (id: string): SongItem => ({ id, videoId: id, title: id, artists: [{ id: 'artist', name: 'Artist' }], album: null, duration: 180, musicVideoType: null, thumbnail: '', explicit: false, playlistId: null, params: null });
afterEach(() => { useRelatedSnapshot.getState().close(); vi.clearAllMocks(); });
describe('frozen Related Songs snapshots', () => {
  it('excludes ids in every stored playlist, the queue, the seed, and duplicate candidates', async () => {
    vi.mocked(relatedSongs).mockResolvedValue(['owned', 'saved', 'queued', 'seed', 'fresh', 'fresh'].map(song));
    expect((await buildRelatedSnapshot({ kind: 'music', song: song('seed') }, ['queued'])).map((row) => row.id)).toEqual(['fresh']);
    expect(filterRelatedSnapshot([{ id: 'x', title: 'x', artist: '' }], ['x'], [], 'seed')).toEqual([]);
  });
  it('keeps the snapshot byte-identical on track advance and marks Added outside the immutable rows', async () => {
    vi.mocked(relatedSongs).mockResolvedValue([song('fresh')]);
    await useRelatedSnapshot.getState().show({ kind: 'music', song: song('seed') }, []);
    const rows = useRelatedSnapshot.getState().rows;
    const serialized = JSON.stringify(rows);
    useMusicPlayerStore.setState({ currentTrack: song('next-track'), currentIndex: 1 });
    expect(useRelatedSnapshot.getState().rows).toBe(rows);
    expect(JSON.stringify(useRelatedSnapshot.getState().rows)).toBe(serialized);
    const append = vi.spyOn(useMusicPlayerStore.getState(), 'addToQueue').mockImplementation(() => {});
    useRelatedSnapshot.getState().add(rows[0]!, false);
    expect(useRelatedSnapshot.getState().added).toEqual(['fresh']);
    expect(JSON.stringify(useRelatedSnapshot.getState().rows)).toBe(serialized);
    expect(relatedSongs).toHaveBeenCalledTimes(1);
    append.mockRestore();
  });
  it('discards on close and reseeds only on reopen', async () => {
    vi.mocked(relatedSongs).mockResolvedValue([song('first-related')]);
    await useRelatedSnapshot.getState().show({ kind: 'music', song: song('first') }, []);
    useRelatedSnapshot.getState().close();
    expect(useRelatedSnapshot.getState().rows).toEqual([]);
    vi.mocked(relatedSongs).mockResolvedValue([song('second-related')]);
    await useRelatedSnapshot.getState().show({ kind: 'music', song: song('second') }, []);
    expect(relatedSongs).toHaveBeenLastCalledWith('second');
    expect(useRelatedSnapshot.getState().rows[0]?.id).toBe('second-related');
  });
  it('ignores a pending response after the snapshot was closed', async () => {
    let resolve!: (songs: SongItem[]) => void;
    vi.mocked(relatedSongs).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = useRelatedSnapshot.getState().show({ kind: 'music', song: song('seed') }, []);
    await vi.waitFor(() => expect(relatedSongs).toHaveBeenCalled());
    useRelatedSnapshot.getState().close();
    resolve([song('late')]); await pending;
    expect(useRelatedSnapshot.getState().rows).toEqual([]);
    expect(useRelatedSnapshot.getState().open).toBe(false);
  });
});
