import { useLastfmFlush } from "../../lib/lastfm/useLastfmFlush";

export function LastfmController() {
  useLastfmFlush();
  return null;
}
