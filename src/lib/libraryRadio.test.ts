import { describe, expect, it, vi } from 'vitest';
import { libraryRadioCandidates } from './libraryRadio';
vi.mock('./playlistLibrary', () => ({ loadStoredPlaylists: async () => [
  { source: 'Owned', tracks: [{ id: 'a', title: 'A', channelName: 'Artist' }, { id: 'b', title: 'B', channelName: 'Artist' }] },
  { source: 'Owned', tracks: [{ id: 'c', title: 'C', channelName: 'Other' }] },
  { source: 'Saved', tracks: [{ id: 'not-owned', title: 'No' }] },
] }));
vi.mock('./api/downloads', () => ({ listDownloads: async () => [{ videoId: 'd', title: 'Download', mediaKind: 'music' }] }));
describe('owned library recall', () => {
  it('interleaves owned playlists and downloads, filters session ids, and records provenance', async () => {
    const songs = await libraryRadioCandidates(new Set(['b']));
    expect(songs.map((song) => song.id)).toEqual(['d', 'a', 'c']);
    expect(songs.every((song) => song.radioReason?.kind === 'library')).toBe(true);
    expect(songs[0]?.libraryVideo).toBeUndefined();
    expect(songs[1]?.libraryVideo?.id).toBe('a');
  });
});
