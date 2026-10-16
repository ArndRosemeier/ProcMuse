/**
 * THE voice: renders any Patch. See instruments/patch.ts for why there is only one.
 *
 * Audio-rate work (oscillators, filter, envelopes) runs per sample; pitch,
 * cutoff and LFO are updated at control rate (every CONTROL_PERIOD samples).
 */
import { ProcMuseError } from '../core/errors.js';
import { Adsr } from '../dsp/envelope.js';
import { Svf } from '../dsp/filter.js';
import { Noise } from '../dsp/noise.js';
import { FmOperator, Oscillator } from '../dsp/osc.js';
import { Pluck } from '../dsp/pluck.js';
import { SamplePlayer } from '../dsp/sampler.js';
import { drive as applyDrive } from '../dsp/shape.js';
import { TAU, clamp, panGains, t60Gain } from '../core/math.js';
import { foldInto, midiToFreq } from '../theory/pitch.js';
import type { OscSpec, Patch } from './patch.js';
import { pickZone, type SampleBank, type SampleSet } from './samples.js';

export const CONTROL_PERIOD = 16;

/** Per-channel modulation the mixer/macros apply on top of the patch. */
export interface VoiceContext {
  sampleRate: number;
  /** multiplies the filter cutoff (brightness macro), in octaves added */
  cutoffOctaves: number;
}

interface OscRuntime {
  spec: OscSpec;
  waves: Oscillator[];
  /** per-unison-copy detune ratio and pan gains */
  ratios: number[];
  gl: number[];
  gr: number[];
  fm: FmOperator | null;
  pluck: Pluck | null;
  sampler: SamplePlayer | null;
  set: SampleSet | null;
  /** sampler frames per output sample at 1 Hz, for the zone now playing */
  zoneScale: number;
  /** frequency multiplier from octave/semi/detune */
  mul: number;
  norm: number;
  /** per-oscillator fade (OscBase.fade): current gain and per-sample multiplier; coef 1 = no fade */
  fadeGain: number;
  fadeCoef: number;
}

/** One fixed formant peak, per channel. */
interface FormantRuntime {
  l: Svf;
  r: Svf;
  /** peak gain, normalized so a gain of 1 is unity at the centre frequency */
  gain: number;
}


export class Voice {
  readonly patch: Patch;
  private readonly sr: number;
  private oscs: OscRuntime[] = [];
  private amp = new Adsr();
  private fenv = new Adsr();
  private filterL: Svf | null = null;
  private filterR: Svf | null = null;
  private noise: Noise;
  private hasNoise = false;
  private formants: FormantRuntime[] = [];
  private formantDry = 0;

  /** MIDI note being played (after fixedNote), for voice allocation. */
  note = -1;
  /** monotonically increasing start stamp, for stealing the oldest voice */
  started = 0;
  private velocity = 0;
  private velGain = 1;
  private pitch = 60;
  private targetPitch = 60;
  private glideCoef = 1;
  private pitchEnv = 0;
  private pitchEnvCoef = 0;
  private fmIndexEnv = 0;
  private fmIndexCoef = 0;
  private lfoPhase = 0;
  private lfoAge = 0;
  private ctrl = 0;
  private lfoAmpGain = 1;

  private readonly samples: SampleBank | null;

  /** `samples` is required when the patch plays recordings; a missing set throws. */
  constructor(patch: Patch, sampleRate: number, seed: number, samples: SampleBank | null = null) {
    this.samples = samples;
    this.patch = patch;
    this.sr = sampleRate;
    this.noise = new Noise(seed);
    this.amp.configure(patch.amp, sampleRate);
    if (patch.filter) {
      this.filterL = new Svf(patch.filter.mode);
      this.filterR = new Svf(patch.filter.mode);
      if (patch.filter.env) this.fenv.configure(patch.filter.env, sampleRate);
    }
    for (const spec of patch.oscillators) this.oscs.push(this.buildOsc(spec));
    if (patch.formant) {
      const { peaks, resonance, dry } = patch.formant;
      // the SVF band-pass peaks at 1/k; scaling by k makes `gain` the peak gain
      const k = 2 - 1.96 * resonance;
      for (const pk of peaks) {
        const l = new Svf('bandpass');
        const r = new Svf('bandpass');
        l.set(pk.freq, resonance, sampleRate);
        r.set(pk.freq, resonance, sampleRate);
        this.formants.push({ l, r, gain: pk.gain * k });
      }
      this.formantDry = dry ?? 0;
    }
  }

