import { afterEach, describe, expect, it, vi } from 'vitest';

const { invokeBackend } = vi.hoisted(() => ({ invokeBackend: vi.fn() }));
vi.mock('../api/errors', () => ({ invokeBackend }));

import {
  activeOutputEngine,
  outputEngines,
  webAudioOutputEngine,
} from './outputEngine';
import { nativeAudio, nativeAudioOutputEngine } from './nativeAudio';

afterEach(async () => {
  vi.resetAllMocks();
  await nativeAudio.close();
});

describe('outputEngine seam (Deviant Audio Engine attached)', () => {
  it('registers the native engine alongside the web engine', () => {
    expect(outputEngines.web).toBe(webAudioOutputEngine);
    expect(outputEngines.native).toBe(nativeAudioOutputEngine);
    expect(outputEngines.native!.id).toBe('native');
  });

  it('the active engine is the web engine while no native stream is open', () => {
    expect(activeOutputEngine()).toBe(webAudioOutputEngine);
    expect(activeOutputEngine().id).toBe('web');
  });

  it('the web engine never claims exclusive mode or bit-perfect', () => {
    const caps = webAudioOutputEngine.capabilities();
    expect(caps.exclusiveMode).toBe(false);
    expect(caps.bitPerfect).toBe(false);
    expect(caps.path.length).toBeGreaterThan(0);
  });

  it('the native engine becomes active when its stream opens, and never claims bit-perfect', async () => {
    invokeBackend.mockResolvedValue({
      exclusive: true,
      format: { sample_rate: 48000, channels: 2, container_bits: 32, valid_bits: 24, float: false },
      error: null,
    });
    await nativeAudio.open(48000, 2);
    expect(activeOutputEngine()).toBe(nativeAudioOutputEngine);
    const caps = nativeAudioOutputEngine.capabilities();
    expect(caps.exclusiveMode).toBe(true);
    expect(caps.bitPerfect).toBe(false);
    expect(caps.path).toContain('48000');
  });

  it('the active engine stays the web engine when the native open fails', async () => {
    invokeBackend.mockResolvedValue({ exclusive: false, format: null, error: 'device busy' });
    await nativeAudio.open(48000, 2);
    expect(activeOutputEngine()).toBe(webAudioOutputEngine);
  });
});
