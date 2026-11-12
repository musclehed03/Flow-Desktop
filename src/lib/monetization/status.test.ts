import { describe, expect, it } from "vitest";

import { FREE_SUPPORTER_STATUS, hasEntitlement, resolveSupporterStatus, supporterStatusFrom } from "./status";
import { supporterTierFrom } from "./tiers";

describe("supporter status", () => {
  it("starts free, with nothing granted and no verifier, until one plugs in", () => {
    expect(resolveSupporterStatus()).toEqual({ tier: "free", entitlements: [], source: "none" });
    expect(hasEntitlement(FREE_SUPPORTER_STATUS, "preset-pack")).toBe(false);
    expect(hasEntitlement(FREE_SUPPORTER_STATUS, "cloud-sync")).toBe(false);
    expect(hasEntitlement(FREE_SUPPORTER_STATUS, "early-access")).toBe(false);
  });

  it("grants only what the verifier granted, per month's Pick", () => {
    const status = { tier: "supporter" as const, entitlements: ["preset-pack" as const], source: "website" as const };
    expect(hasEntitlement(status, "preset-pack")).toBe(true);
    expect(hasEntitlement(status, "cloud-sync")).toBe(false);
  });

  it("reads anything unknown as the free floor, never as a paid tier", () => {
    expect(supporterTierFrom("architect")).toBe("architect");
    expect(supporterTierFrom("supporter")).toBe("supporter");
    expect(supporterTierFrom("ADMIN")).toBe("free");
    expect(supporterTierFrom(undefined)).toBe("free");
  });

  it("distrusts a stored status that claims a tier with no verifier behind it", () => {
    expect(supporterStatusFrom({ tier: "architect", entitlements: ["cloud-sync"], source: "none" })).toEqual(
      FREE_SUPPORTER_STATUS,
    );
    expect(supporterStatusFrom({ tier: "bogus", entitlements: ["bogus"], source: "website" })).toEqual({
      tier: "free",
      entitlements: [],
      source: "website",
    });
    expect(supporterStatusFrom("free")).toEqual(FREE_SUPPORTER_STATUS);
  });

  it("keeps a verified free member's bought pack: Picks are not only for subscribers", () => {
    expect(
      supporterStatusFrom({ tier: "free", entitlements: ["preset-pack"], source: "telegram" }),
    ).toEqual({ tier: "free", entitlements: ["preset-pack"], source: "telegram" });
  });
});
