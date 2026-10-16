/**
 * The mixer: one channel per part (instrument + gain/pan/sends + sidechain
 * ducking), two send effects (reverb, echo), and the master chain
 * (glue compressor → limiter). Rendering is block-based: voices render into
 * channel buffers in segments, then `finish` mixes the whole block.
 */
import { PART_IDS, PART_INFO, type PartId } from '../compose/parts.js';
import { dbToGain, panGains } from '../core/math.js';
import { Compressor, Limiter } from '../dsp/dynamics.js';
import { Reverb, StereoDelay } from '../dsp/effects.js';
import { DcBlocker } from '../dsp/filter.js';
import { Instrument } from '../instruments/instrument.js';
import type { Patch } from '../instruments/patch.js';
import type { VoiceContext } from '../instruments/voice.js';

export const MAX_BLOCK = 512;

export interface ChannelSettings {
  gainDb: number;
  pan: number;
  reverb: number;
  delay: number;
}

export interface MixSettings {
  volumeDb: number;
  /** 0..1 return level of the send effects */
  space: number;
  /** 0..1 sidechain depth */
  duck: number;
  /** octaves added to every filter cutoff */
  cutoffOctaves: number;
  reverbSize: number;
  reverbDamping: number;
  delaySamples: number;
  delayFeedback: number;
}

class Channel {
  readonly part: PartId;
  instrument: Instrument | null = null;
  /** the instrument it replaced, ringing out its released notes so a swap never cuts a tail */
  retiring: Instrument | null = null;
  readonly l = new Float32Array(MAX_BLOCK);
  readonly r = new Float32Array(MAX_BLOCK);
  settings: ChannelSettings = { gainDb: 0, pan: 0, reverb: 0, delay: 0 };
  /** smoothed per-block RMS for meters and visuals */
  level = 0;
  constructor(part: PartId) {
    this.part = part;
  }
}

