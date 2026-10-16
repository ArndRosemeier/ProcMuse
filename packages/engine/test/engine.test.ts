import { describe, expect, it } from 'vitest';
import { EngineCore } from '../src/engine/core.js';
import { P, SEED_LIMIT, buildParamSpecs, seedFrom } from '../src/engine/paramSpecs.js';
import { renderOffline } from '../src/render/offline.js';
import { MusicStateTracker } from '../src/state/tracker.js';
import { encodeWav } from '../src/render/wav.js';
import type { EngineEvent } from '../src/engine/events.js';

const SR = 22050;

function stats(l: Float32Array, r: Float32Array) {
  let peak = 0;
  let finite = true;
  let sum = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i] as number;
    const b = r[i] as number;
    if (!Number.isFinite(a) || !Number.isFinite(b)) finite = false;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    sum += a * a + b * b;
  }
  return { peak, finite, rms: Math.sqrt(sum / (2 * l.length)) };
}

describe('EngineCore', () => {
  it('renders finite audio that never exceeds full scale', () => {
    const res = renderOffline({ seconds: 20, sampleRate: SR, params: { 'music.energy': 1, 'music.complexity': 1 } });
    const s = stats(res.left, res.right);
    expect(s.finite).toBe(true);
    expect(s.peak).toBeLessThanOrEqual(1);
    expect(s.rms).toBeGreaterThan(0.02);
  });

  it('is deterministic for a given seed and parameter set', () => {
    const a = renderOffline({ seconds: 4, sampleRate: SR, params: { 'music.seed': 77 } });
    const b = renderOffline({ seconds: 4, sampleRate: SR, params: { 'music.seed': 77 } });
    expect(Buffer.from(a.left.buffer).equals(Buffer.from(b.left.buffer))).toBe(true);
  });

  it('emits beats, sections, chords, notes and levels with increasing times', () => {
    const { events } = renderOffline({ seconds: 10, sampleRate: SR });
    const types = new Set(events.map((e) => e.type));
    for (const t of ['beat', 'section', 'chord', 'note', 'levels']) expect(types.has(t as EngineEvent['type'])).toBe(true);
    const beats = events.filter((e) => e.type === 'beat');
    // 120 BPM → 2 beats per second
    expect(beats.length).toBeGreaterThanOrEqual(19);
    expect(beats.length).toBeLessThanOrEqual(21);
    let last = -1;
    for (const e of events) if ('time' in e) {
      expect(e.time).toBeGreaterThanOrEqual(last - 1e-9);
      last = e.time;
    }
  });

  it('follows tempo changes', () => {
    const { events } = renderOffline({ seconds: 10, sampleRate: SR, params: { 'music.tempo': 60 } });
    const beats = events.filter((e) => e.type === 'beat').length;
    expect(beats).toBeGreaterThanOrEqual(9);
    expect(beats).toBeLessThanOrEqual(11);
  });

  it('changing the style applies its defaults and announces them', () => {
    const core = new EngineCore({ sampleRate: SR });
    const events: EngineEvent[] = [];
    core.setListener((e) => events.push(e));
    core.setParam('music.style', 'lofi');
    expect(core.params.number('music.tempo')).toBe(82);
    expect(core.params.string('part.chords.instrument')).toBe('keys-epiano');
    expect(events.some((e) => e.type === 'param' && e.id === 'music.tempo')).toBe(true);
  });

  it('a muted part stops sounding at once', () => {
    const core = new EngineCore({ sampleRate: SR, params: { 'part.kick.mode': 'on' } });
    const notes: string[] = [];
    core.setListener((e) => e.type === 'note' && notes.push(e.part));
    const buf = () => [new Float32Array(SR), new Float32Array(SR)] as const;
    core.process(...buf());
    expect(notes).toContain('kick');
    core.setParam('part.kick.mode', 'off');
    notes.length = 0;
    core.process(...buf());
    core.process(...buf());
    expect(notes).not.toContain('kick');
  });

  it('regenerate picks a new seed and keeps playing', () => {
    const core = new EngineCore({ sampleRate: SR });
    const seed = core.params.number('music.seed');
    core.process(new Float32Array(SR), new Float32Array(SR));
    core.command({ type: 'regenerate' });
    expect(core.params.number('music.seed')).not.toBe(seed);
    const l = new Float32Array(SR * 2);
    core.process(l, new Float32Array(SR * 2));
    expect(stats(l, l).rms).toBeGreaterThan(0.01);
  });

  it('seedFrom maps any 32-bit number into the Seed control range', () => {
    const spec = buildParamSpecs().find((s) => s.id === P.seed);
    if (spec?.kind !== 'number') throw new Error('seed spec missing');
    expect(spec.min).toBe(0);
    expect(spec.max).toBe(SEED_LIMIT - 1);
    for (const n of [0, 1, SEED_LIMIT - 1, SEED_LIMIT, 0xffffffff, -1, 4096]) {
      const seed = seedFrom(n);
      expect(Number.isInteger(seed) && seed >= spec.min && seed <= spec.max).toBe(true);
    }
    const core = new EngineCore({ sampleRate: SR, params: { [P.seed]: seedFrom(0xdeadbeef) } });
    expect(core.params.number(P.seed)).toBe(seedFrom(0xdeadbeef));
  });

  it('nextSection starts a new section at the next bar', () => {
    const core = new EngineCore({ sampleRate: SR });
    const sections: number[] = [];
    core.setListener((e) => e.type === 'section' && sections.push(e.index));
    core.process(new Float32Array(SR), new Float32Array(SR));
    core.command({ type: 'nextSection', kind: 'drop' });
    core.process(new Float32Array(SR * 3), new Float32Array(SR * 3));
    expect(sections).toEqual([0, 1]);
  });

  it('rejects bad input loudly', () => {
    expect(() => new EngineCore({ sampleRate: 10 })).toThrow();
    const core = new EngineCore({ sampleRate: SR });
    expect(() => core.setParam('music.tempo', 1000)).toThrow();
    expect(() => core.process(new Float32Array(10), new Float32Array(11))).toThrow();
  });
});

describe('MusicStateTracker', () => {
  it('applies events only when the listener clock reaches them, and hits decay', () => {
    const t = new MusicStateTracker();
    t.push([{ type: 'note', time: 1, part: 'kick', pitch: 36, velocity: 1, duration: 0.1 }]);
    expect(t.update(0.5).hits.kick).toBe(0);
    expect(t.update(1).hits.kick).toBeCloseTo(1);
    expect(t.update(1.5).hits.kick).toBeLessThan(0.05);
  });

  it('tracks beat phase, section and chord colour', () => {
    const t = new MusicStateTracker();
    t.push([
      { type: 'beat', time: 0, bar: 0, beat: 0, tempo: 120 },
      { type: 'section', time: 0, index: 0, kind: 'drop', energy: 1, bars: 4, startBar: 0 },
      { type: 'chord', time: 0, root: 7, degree: 4, name: 'G', key: 'C Major' },
    ]);
    const s = t.update(0.25);
    expect(s.beatPhase).toBeCloseTo(0.5);
    expect(s.section.kind).toBe('drop');
    expect(s.chord.hue).toBeCloseTo(((7 * 7) % 12) / 12);
  });
});

describe('wav', () => {
  it('writes a valid header and sample data', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1]), new Float32Array([0, 0.5, -0.5]), 44100);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(bytes.length).toBe(44 + 3 * 4);
  });
});