  private buildOsc(spec: OscSpec): OscRuntime {
    const rt: OscRuntime = {
      spec,
      waves: [],
      ratios: [],
      gl: [],
      gr: [],
      fm: null,
      pluck: null,
      sampler: null,
      set: null,
      zoneScale: 0,
      mul: 1,
      norm: spec.level,
      fadeGain: 1,
      fadeCoef: spec.fade === undefined ? 1 : t60Gain(spec.fade, this.sr),
    };
    if (spec.type !== 'noise') {
      rt.mul = Math.pow(2, (spec.octave ?? 0) + (spec.semi ?? 0) / 12 + (spec.detune ?? 0) / 1200);
    }
    if (spec.type === 'wave') {
      const n = Math.round(spec.unison ?? 1);
      const spread = spec.spread ?? 0;
      for (let i = 0; i < n; i++) {
        const pos = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5
        const o = new Oscillator(spec.wave, n === 1 ? 0 : (this.noise.white() + 1) * 0.5);
        if (spec.pw !== undefined) o.pw = spec.pw;
        rt.waves.push(o);
        rt.ratios.push(Math.pow(2, (pos * spread) / 1200));
        const [l, r] = panGains(n === 1 ? 0 : pos * 1.6);
        rt.gl.push(l * Math.SQRT2);
        rt.gr.push(r * Math.SQRT2);
      }
      rt.norm = spec.level / Math.sqrt(n);
    } else if (spec.type === 'fm') {
      rt.fm = new FmOperator();
      rt.fm.ratio = spec.ratio;
      rt.fm.feedback = spec.feedback ?? 0;
    } else if (spec.type === 'pluck') {
      rt.pluck = new Pluck(this.sr);
    } else if (spec.type === 'sample') {
      if (!this.samples) throw new ProcMuseError('missing-samples', `patch ${this.patch.id} plays recordings but no samples were given`);
      rt.set = this.samples.get(spec.set);
      rt.sampler = new SamplePlayer();
    } else {
      this.hasNoise = true;
      this.noise.pink = spec.pink ?? false;
    }
    return rt;
  }

  get active(): boolean {
    return !this.amp.idle;
  }

  get releasing(): boolean {
    return this.amp.released;
  }

  noteOn(midi: number, velocity: number, stamp: number, legato: boolean): void {
    const p = this.patch;
    const note = p.fixedNote ?? (p.range ? foldInto(midi, p.range[0], p.range[1]) : midi);
    this.note = midi;
    this.started = stamp;
    this.velocity = velocity;
    this.velGain = 1 - (p.velocity ?? 0.6) * (1 - velocity);
    this.targetPitch = note;
    const glide = p.glide ?? 0;
    if (!(legato && glide > 0 && this.active)) this.pitch = note;
    this.glideCoef = glide > 0 ? 1 - Math.exp(-CONTROL_PERIOD / (glide * this.sr)) : 1;
    if (p.pitchEnv) {
      this.pitchEnv = p.pitchEnv.semitones;
      this.pitchEnvCoef = Math.exp(-1 / (Math.max(0.001, p.pitchEnv.decay) * this.sr));
    }
    if (legato && this.active && p.poly === 1) return; // legato: keep envelopes running
    this.amp.gateOn();
    this.fenv.gateOn();
    this.lfoAge = 0;
    for (const o of this.oscs) {
      o.fadeGain = 1;
      if (o.fm && o.spec.type === 'fm') {
        this.fmIndexEnv = o.spec.indexEnv ?? 0;
        this.fmIndexCoef = Math.exp(-CONTROL_PERIOD / (Math.max(0.001, o.spec.indexDecay ?? 0.3) * this.sr));
        o.fm.phase = 0;
        o.fm.modPhase = 0;
      }
      if (o.sampler && o.set) {
        const zone = pickZone(o.set, note + 12 * Math.log2(o.mul), velocity);
        o.sampler.start(zone);
        o.zoneScale = o.set.sampleRate / midiToFreq(zone.root) / this.sr;
      }
      if (o.pluck && o.spec.type === 'pluck') {
        o.pluck.trigger(midiToFreq(note) * o.mul, this.sr, o.spec.decay, clamp(o.spec.brightness * (0.6 + 0.4 * velocity), 0, 1), this.noise);
      }
    }
    this.ctrl = 0;
  }

  noteOff(): void {
    this.amp.gateOff();
    this.fenv.gateOff();
  }

  /** Immediately silences the voice (used when stealing). */
  kill(): void {
    this.amp.reset();
    this.fenv.reset();
    this.filterL?.reset();
    this.filterR?.reset();
    for (const f of this.formants) {
      f.l.reset();
      f.r.reset();
    }
    this.note = -1;
  }

