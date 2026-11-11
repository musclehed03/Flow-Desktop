import { supporterTierFrom, type EntitlementId, type SupporterTier } from "./tiers";

/**
 * What this install is, supporter-wise. `source` says where the answer came from:
 * "none" until a verifier plugs in. The verifier — the website's Stripe check, or
 * the Telegram cashier confirming a site-bought pack — belongs in
 * `resolveSupporterStatus` and nowhere else, so the rest of the app only ever
 * reads this shape.
 */
export interface SupporterStatus {
  tier: SupporterTier;
  /** This month's Picks, as granted by the verifier. Empty until one plugs in. */
  entitlements: EntitlementId[];
  source: "none" | "website" | "telegram";
}

export const FREE_SUPPORTER_STATUS: SupporterStatus = { tier: "free", entitlements: [], source: "none" };

/**
 * The current supporter status. Free today: no verifier exists yet, no network is
 * touched, nothing is stored. When the website / Telegram verification lands, this
 * is the one function that changes — it will become async, read the saved
 * verification, and return the real tier plus this month's Picks.
 */
export function resolveSupporterStatus(): SupporterStatus {
  return FREE_SUPPORTER_STATUS;
}

/** Whether `status` currently holds `entitlement` — the check every paid path calls. */
export function hasEntitlement(status: SupporterStatus, entitlement: EntitlementId): boolean {
  return status.entitlements.includes(entitlement);
}

/** A status built from an untrusted source (a stored blob, a verifier's answer). */
export function supporterStatusFrom(value: unknown): SupporterStatus {
  if (typeof value !== "object" || value === null) return FREE_SUPPORTER_STATUS;
  const record = value as Record<string, unknown>;
  const tier = supporterTierFrom(record.tier);
  const entitlements = Array.isArray(record.entitlements)
    ? (record.entitlements.filter(
        (entry): entry is EntitlementId =>
          entry === "preset-pack" || entry === "cloud-sync" || entry === "early-access",
      ) as EntitlementId[])
    : [];
  const source = record.source === "website" || record.source === "telegram" ? record.source : "none";
  // A status that claims a source but grants nothing is a free status with a story.
  return { tier: source === "none" ? "free" : tier, entitlements: source === "none" ? [] : entitlements, source };
}
