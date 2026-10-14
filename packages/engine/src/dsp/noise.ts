/** Deterministic noise sources (seeded; never Math.random). */

export class Noise {
  private s: number;
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  pink = false;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x12345678;
  }

  /** White noise in [-1, 1). xorshift32. */
  white(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 2147483648 - 1;
  }

  next(): number {
    const w = this.white();
    if (!this.pink) return w;
    // Paul Kellet's economy pink filter
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
}