  private control(ctx: VoiceContext): void {
    const p = this.patch;
    // pitch: glide toward target, plus pitch envelope and LFO vibrato
    this.pitch += (this.targetPitch - this.pitch) * this.glideCoef;
    let lfo = 0;
    let lfoFade = 1;
    if (p.lfo) {
      this.lfoPhase += (p.lfo.rate * CONTROL_PERIOD) / this.sr;
      if (this.lfoPhase >= 1) this.lfoPhase -= Math.floor(this.lfoPhase);
      lfo = p.lfo.wave === 'triangle' ? 1 - 4 * Math.abs(this.lfoPhase - 0.5) : Math.sin(TAU * this.lfoPhase);
      this.lfoAge += CONTROL_PERIOD / this.sr;
      const d = p.lfo.delay ?? 0;
      lfoFade = d > 0 ? clamp(this.lfoAge / d - 1, 0, 1) : 1;
      this.lfoAmpGain = 1 - (p.lfo.amp ?? 0) * lfoFade * (0.5 + 0.5 * lfo);
    }
    const pitch = this.pitch + this.pitchEnv + lfo * lfoFade * (p.lfo?.pitch ?? 0);
    const freq = midiToFreq(pitch);
    const inc = freq / this.sr;
    this.fmIndexEnv *= this.fmIndexCoef;
    for (const o of this.oscs) {
      const base = inc * o.mul;
      for (let i = 0; i < o.waves.length; i++) (o.waves[i] as Oscillator).inc = base * (o.ratios[i] as number);
      if (o.sampler) o.sampler.inc = freq * o.mul * o.zoneScale;
      if (o.fm && o.spec.type === 'fm') {
        o.fm.inc = base;
        o.fm.index = o.spec.index + this.fmIndexEnv;
      }
    }
    const f = p.filter;
    if (f && this.filterL && this.filterR) {
      const oct =
        ctx.cutoffOctaves +
        (f.envAmount ?? 0) * this.fenv.value +
        (f.velocity ?? 0) * this.velocity +
        (f.keyTrack ?? 0) * ((pitch - 60) / 12) +
        lfo * lfoFade * (p.lfo?.cutoff ?? 0);
      const cutoff = f.cutoff * Math.pow(2, oct);
      this.filterL.set(cutoff, f.resonance, this.sr);
      this.filterR.set(cutoff, f.resonance, this.sr);
    }
  }

  /** Adds this voice's output into outL/outR over [start, end). */
  render(outL: Float32Array, outR: Float32Array, start: number, end: number, ctx: VoiceContext): void {
    const p = this.patch;
    const drv = p.drive ?? 0;
    const gain = p.level * this.velGain;
    const fl = this.filterL;
    const fr = this.filterR;
    const hasFilterEnv = !!p.filter?.env;
    const formants = this.formants;
    for (let n = start; n < end; n++) {
      if (this.ctrl === 0) this.control(ctx);
      this.ctrl = (this.ctrl + 1) % CONTROL_PERIOD;
      if (this.pitchEnvCoef) this.pitchEnv *= this.pitchEnvCoef;
      if (hasFilterEnv) this.fenv.next();
      let l = 0;
      let r = 0;
      for (const o of this.oscs) {
        const g = o.norm * o.fadeGain;
        o.fadeGain *= o.fadeCoef;
        if (o.waves.length) {
          for (let i = 0; i < o.waves.length; i++) {
            const s = (o.waves[i] as Oscillator).next();
            l += s * (o.gl[i] as number) * g;
            r += s * (o.gr[i] as number) * g;
          }
        } else if (o.fm) {
          const s = o.fm.next() * g;
          l += s;
          r += s;
        } else if (o.sampler) {
          const s = o.sampler.next() * g;
          l += s;
          r += s;
        } else if (o.pluck) {
          const s = o.pluck.next() * g;
          l += s;
          r += s;
        } else if (this.hasNoise) {
          const s = this.noise.next() * g;
          l += s;
          r += s;
        }
      }
      if (fl && fr) {
        l = fl.process(l);
        r = fr.process(r);
      }
      if (formants.length) {
        let fl2 = l * this.formantDry;
        let fr2 = r * this.formantDry;
        for (const f of formants) {
          fl2 += f.l.process(l) * f.gain;
          fr2 += f.r.process(r) * f.gain;
        }
        l = fl2;
        r = fr2;
      }
      if (drv > 0) {
        l = applyDrive(l, drv);
        r = applyDrive(r, drv);
      }
      const a = this.amp.next() * gain * this.lfoAmpGain;
      outL[n] = (outL[n] as number) + l * a;
      outR[n] = (outR[n] as number) + r * a;
      if (this.amp.idle) {
        this.note = -1;
        break;
      }
    }
  }
}
