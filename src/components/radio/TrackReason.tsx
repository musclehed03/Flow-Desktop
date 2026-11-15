import { getString } from '../../lib/i18n/index';
import type { SongItem } from '../../types/music';
export function TrackReason({ reason }: { reason?: SongItem['radioReason'] }) {
  if (!reason || (reason.kind === 'station' && !reason.seedName)) return null;
  return <span className="block px-3 pb-1 text-xs text-on-surface-variant">{getString(reason.kind === 'library' ? 'settings_radio_fromLibrary' : 'settings_radio_similarTo', reason.seedName)}</span>;
}
