import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeBackend } = vi.hoisted(() => ({ invokeBackend: vi.fn() }));
vi.mock("../api/errors", () => ({ invokeBackend }));

import {
  feedNativeAudio,
  listNativeAudioDevices,
  nativeAudio,
  nativeAudioOutputEngine,
  openNativeAudio,
} from "./nativeAudio";

const OPEN_RESULT = {
  exclusive: true,
  format: { sample_rate: 48000, channels: 2, container_bits: 32, valid_bits: 24, float: false },
  error: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("nativeAudio client", () => {
  it("passes camelCase args to the backend commands", async () => {
    invokeBackend.mockResolvedValueOnce([]);
    await listNativeAudioDevices();
    expect(invokeBackend).toHaveBeenCalledWith("native_audio_devices");

    invokeBackend.mockResolvedValueOnce(OPEN_RESULT);
    await openNativeAudio("endpoint-id", 48000, 2);
    expect(invokeBackend).toHaveBeenCalledWith("native_audio_open", {
      deviceId: "endpoint-id",
      sampleRate: 48000,
      channels: 2,
    });

    invokeBackend.mockResolvedValueOnce({ active: true, exclusive: true });
    await feedNativeAudio(new Uint8Array([0, 0, 0, 0]), 48000, 2);
    expect(invokeBackend).toHaveBeenCalledWith("native_audio_feed", {
      pcm: new Uint8Array([0, 0, 0, 0]),
      sampleRate: 48000,
      channels: 2,
    });
  });

  it("probes support once and caches the answer", async () => {
    vi.resetModules();
    const { nativeAudio: fresh } = await import("./nativeAudio");
    invokeBackend.mockResolvedValue({
      hardware_output_available: true,
      supported_decoders: ["aac-lc"],
      stream: { active: false, exclusive: false },
    });
    await expect(fresh.probe()).resolves.toBe(true);
    await expect(fresh.probe()).resolves.toBe(true);
    expect(invokeBackend).toHaveBeenCalledTimes(1);
    expect(fresh.isSupported()).toBe(true);
  });

  it("a failed probe means unsupported, not an exception", async () => {
    vi.resetModules();
    const { nativeAudio: fresh } = await import("./nativeAudio");
    invokeBackend.mockRejectedValueOnce(new Error("backend down"));
    await expect(fresh.probe()).resolves.toBe(false);
    expect(fresh.isSupported()).toBe(false);
  });

  it("a successful open engages the stream and clears any earlier error", async () => {
    invokeBackend
      .mockResolvedValueOnce({ exclusive: false, format: null, error: "device busy" })
      .mockResolvedValueOnce(OPEN_RESULT);
    await nativeAudio.open(48000, 2);
    expect(nativeAudio.getState()).toMatchObject({ engaged: false, error: "device busy" });
    await nativeAudio.open(48000, 2);
    expect(nativeAudio.getState()).toMatchObject({
      engaged: true,
      exclusive: true,
      error: null,
      format: OPEN_RESULT.format,
    });
  });

  it("close releases the stream but keeps the failure reason until the next open", async () => {
    invokeBackend.mockResolvedValueOnce({ exclusive: false, format: null, error: "device busy" });
    await nativeAudio.open(48000, 2);
    invokeBackend.mockResolvedValueOnce(undefined);
    await nativeAudio.close();
    expect(nativeAudio.getState()).toMatchObject({ engaged: false, error: "device busy" });
  });

  it("a feed against a dead stream ends the engagement", async () => {
    invokeBackend.mockResolvedValueOnce(OPEN_RESULT);
    await nativeAudio.open(48000, 2);
    invokeBackend.mockResolvedValueOnce({
      active: false,
      exclusive: false,
      format: null,
      error: "device removed",
      underrun_frames: 0,
      queued_frames: 0,
      pending_device_frames: 0,
    });
    await nativeAudio.feed(new Uint8Array([0, 0, 0, 0]), 48000, 2);
    expect(nativeAudio.getState()).toMatchObject({ engaged: false, error: "device removed" });
  });
});

describe("nativeAudioOutputEngine registry object", () => {
  it("never claims bit-perfect, even while exclusive", async () => {
    invokeBackend.mockResolvedValueOnce(OPEN_RESULT);
    await nativeAudio.open(48000, 2);
    expect(nativeAudioOutputEngine.isAvailable()).toBe(true);
    const caps = nativeAudioOutputEngine.capabilities();
    expect(caps.exclusiveMode).toBe(true);
    expect(caps.bitPerfect).toBe(false);
    expect(caps.path).toContain("48000");
  });

  it("reports the failure reason while idle, never exclusive", async () => {
    invokeBackend.mockResolvedValueOnce({ exclusive: false, format: null, error: "device busy" });
    await nativeAudio.open(48000, 2);
    expect(nativeAudioOutputEngine.isAvailable()).toBe(false);
    const caps = nativeAudioOutputEngine.capabilities();
    expect(caps.exclusiveMode).toBe(false);
    expect(caps.bitPerfect).toBe(false);
    expect(caps.path).toContain("device busy");
  });
});
