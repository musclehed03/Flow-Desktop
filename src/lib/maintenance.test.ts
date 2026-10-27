import { describe, expect, it } from "vitest";
import { backupIsDue } from "./maintenance";

describe("scheduled backup cadence", () => {
  const day = 24 * 60 * 60 * 1000;
  it("never schedules disabled backups", () => expect(backupIsDue("NONE", null, 10 * day)).toBe(false));
  it("runs a configured cadence immediately when it has no prior run", () => expect(backupIsDue("DAILY", null, day)).toBe(true));
  it("honours daily, weekly, and monthly boundaries", () => {
    expect(backupIsDue("DAILY", 0, day - 1)).toBe(false);
    expect(backupIsDue("DAILY", 0, day)).toBe(true);
    expect(backupIsDue("WEEKLY", 0, 7 * day)).toBe(true);
    expect(backupIsDue("MONTHLY", 0, 29 * day)).toBe(false);
    expect(backupIsDue("MONTHLY", 0, 30 * day)).toBe(true);
  });
});
