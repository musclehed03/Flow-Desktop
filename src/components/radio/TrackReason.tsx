import { useTranslation } from 'react-i18next';
import type { SongItem } from '../../types/music';
export function TrackReason({ reason }: { reason?: SongItem['radioReason'] }) {
  const { t } = useTranslation('settings');
  if (!reason || (reason.kind === 'station' && !reason.seedName)) return null;
  return <span className="block px-3 pb-1 text-xs text-on-surface-variant">{t(reason.kind === 'library' ? 'radio.fromLibrary' : 'radio.similarTo', { name: reason.seedName })}</span>;
}
