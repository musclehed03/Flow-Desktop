import { describe, expect, it } from 'vitest';
import { crossfadeSeconds, equalPowerCurves, planCrossfade, shouldCrossfade } from './crossfade';
describe('musical crossfade planning', () => {
  it('maps persisted duration to one through twelve seconds', () => {
    expect([-4,1,6,12,99,'bad'].map(crossfadeSeconds)).toEqual([1,1,6,12,12,6]);
  });
  it('keeps equal-power curves complementary at every sample', () => {
    const [outgoing,incoming] = equalPowerCurves();
    expect(outgoing[0]).toBe(1); expect(incoming[0]).toBe(0);
    expect(outgoing[outgoing.length-1]).toBeCloseTo(0); expect(incoming[incoming.length-1]).toBe(1);
    for (let i=0;i<outgoing.length;i++) expect(outgoing[i]! ** 2 + incoming[i]! ** 2).toBeCloseTo(1,6);
  });
  it('uses a plain equal-power duration when tempo metadata is unavailable', () => {
    expect(planCrossfade(6,90,10)).toEqual({ seconds:6, delay:0, incomingStart:0, reason:'plain' });
  });
  it('lands on the incoming downbeat and exits on an available outgoing phrase boundary', () => {
    const plan = planCrossfade(4,9,15,{ bpm:120,beatsPerPhrase:16 },{ bpm:120,downbeatSeconds:.2 });
    expect(plan.delay + plan.seconds + 9).toBe(16);
    expect(plan.incomingStart).toBe(.2); expect(plan.reason).toBe('phrase');
  });
  it('prefers a tail ride for a large tempo mismatch and a clean quick fade for a known clash', () => {
    expect(planCrossfade(3,0,12,{bpm:70},{bpm:150}).seconds).toBe(8);
    const clash = planCrossfade(6,0,12,{bpm:120,musicalKey:'1A'},{bpm:120,musicalKey:'7A'});
    expect(clash.seconds).toBe(.35); expect(clash.reason).toBe('clash');
  });
  it('never fades a seek or an explicit pick by default, and OFF keeps hard cuts', () => {
    expect(shouldCrossfade(true,'seek',true)).toBe(false);
    expect(shouldCrossfade(true,'explicit',false)).toBe(false);
    expect(shouldCrossfade(true,'explicit',true)).toBe(true);
    expect(shouldCrossfade(true,'advance',false)).toBe(true);
    expect(shouldCrossfade(false,'advance',true)).toBe(false);
  });
});