export class Mixer {
  readonly sampleRate: number;
  readonly channels: Channel[];
  private reverb: Reverb;
  private delay: StereoDelay;
  private glue: Compressor;
  private limiter: Limiter;
  private dcL: DcBlocker;
  private dcR: DcBlocker;
  private duckEnv = 0;
  private duckCoef: number;
  private duckTriggers: number[] = [];
  private frame = { l: 0, r: 0 };
  settings: MixSettings = {
    volumeDb: -3,
    space: 0.5,
    duck: 0.5,
    cutoffOctaves: 0,
    reverbSize: 0.6,
    reverbDamping: 0.45,
    delaySamples: 20000,
    delayFeedback: 0.4,
  };
  masterLevel = 0;
  private voiceCtx: VoiceContext;
  private fxDirty = true;
  /** preallocated per-block scratch: the audio thread must not allocate */
  private scratch = {
    gl: new Float64Array(PART_IDS.length),
    gr: new Float64Array(PART_IDS.length),
    sendR: new Float64Array(PART_IDS.length),
    sendD: new Float64Array(PART_IDS.length),
    ducked: new Uint8Array(PART_IDS.length),
  };

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.channels = PART_IDS.map((p) => new Channel(p));
    this.reverb = new Reverb(sampleRate);
    this.delay = new StereoDelay(sampleRate);
    this.glue = new Compressor(sampleRate, 0.02, 0.25);
    this.glue.thresholdDb = -10;
    this.glue.ratio = 2;
    this.limiter = new Limiter(sampleRate);
    this.dcL = new DcBlocker(sampleRate);
    this.dcR = new DcBlocker(sampleRate);
    this.duckCoef = Math.exp(-1 / (0.16 * sampleRate));
    this.voiceCtx = { sampleRate, cutoffOctaves: 0 };
  }

  setInstrument(index: number, patch: Patch, seed: number): void {
    const ch = this.channels[index] as Channel;
    if (ch.instrument?.patch.id === patch.id) return;
    if (ch.instrument) {
      ch.instrument.allOff();
      ch.retiring = ch.instrument;
    }
    ch.instrument = new Instrument(patch, this.sampleRate, seed);
  }

  updateSettings(s: MixSettings): void {
    if (s.reverbSize !== this.settings.reverbSize || s.reverbDamping !== this.settings.reverbDamping) this.fxDirty = true;
    this.settings = s;
    this.voiceCtx.cutoffOctaves = s.cutoffOctaves;
    this.delay.time = s.delaySamples;
    this.delay.feedback = s.delayFeedback;
    if (this.fxDirty) {
      this.reverb.configure(s.reverbSize, s.reverbDamping);
      this.fxDirty = false;
    }
  }

  noteOn(index: number, pitch: number, velocity: number): void {
    this.channels[index]?.instrument?.noteOn(pitch, velocity);
  }

  noteOff(index: number, pitch: number): void {
    this.channels[index]?.instrument?.noteOff(pitch);
  }

  allNotesOff(): void {
    for (const ch of this.channels) {
      ch.instrument?.allOff();
      ch.retiring?.allOff();
    }
  }

  /** Kick hit at `offset` frames into the current block. */
  triggerDuck(offset: number): void {
    this.duckTriggers.push(offset);
  }

  beginBlock(frames: number): void {
    for (const ch of this.channels) {
      ch.l.fill(0, 0, frames);
      ch.r.fill(0, 0, frames);
    }
  }

  /** Renders every channel's voices over [start, end) of the block. */
  renderVoices(start: number, end: number): void {
    if (end <= start) return;
    for (const ch of this.channels) {
      ch.instrument?.render(ch.l, ch.r, start, end, this.voiceCtx);
      if (ch.retiring) {
        ch.retiring.render(ch.l, ch.r, start, end, this.voiceCtx);
        if (ch.retiring.activeVoices === 0) ch.retiring = null;
      }
    }
  }

  /** Mixes the block into outL/outR. */
  finish(outL: Float32Array, outR: Float32Array, frames: number): void {
    const s = this.settings;
    const chans = this.channels;
    const n = chans.length;
    const { gl, gr, sendR, sendD, ducked } = this.scratch;
    for (let i = 0; i < n; i++) {
      const c = chans[i] as Channel;
      const g = dbToGain(c.settings.gainDb);
      const [pl, pr] = panGains(c.settings.pan);
      gl[i] = g * pl * Math.SQRT2;
      gr[i] = g * pr * Math.SQRT2;
      sendR[i] = c.settings.reverb * g;
      sendD[i] = c.settings.delay * g;
      ducked[i] = PART_INFO[c.part].ducked ? 1 : 0;
      // meter
      let sum = 0;
      for (let k = 0; k < frames; k++) sum += (c.l[k] as number) ** 2 + (c.r[k] as number) ** 2;
      const rms = Math.sqrt(sum / (2 * frames)) * g;
      c.level += (rms - c.level) * 0.3;
    }
    const master = dbToGain(s.volumeDb);
    const ret = s.space * 1.4;
    const triggers = this.duckTriggers.sort((a, b) => a - b);
    let ti = 0;
    let peak = 0;
    for (let k = 0; k < frames; k++) {
      while (ti < triggers.length && (triggers[ti] as number) <= k) {
        this.duckEnv = 1;
        ti++;
      }
      const duckGain = 1 - s.duck * 0.85 * this.duckEnv;
      this.duckEnv *= this.duckCoef;
      let l = 0;
      let r = 0;
      let rvIn = 0;
      let dlIn = 0;
      for (let i = 0; i < n; i++) {
        const c = chans[i] as Channel;
        const xl = c.l[k] as number;
        const xr = c.r[k] as number;
        if (xl === 0 && xr === 0) continue;
        const dg = ducked[i] ? duckGain : 1;
        l += xl * (gl[i] as number) * dg;
        r += xr * (gr[i] as number) * dg;
        const mono = (xl + xr) * 0.5 * dg;
        rvIn += mono * (sendR[i] as number);
        dlIn += mono * (sendD[i] as number);
      }
      const d = this.delay.process(dlIn, dlIn);
      // echoes also feed the reverb a little, which glues them into the space
      const rv = this.reverb.process(rvIn + (d.l + d.r) * 0.15, rvIn + (d.l + d.r) * 0.15);
      l += (rv.l + d.l * 0.6) * ret;
      r += (rv.r + d.r * 0.6) * ret;
      l = this.dcL.process(l);
      r = this.dcR.process(r);
      const cg = this.glue.gainFor(Math.max(Math.abs(l), Math.abs(r)));
      this.limiter.process(l * cg * master, r * cg * master, this.frame);
      outL[k] = this.frame.l;
      outR[k] = this.frame.r;
      const a = Math.abs(this.frame.l);
      if (a > peak) peak = a;
    }
    this.duckTriggers.length = 0;
    this.masterLevel += (peak - this.masterLevel) * 0.3;
  }

  /** Active voices across all channels (for diagnostics). */
  get voiceCount(): number {
    let v = 0;
    for (const ch of this.channels) v += (ch.instrument?.activeVoices ?? 0) + (ch.retiring?.activeVoices ?? 0);
    return v;
  }
}
