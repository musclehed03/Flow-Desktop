import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { VisualizerCanvas } from './VisualizerCanvas';
import { VISUALIZER_DEFAULT } from '../../lib/audio/visualizer';
import { SETTINGS } from '../../lib/settings/schema';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
const { createVisualizer, read } = vi.hoisted(()=>({createVisualizer:vi.fn(),read:vi.fn()}));
vi.mock('butterchurn',()=>({default:{default:{createVisualizer}}}));
vi.mock('butterchurn-presets',()=>({default:{getPresets:()=>({'Fixture':{}})}}));
vi.mock('../../lib/audio/musicAudioEngine',()=>({musicAudioEngine:{getAnalyser:()=>({getByteFrequencyData:read,getByteTimeDomainData:read})}}));
it('uses one static canvas frame under Safe Motion and never starts MilkDrop or samples live motion', async()=>{
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
  const original=useAppSettingsStore.getState().values;
  useAppSettingsStore.setState({values:{...original,[SETTINGS.SAFE_MOTION_ENABLED]:'true'}});
  const drawing={fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),arc:vi.fn(),fill:vi.fn()};
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
  const pending: FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.push(callback);return pending.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(VisualizerCanvas,{config:{...VISUALIZER_DEFAULT,enabled:true,family:'feedback'}})));
    await act(async()=>pending[0]!(0));
    expect(read).not.toHaveBeenCalled();expect(createVisualizer).not.toHaveBeenCalled();
    expect(host.querySelector('canvas')?.dataset.effectiveFps).toBe('0');expect(drawing.fillRect).toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();useAppSettingsStore.setState({values:original});}
});
it('replaces a failed WebGL canvas before drawing the fallback frame', async()=>{
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
  const original=useAppSettingsStore.getState().values;
  const { useVisualizerUi }=await import('../../lib/useVisualizer');
  const previousConsent=useVisualizerUi.getState().consented;
  const previousPlaying=useMusicPlayerStore.getState().isPlaying;
  useVisualizerUi.setState({consented:true});
  useMusicPlayerStore.setState({isPlaying:true});
  useAppSettingsStore.setState({values:{...original,[SETTINGS.SAFE_MOTION_ENABLED]:'false'}});
  const drawing={fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),arc:vi.fn(),fill:vi.fn()};
  let failedCanvas: HTMLCanvasElement | undefined;
  createVisualizer.mockImplementation((_audio: unknown, element: HTMLCanvasElement)=>{failedCanvas=element;throw new Error('WebGL unavailable');});
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){
    return this===failedCanvas ? null : drawing as unknown as CanvasRenderingContext2D;
  });
  const pending:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.push(callback);return pending.length;});
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(VisualizerCanvas,{config:{...VISUALIZER_DEFAULT,enabled:true,family:'feedback'}})));
    expect(failedCanvas).toBeDefined();
    expect(host.querySelector('canvas')).not.toBe(failedCanvas);
    await act(async()=>pending[pending.length-1]!(0));
    expect(drawing.fillRect).toHaveBeenCalled();
    expect(host.querySelector('canvas')?.dataset.effectiveFps).toBe(String(VISUALIZER_DEFAULT.fps));
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();
    createVisualizer.mockReset();useVisualizerUi.setState({consented:previousConsent});
    useMusicPlayerStore.setState({isPlaying:previousPlaying});
    useAppSettingsStore.setState({values:original});
  }
});

it('idle-sleeps analyser reads after sustained silence and polls only twice per second', async()=>{
  vi.useFakeTimers();
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
  const original=useAppSettingsStore.getState().values;
  const { useVisualizerUi }=await import('../../lib/useVisualizer');
  const previousConsent=useVisualizerUi.getState().consented;
  const previousPlaying=useMusicPlayerStore.getState().isPlaying;
  useVisualizerUi.setState({consented:true});
  useMusicPlayerStore.setState({isPlaying:true});
  useAppSettingsStore.setState({values:{...original,[SETTINGS.SAFE_MOTION_ENABLED]:'false',[SETTINGS.REDUCED_FLASH_ENABLED]:'false'}});
  read.mockImplementation((array: Uint8Array)=>array.fill(0));
  const drawing={fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),arc:vi.fn(),fill:vi.fn()};
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
  const pending:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.push(callback);return pending.length;});
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(VisualizerCanvas,{config:{...VISUALIZER_DEFAULT,enabled:true}})));
    await act(async()=>pending.shift()!(0));
    await act(async()=>pending.shift()!(1600));
    expect(host.querySelector('canvas')?.dataset.idle).toBe('true');
    expect(host.querySelector('canvas')?.dataset.effectiveFps).toBe('0');
    const readsAtSleep=read.mock.calls.length;
    await act(async()=>vi.advanceTimersByTime(499));
    expect(pending).toHaveLength(0);
    await act(async()=>vi.advanceTimersByTime(1));
    expect(pending).toHaveLength(1);
    await act(async()=>pending.shift()!(2100));
    expect(read.mock.calls.length).toBe(readsAtSleep+2);
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();vi.useRealTimers();read.mockReset();
    useVisualizerUi.setState({consented:previousConsent});useMusicPlayerStore.setState({isPlaying:previousPlaying});useAppSettingsStore.setState({values:original});
  }
});

it('does not schedule analyser work while the canvas is offscreen', async()=>{
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
  const original=useAppSettingsStore.getState().values;
  const { useVisualizerUi }=await import('../../lib/useVisualizer');
  const previousConsent=useVisualizerUi.getState().consented;
  const previousPlaying=useMusicPlayerStore.getState().isPlaying;
  useVisualizerUi.setState({consented:true});useMusicPlayerStore.setState({isPlaying:true});
  useAppSettingsStore.setState({values:{...original,[SETTINGS.SAFE_MOTION_ENABLED]:'false',[SETTINGS.REDUCED_FLASH_ENABLED]:'false'}});
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect:vi.fn()} as unknown as CanvasRenderingContext2D);
  const pending:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.push(callback);return pending.length;});
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  class OffscreenObserver {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ isIntersecting:false, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver',OffscreenObserver);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(VisualizerCanvas,{config:{...VISUALIZER_DEFAULT,enabled:true}})));
    expect(pending).toHaveLength(0);expect(read).not.toHaveBeenCalled();
    expect(host.querySelector('canvas')?.dataset.idle).toBe('true');
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();read.mockReset();
    useVisualizerUi.setState({consented:previousConsent});useMusicPlayerStore.setState({isPlaying:previousPlaying});useAppSettingsStore.setState({values:original});
  }
});
