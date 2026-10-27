import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./forkUpdateCheck";

describe("fork release versions", () => {
  it("compares stable and beta tags without changing the installed version", () => {
    expect(isNewerVersion("v0.1.0-beta3", "0.1.0-beta2")).toBe(true);
    expect(isNewerVersion("0.1.0-beta2", "0.1.0-beta2")).toBe(false);
    expect(isNewerVersion("0.0.9", "0.1.0-beta2")).toBe(false);
  });
});
