import { describe, expect, it, vi } from "vitest";

import { DeviantNativeTap, NATIVE_TAP_CHUNK_FRAMES } from "./nativeTapProcessor";

const FRAMES = NATIVE_TAP_CHUNK_FRAMES;

/** One 128-frame block of silence, per channel. */
function block(frames = 128): Float32Array[] {
  return [new Float32Array(frames), new Float32Array(frames)];
}

function tapWithPort() {
  const tap = new DeviantNativeTap();
  const port = { postMessage: vi.fn() };
  (tap as unknown as { port: unknown }).port = port;
  return { tap, port };
}

/** Fill a channel's samples with a ramp so interleaving is checkable. */
function ramp(frames: number, start: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = start + i;
  return out;
}

describe("DeviantNativeTap", () => {
  it("interleaves stereo blocks into one chunk per chunk boundary", () => {
    const { tap, port } = tapWithPort();
    const left = ramp(FRAMES, 0);
    const right = ramp(FRAMES, 10_000);
    for (let offset = 0; offset < FRAMES; offset += 128) {
      expect(tap.process([[left.subarray(offset, offset + 128), right.subarray(offset, offset + 128)]], [], {})).toBe(true);
    }
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const [message] = port.postMessage.mock.calls[0] as [{ type: string; samples: Float32Array }];
    expect(message.type).toBe("pcm");
    expect(message.samples.length).toBe(FRAMES * 2);
    expect(message.samples[0]).toBe(0);
    expect(message.samples[1]).toBe(10_000);
    expect(message.samples[2]).toBe(1);
    expect(message.samples[3]).toBe(10_001);
  });

  it("duplicates a mono channel into stereo", () => {
    const { tap, port } = tapWithPort();
    const mono = ramp(FRAMES, 100);
    for (let offset = 0; offset < FRAMES; offset += 128) {
      tap.process([[mono.subarray(offset, offset + 128)]], [], {});
    }
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const [message] = port.postMessage.mock.calls[0] as [{ type: string; samples: Float32Array }];
    expect(message.samples.length).toBe(FRAMES * 2);
    expect(message.samples[0]).toBe(100);
    expect(message.samples[1]).toBe(100);
    expect(message.samples[2]).toBe(101);
    expect(message.samples[3]).toBe(101);
  });

  it("holds a partial chunk and emits it only when full", () => {
    const { tap, port } = tapWithPort();
    tap.process([block(128)], [], {});
    expect(port.postMessage).not.toHaveBeenCalled();
    for (let i = 0; i < FRAMES / 128 - 1; i += 1) tap.process([block()], [], {});
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps the remainder when a block crosses a chunk boundary", () => {
    const { tap, port } = tapWithPort();
    const left = ramp(FRAMES + 128, 0);
    const right = ramp(FRAMES + 128, 50_000);
    for (let offset = 0; offset < FRAMES + 128; offset += 128) {
      tap.process([[left.subarray(offset, offset + 128), right.subarray(offset, offset + 128)]], [], {});
    }
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    // The 128 held frames complete the next chunk.
    const filler = ramp(FRAMES - 128, 0);
    for (let offset = 0; offset < FRAMES - 128; offset += 128) {
      tap.process([[filler.subarray(offset, offset + 128), filler.subarray(offset, offset + 128)]], [], {});
    }
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it("survives empty input without posting", () => {
    const { tap, port } = tapWithPort();
    expect(tap.process([[]], [], {})).toBe(true);
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
