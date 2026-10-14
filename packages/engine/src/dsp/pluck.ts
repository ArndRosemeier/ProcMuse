/** Karplus-Strong plucked string with fractional delay, damping and brightness. */
import type { Noise } from './noise.js';

export class Pluck {
  private buf: Float32Array;
  private write = 0;
  private delay = 100;
  private last = 0;
  /** Loop gain per sample period; derived from the decay time. */
  private feedback = 0.99;
  /** 0 = dark (heavy averaging), 1 = bright. */
  damping = 0.5;

  constructor(sampleRate: number) {
    this.buf = new Float32Array(Math.ceil(sampleRate / 20) + 2);
  }

  /** Excites the string. `decay` is roughly the T60 in seconds. */
  trigger(freq: number, sampleRate: number, decay: number, brightness: number, noise: Noise): void {
    this.delay = Math.min(this.buf.length - 2, Math.max(2, sampleRate / freq));
    const periodsPerSecond = freq;
    this.feedback = Math.pow(10, -3 / Math.max(0.05, decay * periodsPerSecond));
    this.damping = brightness;
    const len = Math.ceil(this.delay);
    let lp = 0;
    const c = 0.15 + 0.85 * brightness;
    for (let i = 0; i < this.buf.length; i++) {
      if (i < len) {
        lp += c * (noise.white() - lp);
        this.buf[i] = lp;
      } else this.buf[i] = 0;
    }
    this.write = len % this.buf.length;
    this.last = 0;
  }

  next(): number {
    const n = this.buf.length;
    let rp = this.write - this.delay;
    while (rp < 0) rp += n;
    const i0 = Math.floor(rp);
    const frac = rp - i0;
    const a = this.buf[i0 % n] as number;
    const b = this.buf[(i0 + 1) % n] as number;
    const s = a + (b - a) * frac;
    // two-point averaging lowpass blended by damping
    const filtered = s * (0.5 + 0.5 * this.damping) + this.last * (0.5 - 0.5 * this.damping);
    this.last = s;
    this.buf[this.write] = filtered * this.feedback;
    this.write = (this.write + 1) % n;
    return s;
  }
}
