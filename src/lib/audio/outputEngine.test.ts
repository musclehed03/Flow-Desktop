import { describe, expect, it } from 'vitest';
import {
  activeOutputEngine,
  outputEngines,
  webAudioOutputEngine,
} from './outputEngine';

describe('outputEngine seam (Deviant Audio Engine reservation)', () => {
  it('registers only the web engine until the native engine lands', () => {
    expect(outputEngines.web).toBe(webAudioOutputEngine);
    expect(outputEngines.native).toBeNull();
  });

  it('the active engine is the web engine', () => {
    expect(activeOutputEngine()).toBe(webAudioOutputEngine);
    expect(activeOutputEngine().id).toBe('web');
  });

  it('the web engine never claims exclusive mode or bit-perfect', () => {
    const caps = webAudioOutputEngine.capabilities();
    expect(caps.exclusiveMode).toBe(false);
    expect(caps.bitPerfect).toBe(false);
    expect(caps.path.length).toBeGreaterThan(0);
  });
});
