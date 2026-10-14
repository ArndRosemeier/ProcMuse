/** Dynamics: a stereo-linked compressor and a master limiter. */
import { dbToGain, gainToDb } from '../core/math.js';
import { softClip } from './shape.js';

export class Compressor {
  thresholdDb = -12;
  ratio = 3;
  makeupDb = 0;
  private env = 0;
  private att = 0;
  private rel = 0;
  /** Last applied gain reduction in dB (≤ 0), for meters. */
  reductionDb = 0;

  constructor(sampleRate: number, attack = 0.01, release = 0.15) {
    this.setTimes(attack, release, sampleRate);
  }

  setTimes(attack: number, release: number, sampleRate: number): void {
    this.att = Math.exp(-1 / (attack * sampleRate));
    this.rel = Math.exp(-1 / (release * sampleRate));
  }

  /** Returns the gain to apply for this frame given a detector level. */
  gainFor(level: number): number {
    const coef = level > this.env ? this.att : this.rel;
    this.env = level + coef * (this.env - level);
    const db = gainToDb(this.env);
    const over = db - this.thresholdDb;
    const red = over > 0 ? -over * (1 - 1 / this.ratio) : 0;
    this.reductionDb = red;
    return dbToGain(red + this.makeupDb);
  }
}

/** Fast peak limiter followed by a soft clipper, so the output never exceeds ±1. */
export class Limiter {
  ceiling = dbToGain(-0.8);
  private gain = 1;
  private rel: number;

  constructor(sampleRate: number, release = 0.08) {
    this.rel = 1 - Math.exp(-1 / (release * sampleRate));
  }

  process(l: number, r: number, out: { l: number; r: number }): void {
    const peak = Math.max(Math.abs(l), Math.abs(r));
    const target = peak > this.ceiling ? this.ceiling / peak : 1;
    if (target < this.gain) this.gain = target;
    else this.gain += (target - this.gain) * this.rel;
    out.l = softClip((l * this.gain) / this.ceiling) * this.ceiling;
    out.r = softClip((r * this.gain) / this.ceiling) * this.ceiling;
  }
}
