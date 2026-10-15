import { describe, expect, it } from 'vitest';
import { BUILTIN_PATCHES } from '../src/instruments/registry.js';
import { Instrument } from '../src/instruments/instrument.js';
import { validatePatch, type Patch } from '../src/instruments/patch.js';
import { ProcMuseError } from '../src/core/errors.js';

const SR = 44100;

function renderNote(patch: Patch, seconds = 0.6): Float32Array[] {
  const inst = new Instrument(patch, SR, 1);
  const n = Math.round(SR * seconds);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  inst.noteOn(patch.category === 'bass' ? 40 : 64, 0.9);
  const half = Math.round(n / 2);
  inst.render(l, r, 0, half, { sampleRate: SR, cutoffOctaves: 0 });
  inst.noteOff(64);
  inst.noteOff(40);
  inst.render(l, r, half, n, { sampleRate: SR, cutoffOctaves: 0 });
  return [l, r];
}

describe('patch library', () => {
  it('has a wide instrumentation: at least 40 patches across every category', () => {
    expect(BUILTIN_PATCHES.length).toBeGreaterThanOrEqual(40);
    const cats = new Set(BUILTIN_PATCHES.map((p) => p.category));
    expect(cats.size).toBe(13);
  });

  it.each(BUILTIN_PATCHES.map((p) => [p.id, p] as const))('patch %s makes finite, audible, bounded sound', (_id, patch) => {
    const [l, r] = renderNote(patch, Math.max(0.6, 2 * patch.amp.attack + 0.3));
    let peak = 0;
    let energy = 0;
    for (let i = 0; i < l.length; i++) {
      const a = l[i] as number;
      const b = r[i] as number;
      expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
      peak = Math.max(peak, Math.abs(a), Math.abs(b));
      energy += a * a + b * b;
    }
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThan(4);
    expect(energy).toBeGreaterThan(0);
  });

  it('fades one oscillator on its own clock (OscBase.fade)', () => {
    const patch = validatePatch({
      id: 't-fade',
      name: 'fade',
      category: 'bell',
      description: '',
      poly: 1,
      oscillators: [{ type: 'wave', wave: 'sine', level: 1, fade: 0.1 }],
      amp: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.1 },
      level: 1,
    });
    const inst = new Instrument(patch, SR, 1);
    const l = new Float32Array(SR / 2);
    const r = new Float32Array(SR / 2);
    inst.noteOn(69, 1);
    inst.render(l, r, 0, l.length, { sampleRate: SR, cutoffOctaves: 0 });
    const peakIn = (a: number, b: number) => l.subarray(a, b).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const early = peakIn(441, 882);
    // 0.1 s T60: 60 dB down at 0.1 s, so by 0.2 s the sine is gone although the amp envelope holds
    expect(peakIn(8820, 9261)).toBeLessThan(early * 0.001);
  });

  it('formant peaks are unity gain at their centre and do not follow the played pitch', () => {
    const withPeak = (freq: number): Patch =>
      validatePatch({
        id: `t-formant-${freq}`,
        name: 'formant',
        category: 'lead',
        description: '',
        poly: 1,
        oscillators: [{ type: 'wave', wave: 'sine', level: 1 }],
        formant: { peaks: [{ freq, gain: 1 }], resonance: 0.8 },
        amp: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.1 },
        level: 1,
      });
    const rms = (patch: Patch) => {
      const inst = new Instrument(patch, SR, 1);
      const l = new Float32Array(SR / 4);
      const r = new Float32Array(SR / 4);
      inst.noteOn(81, 1); // 880 Hz
      inst.render(l, r, 0, l.length, { sampleRate: SR, cutoffOctaves: 0 });
      let e = 0;
      const from = Math.floor(l.length / 2);
      for (let i = from; i < l.length; i++) e += (l[i] as number) ** 2;
      return Math.sqrt(e / (l.length - from));
    };
    expect(rms(withPeak(880))).toBeCloseTo(Math.SQRT1_2, 1);
    expect(rms(withPeak(220))).toBeLessThan(0.2);
  });

  it('rejects malformed formants and fades loudly', () => {
    const base = BUILTIN_PATCHES[0] as Patch;
    expect(() => validatePatch({ ...base, id: 'f0', formant: { peaks: [], resonance: 0.5 } })).toThrow(ProcMuseError);
    expect(() => validatePatch({ ...base, id: 'f1', formant: { peaks: [{ freq: 5, gain: 1 }], resonance: 0.5 } })).toThrow(ProcMuseError);
    expect(() => validatePatch({ ...base, id: 'f2', oscillators: [{ type: 'wave', wave: 'sine', level: 1, fade: 0 }] })).toThrow(ProcMuseError);
  });

  it('rejects malformed patches loudly', () => {
    const broken = { ...(BUILTIN_PATCHES[0] as Patch), id: 'broken', oscillators: [] };
    expect(() => validatePatch(broken)).toThrow(ProcMuseError);
  });

  it('steals voices instead of exceeding polyphony', () => {
    const patch = BUILTIN_PATCHES.find((p) => p.poly === 8) as Patch;
    const inst = new Instrument(patch, SR, 1);
    for (let i = 0; i < 20; i++) inst.noteOn(50 + i, 0.8);
    const l = new Float32Array(64);
    const r = new Float32Array(64);
    inst.render(l, r, 0, 64, { sampleRate: SR, cutoffOctaves: 0 });
    expect(inst.activeVoices).toBe(8);
  });
});
