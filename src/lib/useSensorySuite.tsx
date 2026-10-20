import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import { SENSORY_SETTINGS } from "./accessibility";
import { SETTINGS } from "./settings/schema";
import { useMusicKeyboardShortcuts } from "./useMusicKeyboardShortcuts";

export function SensoryRoot({ children }: { children: ReactNode }) {
  const values = useAppSettingsStore((s) => s.values);
  const safe = values[SETTINGS.SAFE_MOTION_ENABLED] === 'true';
  useMusicKeyboardShortcuts();
  useEffect(() => {
    for (const [name, key] of SENSORY_SETTINGS) document.documentElement.classList.toggle(`sensory-${name}`, values[key] === 'true');
  }, [values]);
  return <MotionConfig reducedMotion={safe ? 'always' : 'user'} transition={safe ? { duration: 0 } : undefined}>{children}</MotionConfig>;
}
