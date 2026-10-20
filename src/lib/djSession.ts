import { create } from 'zustand';
import { getWatchHistory } from './api/db';

/** Both transports share IDs; recommendation seeds remain separated by isMusic. */
export const useDjSession = create<{ played: string[] }>(() => ({ played: [] }));
export const sessionPlayed = () => useDjSession.getState().played;
export const rememberPlayed = (id: string) => {
  if (id && !sessionPlayed().includes(id)) useDjSession.setState({ played: [...sessionPlayed(), id] });
};
export const allowReplay = (id: string) => useDjSession.setState({ played: sessionPlayed().filter((value) => value !== id) });
let initialized = false;
export async function hydrateDjSession() {
  if (initialized) return;
  initialized = true;
  const history = await getWatchHistory(100, 0).catch(() => []);
  history.forEach((record) => rememberPlayed(record.videoId));
}
