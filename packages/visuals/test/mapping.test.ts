import { describe, expect, it } from 'vitest';
import { initialMotion, mapUniforms, MAX_DT, type MotionState } from '../src/mapping.js';
import type { VisualSettings } from '../src/params.js';
import type { MusicState } from '@procmuse/engine';
import { musicState, settings } from './fixtures.js';

const DT = 1 / 60;

function runFrames(n: number, state: (i: number) => MusicState, s: (i: number) => VisualSettings, start?: MotionState) {
  let motion = start ?? initialMotion(state(0));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const r = mapUniforms(state(i), s(i), DT, motion);
    motion = r.motion;
    frames.push(r);
  }
  return frames;
}

describe('mapUniforms', () => {
  it('a kick hit raises the kick and pulse uniforms', () => {
    const m = initialMotion();
    const quiet = mapUniforms(musicState(), settings(), DT, m).uniforms;
    const st = musicState();
    st.hits.kick = 1;
    const hit = mapUniforms(st, settings(), DT, m).uniforms;
    expect(hit.uKick).toBeGreaterThan(quiet.uKick);
    expect(hit.uPulse).toBeGreaterThan(quiet.uPulse);
  });

  it('reactivity 0 makes hits irrelevant', () => {
    const st = musicState();
    st.hits.kick = 1;
    st.hits.snare = 1;
    const u = mapUniforms(st, settings({ reactivity: 0 }), DT, initialMotion()).uniforms;
    expect(u.uKick).toBe(0);
    expect(u.uPulse).toBe(0);
    expect(u.uShake).toEqual([0, 0]);
  });

  it('reduce motion: no pulse, no shake, no warp, no flash, and slower travel', () => {
    const st = musicState({ section: { kind: 'drop', index: 2, energy: 1, progress: 0.99, bars: 8 } });
    st.hits.kick = 1;
    st.hits.snare = 1;
    const prev = { ...initialMotion(), sectionIndex: 1 };
    const calm = settings({ reduceMotion: true, flashes: true, shake: 1 });
    const u = mapUniforms(st, calm, DT, prev).uniforms;
    expect(u.uPulse).toBe(0);
    expect(u.uShake).toEqual([0, 0]);
    expect(u.uWarp).toBe(0);
    expect(u.uFlash).toBe(0);
    const calmRun = runFrames(120, () => musicState(), () => settings({ reduceMotion: true }));
    const normalRun = runFrames(120, () => musicState(), () => settings());
    expect(calmRun[119]!.uniforms.uTravel).toBeLessThan(normalRun[119]!.uniforms.uTravel * 0.5);
    expect(calmRun[119]!.uniforms.uMotion).toBeLessThan(normalRun[119]!.uniforms.uMotion * 0.5);
  });

  it('travel is continuous when the speed changes abruptly (rate changes, position never jumps)', () => {
    const frames = runFrames(
      360,
      () => musicState(),
      (i) => settings({ speed: i < 180 ? 0.5 : 2 }),
    );
    const deltas = frames.map((f, i) => f.uniforms.uTravel - (i ? frames[i - 1]!.uniforms.uTravel : 0));
    const steady = deltas[179]!;
    // a clock-times-speed model would jump by (2 - 0.5) * 3 s of travel here; we ease the rate instead
    expect(deltas[180]!).toBeLessThan(steady * 1.3);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]!).toBeGreaterThanOrEqual(0);
      expect(Math.abs(deltas[i]! - deltas[i - 1]!)).toBeLessThan(0.01);
    }
    expect(deltas[359]!).toBeGreaterThan(steady * 3); // and it does get there
  });

  it('flashes stay off by default; when enabled a section change flashes, within the limiter cap', () => {
    const before = musicState({ section: { kind: 'build', index: 1, energy: 0.6, progress: 0.9, bars: 8 } });
    const after = musicState({ section: { kind: 'drop', index: 2, energy: 1, progress: 0, bars: 8 } });
    const off = runFrames(30, (i) => (i < 5 ? before : after), () => settings());
    expect(Math.max(...off.map((f) => f.uniforms.uFlash))).toBe(0);
    const on = runFrames(30, (i) => (i < 5 ? before : after), () => settings({ flashes: true }));
    const peak = Math.max(...on.map((f) => f.uniforms.uFlash));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(0.6);
  });

  it('chord colour takes the short way round the hue wheel', () => {
    const prev = { ...initialMotion(), hue: 0.95 };
    const r = mapUniforms(musicState({ chord: { root: 0, name: 'C', key: 'C', hue: 0.05 } }), settings(), DT, prev);
    expect(r.motion.hue > 0.95 || r.motion.hue < 0.05).toBe(true);
  });

  it('section changes morph the scene seed instead of jumping', () => {
    const prev = initialMotion(musicState());
    const r = mapUniforms(musicState({ section: { kind: 'drop', index: 2, energy: 1, progress: 0, bars: 8 } }), settings(), DT, prev);
    expect(r.motion.seed).toBeGreaterThan(1);
    expect(r.motion.seed).toBeLessThan(1.1);
  });

  it('clamps long gaps and rejects invalid dt loudly', () => {
    const m = initialMotion();
    const r = mapUniforms(musicState(), settings(), 10, m);
    expect(r.motion.time).toBeCloseTo(MAX_DT);
    expect(() => mapUniforms(musicState(), settings(), Number.NaN, m)).toThrow(/dt/);
    expect(() => mapUniforms(musicState(), settings(), -1, m)).toThrow(/dt/);
  });

  it('detail scales the raymarch step count', () => {
    const lo = mapUniforms(musicState(), settings({ detail: 0 }), DT, initialMotion()).uniforms.uSteps;
    const hi = mapUniforms(musicState(), settings({ detail: 1 }), DT, initialMotion()).uniforms.uSteps;
    expect(lo).toBeLessThan(hi);
    expect(Number.isInteger(lo) && Number.isInteger(hi)).toBe(true);
  });
});
