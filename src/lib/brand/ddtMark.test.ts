import { describe, expect, it } from "vitest";
import {
  DDT_CYAN,
  DDT_MIN_SIZE,
  DDT_PINK,
  getDdtVariant,
  getSplashFrames,
  showDdtLettering,
  DDT_PALETTES,
} from "./ddtMark";

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 10, 12, hour, minute, 0, 0);
  return d;
}

describe("getDdtVariant", () => {
  it("is cyan before noon", () => {
    expect(getDdtVariant(at(0, 0))).toBe("cyan");
    expect(getDdtVariant(at(11, 59))).toBe("cyan");
  });

  it("is pink from noon", () => {
    expect(getDdtVariant(at(12, 0))).toBe("pink");
    expect(getDdtVariant(at(23, 59))).toBe("pink");
  });
});

describe("DDT_PALETTES", () => {
  it("cyan variant: cyan container, pink mark", () => {
    expect(DDT_PALETTES.cyan).toEqual({ container: DDT_CYAN, mark: DDT_PINK });
  });

  it("pink variant: pink container, cyan mark", () => {
    expect(DDT_PALETTES.pink).toEqual({ container: DDT_PINK, mark: DDT_CYAN });
  });
});

describe("showDdtLettering", () => {
  it("shows DDT at 32px and up, F-only below", () => {
    expect(showDdtLettering(DDT_MIN_SIZE)).toBe(true);
    expect(showDdtLettering(72)).toBe(true);
    expect(showDdtLettering(31)).toBe(false);
    expect(showDdtLettering(16)).toBe(false);
  });
});

describe("getSplashFrames", () => {
  it("opens on the legacy red logo and flickers red <-> house before going dark", () => {
    const frames = getSplashFrames(at(9));
    expect(frames[0]).toEqual({ kind: "legacy", ms: 220 });
    expect(frames[1]).toEqual({ kind: "house", ms: 130 });
    expect(frames[2]).toEqual({ kind: "legacy", ms: 130 });
    expect(frames[3]).toEqual({ kind: "house", ms: 130 });
    expect(frames[4]).toEqual({ kind: "dark", ms: 160 });
  });

  it("flickers pink/cyan and locks on the time-correct variant", () => {
    const morning = getSplashFrames(at(9));
    expect(morning[5]).toEqual({ kind: "variant", variant: "pink", ms: 130 });
    expect(morning[6]).toEqual({ kind: "variant", variant: "cyan", ms: 130 });
    expect(morning[7]).toEqual({ kind: "final", variant: "cyan" });

    const afternoon = getSplashFrames(at(15));
    expect(afternoon[5]).toEqual({ kind: "variant", variant: "cyan", ms: 130 });
    expect(afternoon[6]).toEqual({ kind: "variant", variant: "pink", ms: 130 });
    expect(afternoon[7]).toEqual({ kind: "final", variant: "pink" });
  });

  it("ends on a final frame with no timer, so the intro stops by itself", () => {
    const frames = getSplashFrames(at(9));
    expect(frames).toHaveLength(8);
    const last = frames[frames.length - 1];
    expect(last).toEqual({ kind: "final", variant: "cyan" });
    expect(last && "ms" in last).toBe(false);
  });
});
