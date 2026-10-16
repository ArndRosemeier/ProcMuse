/** An Instrument is a voice pool playing one Patch: allocation, stealing, mono legato. */
import type { Patch } from './patch.js';
import type { SampleBank } from './samples.js';
import { Voice, type VoiceContext } from './voice.js';

export class Instrument {
  readonly patch: Patch;
  private voices: Voice[] = [];
  private stamp = 0;
  private held: number[] = [];

  constructor(patch: Patch, sampleRate: number, seed: number, samples: SampleBank | null = null) {
    this.patch = patch;
    for (let i = 0; i < patch.poly; i++) this.voices.push(new Voice(patch, sampleRate, (seed + i * 7919) >>> 0, samples));
  }

  noteOn(midi: number, velocity: number): void {
    this.stamp++;
    if (this.patch.poly === 1) {
      const v = this.voices[0] as Voice;
      const legato = this.held.length > 0;
      this.held.push(midi);
      v.noteOn(midi, velocity, this.stamp, legato);
      return;
    }
    // re-strike the same note on its own voice; else a free voice; else steal the oldest released, then the oldest
    let voice = this.voices.find((v) => v.active && v.note === midi);
    voice ??= this.voices.find((v) => !v.active);
    if (!voice) {
      const released = this.voices.filter((v) => v.releasing);
      const pool = released.length ? released : this.voices;
      voice = pool.reduce((a, b) => (a.started <= b.started ? a : b));
      voice.kill();
    }
    voice.noteOn(midi, velocity, this.stamp, false);
  }

  noteOff(midi: number): void {
    if (this.patch.poly === 1) {
      this.held = this.held.filter((n) => n !== midi);
      if (this.held.length === 0) (this.voices[0] as Voice).noteOff();
      return;
    }
    for (const v of this.voices) if (v.note === midi && !v.releasing) v.noteOff();
  }

  allOff(): void {
    this.held = [];
    for (const v of this.voices) v.noteOff();
  }

  get activeVoices(): number {
    let n = 0;
    for (const v of this.voices) if (v.active) n++;
    return n;
  }

  render(outL: Float32Array, outR: Float32Array, start: number, end: number, ctx: VoiceContext): void {
    for (const v of this.voices) if (v.active) v.render(outL, outR, start, end, ctx);
  }
}
