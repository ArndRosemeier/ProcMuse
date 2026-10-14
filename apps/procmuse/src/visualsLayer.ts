/** Adapts @procmuse/visuals to the app: one place that knows the visuals API. */
import type { MusicState, ParamSource } from '@procmuse/engine';
import { Visuals } from '@procmuse/visuals';

export interface VisualLayer {
  readonly source: ParamSource | null;
  frame(state: MusicState, nowSeconds: number): void;
  resize(): void;
}

export async function createVisualLayer(canvas: HTMLCanvasElement): Promise<VisualLayer> {
  const v = new Visuals(canvas);
  v.resize();
  return {
    source: v.params,
    frame: (state, now) => v.frame(state, now),
    resize: () => v.resize(),
  };
}
