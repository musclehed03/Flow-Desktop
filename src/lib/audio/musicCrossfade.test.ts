import { afterEach, expect, it, vi } from 'vitest';
import { MusicAudioEngine } from './musicAudioEngine';
const parameter = () => ({ value:0, setTargetAtTime:vi.fn(), cancelScheduledValues:vi.fn(), setValueAtTime:vi.fn(), setValueCurveAtTime:vi.fn() });
const node = () => ({ connect:vi.fn(),disconnect:vi.fn(),gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter() });
let gains: ReturnType<typeof node>[];
class Context {
  currentTime=0; state='running'; destination=node();
  createGain(){const value=node();gains.push(value);return value;}
  createBiquadFilter(){return node();}
  createAnalyser(){return node();}
  createMediaElementSource(){return node();}
  createDynamicsCompressor(){return node();}
  resume(){return Promise.resolve();}
}
afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
it('overlaps buffered audio through independent equal-power gains, then releases the outgoing slot', async () => {
  vi.useFakeTimers();vi.stubGlobal('AudioContext',Context);gains=[];
  const pair=[document.createElement('audio'),document.createElement('audio')] as [HTMLAudioElement,HTMLAudioElement];
  pair.forEach((element)=>{element.load=vi.fn();element.pause=vi.fn();element.play=vi.fn(async()=>{});Object.defineProperty(element,'readyState',{value:3});Object.defineProperty(element,'paused',{value:false});});
  const engine=new MusicAudioEngine();engine.attach(pair);await engine.load('current');engine.preload('next','next',-3);
  const complete=vi.fn();
  expect(await engine.crossfadeToPreloaded('next',{seconds:6,delay:0,incomingStart:0,reason:'plain'},complete)).toBe(true);
  expect(engine.getActiveElement()).toBe(pair[1]);expect(engine.isCrossfading()).toBe(true);
  expect(pair[0].getAttribute('src')).toBe('current');expect(pair[1].play).toHaveBeenCalledOnce();
  expect(gains.filter((gain)=>gain.gain.setValueCurveAtTime.mock.calls.length)).toHaveLength(2);
  engine.preload('third','third',0);expect(engine.hasPreloaded('third')).toBe(false);
  await vi.advanceTimersByTimeAsync(6000);
  expect(engine.isCrossfading()).toBe(false);expect(pair[0].getAttribute('src')).toBeNull();expect(complete).toHaveBeenCalledOnce();
});
it('cancels overlap on seek and never starts another transition', async () => {
  vi.useFakeTimers();vi.stubGlobal('AudioContext',Context);gains=[];
  const pair=[document.createElement('audio'),document.createElement('audio')] as [HTMLAudioElement,HTMLAudioElement];
  pair.forEach((element)=>{element.load=vi.fn();element.pause=vi.fn();element.play=vi.fn(async()=>{});Object.defineProperty(element,'readyState',{value:3});Object.defineProperty(element,'paused',{value:false});});
  const engine=new MusicAudioEngine();engine.attach(pair);await engine.load('current');engine.preload('next','next',null);
  const complete=vi.fn();await engine.crossfadeToPreloaded('next',{seconds:6,delay:0,incomingStart:0,reason:'plain'},complete);
  engine.seek(12);expect(engine.isCrossfading()).toBe(false);expect(engine.getCurrentTime()).toBe(12);
  await vi.advanceTimersByTimeAsync(6000);expect(complete).not.toHaveBeenCalled();
});
