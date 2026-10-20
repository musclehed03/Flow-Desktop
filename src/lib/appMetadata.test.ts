import { describe, expect, it, vi } from "vitest";
import windows from "../../src-tauri/tauri.windows.conf.json";
import linux from "../../src-tauri/tauri.linux.conf.json";
import base from "../../src-tauri/tauri.conf.json";

vi.mock("./api/env", () => ({ isTauriEnv: async () => true }));
const { getName } = vi.hoisted(() => ({ getName: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({
  getName,
  getVersion: async () => "0.1.0-beta2",
  getIdentifier: async () => "io.github.aedev.flow.desktop",
  getTauriVersion: async () => "2",
  getBundleType: async () => "test",
}));

describe("tuned platform display names", () => {
  it.each([[windows, "Desktop"], [linux, "Linux"]] as const)("keeps package names filesystem-safe and exposes the exact title in About (%s)", async (config, platform) => {
    vi.resetModules();
    getName.mockResolvedValue(config.productName);
    const { getAppMetadata } = await import("./appMetadata");
    expect(config.productName).toBe(`Flow-Tube - Dollhouse Deviants Tuned (${platform})`);
    expect(config.productName).not.toMatch(/[/\\:*?"<>|]/);
    expect(config.app.windows[0]?.title).toBe(`Flow-Tube: Dollhouse Deviants Tuned (${platform})`);
    expect(await getAppMetadata()).toMatchObject({
      name: `Flow-Tube: Dollhouse Deviants Tuned (${platform})`, version: base.version, identifier: base.identifier,
    });
    expect(base.identifier).toBe("io.github.aedev.flow.desktop");
    expect(base.version).toBe("0.1.0-beta2");
  });
  it("keeps the upstream name unchanged for untuned metadata", async () => {
    vi.resetModules();
    getName.mockResolvedValue("Flow");
    const { getAppMetadata } = await import("./appMetadata");
    expect((await getAppMetadata()).name).toBe("Flow");
  });
});
