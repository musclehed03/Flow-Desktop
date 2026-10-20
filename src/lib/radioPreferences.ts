import { setSettingValue } from '../store/useAppSettingsStore';
import { useMusicPlayerStore } from '../store/useMusicPlayerStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { SETTINGS } from './settings/schema';
import type { DiscoveryLevel } from './musicStation';

export async function changeRadioDiscovery(level: DiscoveryLevel) {
  if (!await setSettingValue(SETTINGS.RADIO_DISCOVERY_LEVEL, level)) return;
  const music = useMusicPlayerStore.getState().station;
  const video = usePlayerStore.getState().musicStation;
  if (music) useMusicPlayerStore.setState({ station: { ...music, discovery: level } });
  if (video) usePlayerStore.setState({ musicStation: { ...video, discovery: level } });
}
