import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MusicStreamInfo, SongItem } from "../types/music";
import { PRELOAD_LEAD_SECONDS, PRELOAD_RETRY_MS, preloadTrack } from "./musicPreload";
import { musicAudioEngine } from "./audio/musicAudioEngine";
import { resolveMusicStream } from "./musicStreamResolution";

vi.mock("./audio/musicAudioEngine", () => ({
  musicAudioEngine: { hasPreloaded: vi.fn(() => false), wantsAac: () => false, preload: vi.fn() },
}));
vi.mock("./musicStreamResolution", () => ({ resolveMusicStream: vi.fn() }));
vi.mock("./useDownloads", () => ({ findDownloadedRecord: () => false }));
vi.mock("./playerDiagnostics", () => ({ recordPlayerEvent: vi.fn() }));

const resolveMock = vi.mocked(resolveMusicStream);
const preloadMock = vi.mocked(musicAudioEngine.preload);

const track = { id: "next", videoId: "next", duration: 200 } as unknown as SongItem;
const info = {
  audioUrl: "https://example.invalid/next.webm",
  loudnessDb: -8,
  mimeType: "audio/webm",
  bitrate: 128_000,
  sampleRate: 48_000,
  approxDurationMs: 200_000,
} as MusicStreamInfo;
const stillUpcoming = () => true;

beforeEach(() => {
  vi.useFakeTimers();
  resolveMock.mockReset();
  preloadMock.mockClear();
});

describe("musicPreload", () => {
  it("starts buffering a full minute before the end, so a slow resolve still lands before the fade", () => {
    // The fade window opens in the last seconds; the lead has to cover the
    // resolve plus the first audio on a slow link, with room to spare.
    expect(PRELOAD_LEAD_SECONDS).toBe(60);
  });

  it("buffers the next track once its link resolves", async () => {
    resolveMock.mockResolvedValueOnce(info);
    await preloadTrack(track, "High", stillUpcoming);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(preloadMock).toHaveBeenCalledWith(
      "next",
      info.audioUrl,
      info.loudnessDb,
      info.mimeType,
      200,
      expect.objectContaining({ mimeType: info.mimeType }),
    );
  });

  it("retries once when the resolve fails, and the retry buffers the track", async () => {
    resolveMock.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(info);
    await preloadTrack(track, "High", stillUpcoming);
    expect(preloadMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PRELOAD_RETRY_MS);
    expect(resolveMock).toHaveBeenCalledTimes(2);
    expect(preloadMock).toHaveBeenCalledTimes(1);
  });

  it("never retries a second time: a dead link fails once and stays failed", async () => {
    resolveMock.mockRejectedValue(new Error("network down"));
    await preloadTrack(track, "High", stillUpcoming);
    await vi.advanceTimersByTimeAsync(PRELOAD_RETRY_MS * 3);
    expect(resolveMock).toHaveBeenCalledTimes(2);
    expect(preloadMock).not.toHaveBeenCalled();
  });

  it("does not retry once the track is no longer coming", async () => {
    resolveMock.mockRejectedValueOnce(new Error("network down"));
    await preloadTrack(track, "High", () => false);
    await vi.advanceTimersByTimeAsync(PRELOAD_RETRY_MS);
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });
});
