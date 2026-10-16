/** Plays one recorded zone: 4-point Hermite interpolation, optional sustain loop. */
import type { SampleZone } from '../instruments/samples.js';

export class SamplePlayer {
  private data: Float32Array = new Float32Array(0);
  private pos = 0;
  private loopStart = -1;
  private loopEnd = -1;
  /** frames advanced per output sample */
  inc = 0;

  start(zone: SampleZone): void {
    this.data = zone.data;
    this.pos = 0;
    this.loopStart = zone.loopEnd !== undefined ? (zone.loopStart as number) : -1;
    this.loopEnd = zone.loopEnd ?? -1;
  }

  next(): number {
    const d = this.data;
    const p = this.pos;
    const i = Math.floor(p);
    const end = this.loopEnd > 0 ? this.loopEnd : d.length;
    if (i >= end) return 0; // a one-shot that has finished
    const f = p - i;
    const at = (k: number): number => {
      if (k >= end) k = this.loopEnd > 0 ? k - end + this.loopStart : end - 1;
      return (d[k < 0 ? 0 : k] as number) ?? 0;
    };
    const xm = at(i - 1);
    const x0 = d[i] as number;
    const x1 = at(i + 1);
    const x2 = at(i + 2);
    const c = (x1 - xm) * 0.5;
    const v = x0 - x1;
    const w = c + v;
    const a = w + v + (x2 - x0) * 0.5;
    const out = ((a * f - w - a) * f + c) * f + x0;
    let np = p + this.inc;
    if (this.loopEnd > 0 && np >= this.loopEnd) np -= this.loopEnd - this.loopStart;
    this.pos = np;
    return out;
  }
}
