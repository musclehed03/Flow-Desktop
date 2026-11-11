import { expect, it, vi } from 'vitest';
import { fetchLibraryArtists, searchCatalogArtists } from './multiArtistSearch';
import { getMusicLinkedArtists, searchMusicTyped } from './api/music';
vi.mock('./api/music', () => ({ getMusicLinkedArtists: vi.fn(), searchMusicTyped: vi.fn() }));

const artist = (id: string) => ({ type: 'artist' as const, id, title: id, thumbnail: null, channelId: null });
const song = (id: string) => ({ type: 'song' as const, id, videoId: id, title: id, artists: [], album: null, duration: 180, thumbnail: '', explicit: false, musicVideoType: null, playlistId: null, params: null });

it('returns library artists as-is', async () => {
  vi.mocked(getMusicLinkedArtists).mockResolvedValue([artist('a'), artist('b')]);
  expect(await fetchLibraryArtists()).toEqual([artist('a'), artist('b')]);
  expect(vi.mocked(getMusicLinkedArtists)).toHaveBeenCalledWith(24);
});
it('returns [] when the library lookup fails', async () => {
  vi.mocked(getMusicLinkedArtists).mockRejectedValue(new Error('offline'));
  expect(await fetchLibraryArtists()).toEqual([]);
});
it('returns only artist items from catalog search', async () => {
  vi.mocked(searchMusicTyped).mockResolvedValue({ sections: [{ title: 'Artists', items: [artist('a'), song('s')] }], continuation: null });
  expect(await searchCatalogArtists('a')).toEqual([artist('a')]);
  expect(vi.mocked(searchMusicTyped)).toHaveBeenCalledWith('a', 'artists');
});
it('returns [] for a blank query without searching', async () => {
  vi.mocked(searchMusicTyped).mockClear();
  expect(await searchCatalogArtists('  ')).toEqual([]);
  expect(vi.mocked(searchMusicTyped)).not.toHaveBeenCalled();
});
it('returns [] when catalog search fails', async () => {
  vi.mocked(searchMusicTyped).mockRejectedValue(new Error('offline'));
  expect(await searchCatalogArtists('a')).toEqual([]);
});
