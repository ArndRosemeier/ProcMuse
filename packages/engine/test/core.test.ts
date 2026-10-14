import { describe, expect, it } from 'vitest';
import { Rng, hash32 } from '../src/core/rng.js';
import { ParamStore } from '../src/core/params.js';
import { ProcMuseError } from '../src/core/errors.js';
import { buildParamSpecs } from '../src/engine/paramSpecs.js';

describe('Rng', () => {
  it('replays the same sequence from the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it('fork depends on the seed and label only, not on consumption', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 100; i++) b.next();
    expect(a.fork('drums').next()).toBe(b.fork('drums').next());
    expect(a.fork('drums').next()).not.toBe(a.fork('bass').next());
  });

  it('stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const x = r.int(3, 5);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(5);
    }
  });

  it('weighted never picks a zero-weight key', () => {
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) expect(r.weighted({ a: 1, b: 0, c: 2 })).not.toBe('b');
  });

  it('hash32 is stable across runs', () => {
    expect(hash32('procmuse', 1)).toBe(hash32('procmuse', 1));
    expect(hash32('procmuse', 1)).not.toBe(hash32('procmuse', 2));
  });
});

describe('ParamStore', () => {
  const store = () => new ParamStore(buildParamSpecs());

  it('rejects unknown ids loudly', () => {
    expect(() => store().set('nope', 1)).toThrow(ProcMuseError);
  });

  it('rejects out-of-range and wrongly typed values', () => {
    const s = store();
    expect(() => s.set('music.energy', 2)).toThrow(/outside/);
    expect(() => s.set('music.energy', 'loud')).toThrow(/finite number/);
    expect(() => s.set('music.style', 'polka')).toThrow(/not one of/);
  });

  it('applies a batch atomically: one bad value changes nothing', () => {
    const s = store();
    const before = s.snapshot();
    expect(() => s.apply({ 'music.energy': 0.9, 'music.tempo': 9999 })).toThrow();
    expect(s.snapshot()).toEqual(before);
  });

  it('every spec is serializable data with a label and description', () => {
    for (const spec of buildParamSpecs()) {
      expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.description.length).toBeGreaterThan(5);
    }
  });
});
