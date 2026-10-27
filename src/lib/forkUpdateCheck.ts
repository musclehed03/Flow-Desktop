import { getSetting, setSetting } from "./api/db";
import { getAppMetadata } from "./appMetadata";

const LAST_CHECK_KEY = "fork_update_last_check";
const RELEASE_API = "https://api.github.com/repos/musclehed03/Flow-Desktop/releases/latest";
export const FORK_RELEASES_URL = "https://github.com/musclehed03/Flow-Desktop/releases";
const DAY_MS = 24 * 60 * 60 * 1000;

const parts = (version: string) => version.replace(/^v/, "").split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part);
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parts(candidate), right = parts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index] ?? 0, b = right[index] ?? 0;
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") return a > b;
    if (typeof a === "number") return true;
    if (typeof b === "number") return false;
    return String(a).localeCompare(String(b)) > 0;
  }
  return false;
}

export async function checkForkRelease(now = Date.now()): Promise<{ version: string; url: string } | null> {
  const last = Number(await getSetting(LAST_CHECK_KEY) ?? 0);
  if (Number.isFinite(last) && now - last < DAY_MS) return null;
  await setSetting(LAST_CHECK_KEY, String(now));
  const response = await fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
  const release = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean };
  if (!release.tag_name || release.draft) return null;
  const current = (await getAppMetadata()).version;
  return isNewerVersion(release.tag_name, current) ? { version: release.tag_name.replace(/^v/, ""), url: release.html_url || FORK_RELEASES_URL } : null;
}
