import type { SettingKey } from "./settings/schema";
import { SETTINGS } from "./settings/schema";

export const SENSORY_SETTINGS = [
  ['focus', SETTINGS.SENSORY_FOCUS_ENABLED], ['motion', SETTINGS.SAFE_MOTION_ENABLED],
  ['font', SETTINGS.READABLE_FONT_ENABLED], ['contrast', SETTINGS.HIGH_CONTRAST_ENABLED],
  ['colorBlind', SETTINGS.COLOR_BLIND_ENABLED], ['simplified', SETTINGS.SIMPLIFIED_VIEW_ENABLED],
] as const satisfies ReadonlyArray<readonly [string, SettingKey]>;
