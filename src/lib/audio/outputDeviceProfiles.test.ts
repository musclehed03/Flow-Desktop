import { describe, expect, it, vi } from "vitest";
import { currentOutputDevice, hashOutputDevice, parseOutputDeviceProfiles } from "./outputDeviceProfiles";

describe("output-device profiles", () => {
  it("stores only a salted opaque key", async () => {
    vi.stubGlobal("crypto", { ...crypto, subtle: { digest: async () => new Uint8Array(32).fill(10).buffer } });
    const key = await hashOutputDevice("salt", { deviceId: "raw-device", groupId: "raw-group", label: "DAC" });
    expect(key).toBe("0a".repeat(32));
    expect(key).not.toContain("raw-device");
    vi.unstubAllGlobals();
  });

  it("finds the default output and tolerates corrupt persistence", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => [{ kind: "audiooutput", deviceId: "default", groupId: "g", label: "DAC" }] } });
    expect((await currentOutputDevice("salt"))?.label).toBe("DAC");
    expect(parseOutputDeviceProfiles("bad").profiles).toEqual([]);
    vi.unstubAllGlobals();
  });
});
