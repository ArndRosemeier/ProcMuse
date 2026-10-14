/** Band-limited oscillators (polyBLEP) and an FM operator pair. Phase is in cycles [0, 1). */
import { TAU } from '../core/math.js';

export type Waveform = 'sine' | 'saw' | 'square' | 'triangle';

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export class Oscillator {
  phase = 0;
  /** Phase increment per sample (frequency / sampleRate). */
  inc = 0;
  /** Pulse width for `square`, in (0, 1). */
  pw = 0.5;
  wave: Waveform;

  constructor(wave: Waveform, phase = 0) {
    this.wave = wave;
    this.phase = phase;
  }

  next(): number {
    const p = this.phase;
    const dt = this.inc;
    let v: number;
    switch (this.wave) {
      case 'sine':
        v = Math.sin(TAU * p);
        break;
      case 'saw':
        v = 2 * p - 1 - polyBlep(p, dt);
        break;
      case 'square': {
        v = p < this.pw ? 1 : -1;
        v += polyBlep(p, dt);
        let q = p - this.pw;
        if (q < 0) q += 1;
        v -= polyBlep(q, dt);
        break;
      }
      case 'triangle':
        v = 1 - 4 * Math.abs(p - 0.5);
        break;
    }
    let np = p + dt;
    if (np >= 1) np -= Math.floor(np);
    this.phase = np;
    return v;
  }
}

/** Two-operator FM (phase modulation) with modulator self-feedback. */
export class FmOperator {
  phase = 0;
  modPhase = 0;
  inc = 0;
  ratio = 1;
  /** Modulation index in radians. */
  index = 1;
  feedback = 0;
  private lastMod = 0;

  next(): number {
    const mod = Math.sin(TAU * this.modPhase + this.feedback * this.lastMod);
    this.lastMod = mod;
    const out = Math.sin(TAU * this.phase + this.index * mod);
    this.phase += this.inc;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    this.modPhase += this.inc * this.ratio;
    if (this.modPhase >= 1) this.modPhase -= Math.floor(this.modPhase);
    return out;
  }
}
