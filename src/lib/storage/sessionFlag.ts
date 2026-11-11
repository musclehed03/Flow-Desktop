// Per-window flags, such as "this session already saw the advisory", live in
// sessionStorage, not localStorage: they die with the window and are never
// profile data, so they must not go through the profile-scoped helper in
// profileStorage.ts. This file is inside src/lib/storage/, which the web
// storage guard exempts, so this is the one sanctioned sessionStorage use.

export function getSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function setSessionFlag(key: string, value: boolean): void {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // The flag still lasts for this window's lifetime.
  }
}
