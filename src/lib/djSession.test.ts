import { afterEach, expect, it } from 'vitest';
import { allowReplay, rememberPlayed, sessionPlayed, useDjSession } from './djSession';
afterEach(() => useDjSession.setState({ played: [] }));
it('shares IDs between transports and allows an explicit replay', () => {
  rememberPlayed('music-to-watch');
  expect(sessionPlayed()).toEqual(['music-to-watch']);
  rememberPlayed('music-to-watch');
  expect(sessionPlayed()).toHaveLength(1);
  allowReplay('music-to-watch');
  expect(sessionPlayed()).toEqual([]);
});
