/** A circular delay line with fractional (linear) reads: the building block of every delay effect. */
export class DelayLine {
  private buf: Float32Array;
  private w = 0;

  constructor(maxSamples: number) {
    this.buf = new Float32Array(Math.max(4, Math.ceil(maxSamples) + 2));
  }

  get capacity(): number {
    return this.buf.length - 2;
  }

  /** Reads the sample written `delay` samples ago (fractional allowed). */
  read(delay: number): number {
    const n = this.buf.length;
    let rp = this.w - Math.min(Math.max(delay, 1), n - 2);
    if (rp < 0) rp += n;
    const i0 = rp | 0;
    const frac = rp - i0;
    const a = this.buf[i0] as number;
    const b = this.buf[i0 + 1 === n ? 0 : i0 + 1] as number;
    return a + (b - a) * frac;
  }

  write(x: number): void {
    this.buf[this.w] = x;
    this.w = this.w + 1 === this.buf.length ? 0 : this.w + 1;
  }

  clear(): void {
    this.buf.fill(0);
  }
}
