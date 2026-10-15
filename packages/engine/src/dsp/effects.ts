/** Send effects (delay, reverb, chorus). Each processes a stereo frame and returns WET output only. */
import { t60Gain } from '../core/math.js';
import { DelayLine } from './delayline.js';
import { OnePole } from './filter.js';
import { softClip } from './shape.js';

export interface StereoOut {
  l: number;
  r: number;
}

/** Tempo-synced stereo delay with ping-pong and a darkening feedback path. */
export class StereoDelay {
  private dl: DelayLine;
  private dr: DelayLine;
  private lpL = new OnePole();
  private lpR = new OnePole();
  private timeSmooth = new OnePole(0.0005);
  /** Delay time in samples (smoothed internally). */
  time = 10000;
  feedback = 0.4;
  pingPong = true;
  readonly out: StereoOut = { l: 0, r: 0 };

  constructor(sampleRate: number, maxSeconds = 2.5) {
    this.dl = new DelayLine(sampleRate * maxSeconds);
    this.dr = new DelayLine(sampleRate * maxSeconds);
    this.lpL.setCutoff(4500, sampleRate);
    this.lpR.setCutoff(4500, sampleRate);
    this.timeSmooth.y = this.time;
  }

  setTone(hz: number, sampleRate: number): void {
    this.lpL.setCutoff(hz, sampleRate);
    this.lpR.setCutoff(hz, sampleRate);
  }

  process(inL: number, inR: number): StereoOut {
    const t = this.timeSmooth.process(this.time);
    const yl = this.dl.read(t);
    const yr = this.dr.read(t);
    const fbl = this.lpL.process(yl) * this.feedback;
    const fbr = this.lpR.process(yr) * this.feedback;
    if (this.pingPong) {
      this.dl.write(softClip((inL + inR) * 0.5 + fbr));
      this.dr.write(softClip(fbl));
    } else {
      this.dl.write(softClip(inL + fbl));
      this.dr.write(softClip(inR + fbr));
    }
    this.out.l = yl;
    this.out.r = yr;
    return this.out;
  }
}

class Allpass {
  private d: DelayLine;
  constructor(private length: number, private g: number) {
    this.d = new DelayLine(length + 1);
  }
  process(x: number): number {
    const z = this.d.read(this.length);
    const v = x + this.g * z;
    this.d.write(v);
    return z - this.g * v;
  }
}

const FDN_BASE = [1031, 1327, 1523, 1801, 2053, 2389, 2647, 2953];

/** 8-line feedback delay network reverb with input diffusion and per-line damping. */
export class Reverb {
  private lines: DelayLine[];
  private lengths: number[];
  private damp: OnePole[];
  private diffusers: Allpass[];
  private pre: DelayLine;
  private gains: number[] = [];
  private readonly sr: number;
  private state = new Float64Array(8);
  predelay = 0;
  readonly out: StereoOut = { l: 0, r: 0 };

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    const scale = sampleRate / 44100;
    this.lengths = FDN_BASE.map((n) => Math.round(n * scale * 1.6));
    this.lines = this.lengths.map((n) => new DelayLine(n * 1.6 + 8));
    this.damp = this.lengths.map(() => new OnePole());
    this.diffusers = [142, 107, 379, 277].map((n) => new Allpass(Math.round(n * scale), 0.6));
    this.pre = new DelayLine(sampleRate * 0.2);
    this.configure(0.6, 0.5);
  }

  /** size in [0, 1] → decay time ~0.4 s .. 9 s; damping in [0, 1] → brighter .. darker. */
  configure(size: number, damping: number): void {
    const t60 = 0.4 + size * size * 8.6;
    this.gains = this.lengths.map((n) => t60Gain(t60, this.sr / n));
    const cutoff = 12000 - damping * 10500;
    for (const d of this.damp) d.setCutoff(cutoff, this.sr);
  }

  process(inL: number, inR: number): StereoOut {
    this.pre.write((inL + inR) * 0.5);
    let x = this.predelay > 1 ? this.pre.read(this.predelay) : (inL + inR) * 0.5;
    for (const ap of this.diffusers) x = ap.process(x);
    const s = this.state;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      s[i] = this.damp[i]!.process(this.lines[i]!.read(this.lengths[i]!)) * this.gains[i]!;
      sum += s[i]!;
    }
    // Householder feedback matrix: y = s - (2/N) * sum(s)
    const h = sum * 0.25;
    for (let i = 0; i < 8; i++) this.lines[i]!.write(s[i]! - h + x);
    this.out.l = (s[0]! + s[2]! + s[4]! + s[6]!) * 0.35;
    this.out.r = (s[1]! + s[3]! + s[5]! + s[7]!) * 0.35;
    return this.out;
  }
}

/** Two-voice stereo chorus. */
export class Chorus {
  private dl: DelayLine;
  private dr: DelayLine;
  private phase = 0;
  private inc: number;
  private readonly sr: number;
  depth = 0.5;
  readonly out: StereoOut = { l: 0, r: 0 };

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    this.dl = new DelayLine(sampleRate * 0.05);
    this.dr = new DelayLine(sampleRate * 0.05);
    this.inc = 0.6 / sampleRate;
  }

  setRate(hz: number): void {
    this.inc = hz / this.sr;
  }

  process(inL: number, inR: number): StereoOut {
    this.phase += this.inc;
    if (this.phase >= 1) this.phase -= 1;
    const base = 0.012 * this.sr;
    const mod = 0.004 * this.sr * this.depth;
    const a = Math.sin(this.phase * 2 * Math.PI);
    this.dl.write(inL);
    this.dr.write(inR);
    this.out.l = this.dl.read(base + mod * a);
    this.out.r = this.dr.read(base - mod * a);
    return this.out;
  }
}
