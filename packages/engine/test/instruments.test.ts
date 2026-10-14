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
