import type { StringKey } from "../i18n/index";

/*
  Reserved code space for the pay / subscription / monetization paths (fixes batch
  #15). The tiers are decided (Nov 8, 2026): Free Deviant Member $0, Supporter $8/mo,
  Architect $20/mo — but prices live on the website and in Stripe, never here, so
  they are not in this file. The app itself is GPLv3 and stays free forever: no
  feature in this app is locked behind a tier, and nothing here takes a payment.
  What this reserves is the shape: a tier, this month's Picks, and the check every
  future paid path will call — so wiring Stripe / Telegram later touches this one
  module instead of scattering conditionals across the app.
*/

/** The supporter tiers. "free" is the Deviant Member floor every install starts on. */
export type SupporterTier = "free" | "supporter" | "architect";

export const SUPPORTER_TIERS: readonly SupporterTier[] = ["free", "supporter", "architect"];

export const SUPPORTER_TIER_LABELS: Record<SupporterTier, StringKey> = {
  free: "supporter_tier_free",
  supporter: "supporter_tier_supporter",
  architect: "supporter_tier_architect",
};

/**
 * Things a Pick can unlock for a month. A Supporter gets one Pick a month, an
 * Architect three — a pack, a month of sync, or early boutique access — so these
 * are granted per month, never a fixed list per tier.
 */
export type EntitlementId = "preset-pack" | "cloud-sync" | "early-access";

export const ENTITLEMENT_IDS: readonly EntitlementId[] = ["preset-pack", "cloud-sync", "early-access"];

/** Anything unknown reads as the free floor, never as a paid tier. */
export function supporterTierFrom(value: unknown): SupporterTier {
  return value === "supporter" || value === "architect" ? value : "free";
}
