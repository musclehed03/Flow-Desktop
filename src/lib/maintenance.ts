import { getSetting, setSetting } from "./api/db";
import { isTauriEnv } from "./api/env";
import { writeBackupFile } from "./api/files";
import { getChannelDetails } from "./api/youtube";
import { buildSettingsBackupJson, type SettingsBackupScope } from "./settings/backup";
import { SETTINGS } from "./settings/schema";
import { getSettingValue } from "../store/useAppSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";

export type BackupFrequency = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
const LAST_BACKUP_KEY = "scheduled_backup_last_run";
const INTERVALS: Record<Exclude<BackupFrequency, "NONE">, number> = {
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
};

export function backupIsDue(frequency: BackupFrequency, lastRun: number | null, now = Date.now()): boolean {
  if (frequency === "NONE") return false;
  return lastRun === null || now - lastRun >= INTERVALS[frequency];
}

export async function runScheduledBackup(now = Date.now()): Promise<"written" | "not-due" | "not-configured"> {
  const frequency = getSettingValue(SETTINGS.AUTO_BACKUP_FREQUENCY) as BackupFrequency;
  const directory = getSettingValue(SETTINGS.AUTO_BACKUP_LOCATION).trim();
  const lastRaw = await getSetting(LAST_BACKUP_KEY);
  const lastRun = lastRaw && Number.isFinite(Number(lastRaw)) ? Number(lastRaw) : null;
  if (!backupIsDue(frequency, lastRun, now)) return "not-due";
  if (!directory || !(await isTauriEnv())) return "not-configured";
  const scope = getSettingValue(SETTINGS.AUTO_BACKUP_TYPE) as SettingsBackupScope;
  const contents = await buildSettingsBackupJson(scope);
  const stamp = new Date(now).toISOString().replace(/:/g, "-");
  const separator = directory.includes("\\") ? "\\" : "/";
  await writeBackupFile(`${directory.replace(/[\\/]$/, "")}${separator}flow_backup_${scope.toLowerCase()}_${stamp}.json`, contents);
  await setSetting(LAST_BACKUP_KEY, String(now));
  return "written";
}

export async function refreshSubscriptionsOnStartup(): Promise<number> {
  if (getSettingValue(SETTINGS.SUBSCRIPTION_REFRESH_ON_STARTUP) !== "true") return 0;
  const store = useSubscriptionStore.getState();
  await store.loadSubscriptions();
  const subscriptions = useSubscriptionStore.getState().subscriptions;
  const updates: Record<string, { name?: string; avatarUrl?: string; subscriberCountText?: string }> = {};
  for (let offset = 0; offset < subscriptions.length; offset += 4) {
    const batch = subscriptions.slice(offset, offset + 4);
    const details = await Promise.all(batch.map((channel) => getChannelDetails(channel.id).catch(() => null)));
    details.forEach((detail, index) => {
      const channel = batch[index];
      if (!detail || !channel) return;
      updates[channel.id] = {
        name: detail.name || channel.name,
        avatarUrl: detail.avatarUrl || channel.avatarUrl,
        subscriberCountText: detail.subscriberCountText || channel.subscriberCountText,
      };
    });
  }
  await useSubscriptionStore.getState().mergeSubscriptions(updates);
  return Object.keys(updates).length;
}
