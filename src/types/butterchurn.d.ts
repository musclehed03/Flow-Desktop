declare module 'butterchurn' {
  interface Renderer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: unknown, blendSeconds: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
  }
  const butterchurn: { createVisualizer(context: AudioContext, canvas: HTMLCanvasElement, options: { width: number; height: number; pixelRatio: number; textureRatio: number; meshWidth?: number; meshHeight?: number }): Renderer };
  export default butterchurn;
}
declare module 'butterchurn-presets' {
  const presets: { getPresets(): Record<string, unknown> };
  export default presets;
}
