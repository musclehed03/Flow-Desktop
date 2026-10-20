import { afterEach, expect, it, vi } from 'vitest';
import { stationFallback } from './musicStation';
import { relatedSongs } from './musicRecall';
import { buildQuickPicks } from './musicQuickPicksBuilder';
import { libraryRadioCandidates } from './libraryRadio';
import type { SongItem } from '../types/music';
vi.mock('./musicRecall', () => ({ relatedSongs: vi.fn(), audioMusicOnly: (songs: SongItem[]) => songs }));
vi.mock('./api/db', () => ({ getMusicHistory: async () => [] }));
vi.mock('./musicQuickPicksBuilder', () => ({ buildQuickPicks: vi.fn() }));
vi.mock('./libraryRadio', () => ({ libraryRadioCandidates: vi.fn() }));
const song = (id: string) => ({ id, videoId: id }) as SongItem;
afterEach(() => vi.resetAllMocks());
it('keeps Quick Picks even though its builder claims returned ids in the supplied set', async () => {
  vi.mocked(relatedSongs).mockResolvedValue([]);
  vi.mocked(buildQuickPicks).mockImplementation(async (_history, _last, used) => { used.add('pick'); return [song('pick')]; });
  expect((await stationFallback(song('seed'), new Set(['seen']))).map((item) => item.id)).toEqual(['pick']);
  expect(libraryRadioCandidates).not.toHaveBeenCalled();
});
it('tries owned library when related and history/like recall are exhausted', async () => {
  vi.mocked(relatedSongs).mockResolvedValue([song('seen')]);
  vi.mocked(buildQuickPicks).mockResolvedValue([]);
  vi.mocked(libraryRadioCandidates).mockResolvedValue([song('owned')]);
  expect((await stationFallback(song('seed'), new Set(['seen'])))[0]?.id).toBe('owned');
  expect(libraryRadioCandidates).toHaveBeenCalledWith(new Set(['seen']));
});
