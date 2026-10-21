import { describe, expect, it } from 'vitest';
import { degradeVisualizer, parseVisualizerConfig, parseVisualizerPresets } from './visualizer';
describe('visualizer configuration and performance guard', () => {
  it('bounds untrusted saved presets and keeps defaults quiet', () => {
    expect(parseVisualizerConfig('{}').enabled).toBe(false);
    const config = parseVisualizerConfig('{"sensitivity":999,"density":99999,"fps":999,"family":"unknown","smoothing":-1}');
    expect(config).toMatchObject({ sensitivity:3,density:160,fps:30,family:'spectrum',smoothing:0 });
    expect(parseVisualizerPresets('null')).toEqual([]);
    expect(parseVisualizerPresets('[{"name":"Quiet","config":{"family":"waveform"}}]')[0]?.config.family).toBe('waveform');
  });
  it('reduces frame rate and density under sustained drawing pressure', () => {
    expect(degradeVisualizer(60,160,20)).toEqual({fps:30,density:120});
    expect(degradeVisualizer(30,64,30)).toEqual({fps:15,density:48});
    expect(degradeVisualizer(30,64,3)).toEqual({fps:30,density:64});
  });
});
