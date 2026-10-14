/** Filters: a TPT state-variable filter (the musical filter) and one-pole helpers. */

export type FilterMode = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

/** Zavalishin topology-preserving SVF. Stable under fast modulation. */
export class Svf {
  mode: FilterMode;
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  private k = 2;

  constructor(mode: FilterMode = 'lowpass') {
    this.mode = mode;
  }

  /** cutoff in Hz, resonance in [0, 1). Call at control rate. */
  set(cutoff: number, resonance: number, sampleRate: number): void {
    const fc = Math.min(Math.max(cutoff, 10), sampleRate * 0.45);
    const g = Math.tan((Math.PI * fc) / sampleRate);
    this.k = 2 - 1.96 * Math.min(Math.max(resonance, 0), 1);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  process(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    switch (this.mode) {
      case 'lowpass':
        return v2;
      case 'bandpass':
        return v1;
      case 'highpass':
        return x - this.k * v1 - v2;
      case 'notch':
        return x - this.k * v1;
    }
  }

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
  }
}

/** One-pole lowpass; also used as a parameter smoother. */
export class OnePole {
  y = 0;
  coef: number;
  constructor(coef = 1) {
    this.coef = coef;
  }
  setCutoff(hz: number, sampleRate: number): void {
    this.coef = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
  }
  process(x: number): number {
    this.y += this.coef * (x - this.y);
    return this.y;
  }
}

/** DC blocker (one-pole highpass at ~20 Hz). */
export class DcBlocker {
  private x1 = 0;
  private y1 = 0;
  private r = 0.995;
  constructor(sampleRate: number) {
    this.r = 1 - (2 * Math.PI * 20) / sampleRate;
  }
  process(x: number): number {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}
