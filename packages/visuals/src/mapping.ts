/**
 * THE music → picture mapping, as one pure function. Given the music state,
 * the settings, the frame delta and the previous motion state, it returns
 * every per-frame uniform and the next motion state. Travel and motion clocks
 * are integrated here (a speed change changes the rate, never the position),
 * reduce-motion and the flash limiter are applied here, and nowhere else.
 */
import { clamp01, type MusicState } from '@procmuse/engine';
import { VisualsError } from './errors.js';
import { initialFlashState, stepFlash, type FlashState } from './flash.js';
import { paletteCoefficients, wrap01 } from './palettes.js';
import type { VisualSettings } from './params.js';
import type { FrameUniforms } from './uniforms.js';

/** Motion speed multiplier while Reduce motion is on. */
export const REDUCED_MOTION_SCALE = 0.35;
/** Largest frame delta integrated in one step; longer gaps (hidden tab) are clamped so nothing lurches. */
export const MAX_DT = 0.1;
/** Raymarch step range driven by Detail. */
export const STEPS_MIN = 48;
export const STEPS_MAX = 110;

export interface MotionState {
  /** wall clock for grain, seconds */
  time: number;
  travel: number;
  motion: number;
  /** smoothed travel rate, travel-seconds per second */
  travelRate: number;
  /** smoothed, wrapped 0..1 */
  hue: number;
  /** smoothed section index (morphs scene shapes instead of jumping) */
  seed: number;
  sectionIndex: number;
  flash: FlashState;
}

export const initialMotion = (state?: Pick<MusicState, 'chord' | 'section'>): MotionState => ({
  time: 0,
  travel: 0,
  motion: 0,
  travelRate: 0,
  hue: state ? state.chord.hue : 0,
  seed: state ? state.section.index : 0,
  sectionIndex: state ? state.section.index : 0,
  flash: initialFlashState(),
});

export interface MappingResult {
  uniforms: FrameUniforms;
  motion: MotionState;
}

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * Math.min(1, rate * dt);

/** Travel rate the camera eases towards (before smoothing). Exported for tests. */
export function targetTravelRate(state: MusicState, s: VisualSettings, warp: number): number {
  const drive = 0.7 + (0.4 + 0.9 * state.section.energy - 0.7) * s.reactivity;
  const motionScale = s.reduceMotion ? REDUCED_MOTION_SCALE : 1;
  return s.speed * drive * motionScale * (1 + 4 * warp);
}

export function mapUniforms(state: MusicState, s: VisualSettings, dt: number, prev: MotionState): MappingResult {
  if (!Number.isFinite(dt) || dt < 0) throw new VisualsError('invalid-argument', `mapUniforms: dt must be a finite non-negative number, got ${dt}`);
  const step = Math.min(dt, MAX_DT);
  const calm = s.reduceMotion;
  const react = s.reactivity;
  const motionScale = calm ? REDUCED_MOTION_SCALE : 1;

  // the end of a section warps forward, as in 4k (off with reduced motion)
  const warp = calm ? 0 : Math.pow(clamp01(state.section.progress), 6) * react;
  const travelRate = approach(prev.travelRate, targetTravelRate(state, s, warp), 4, step);
  const travel = prev.travel + travelRate * step;
  const motion = prev.motion + motionScale * (0.4 + 0.6 * s.speed) * step;

  // circular smoothing so the colour takes the short way round the wheel
  const dh = ((((state.chord.hue - prev.hue) % 1) + 1.5) % 1) - 0.5;
  const hueRaw = prev.hue + dh * Math.min(1, 2 * step);
  const hue = wrap01(hueRaw);
  const seed = approach(prev.seed, state.section.index, 1.5, step);

  const sectionChanged = state.section.index !== prev.sectionIndex;
  const flashRequest = s.flashes && !calm && sectionChanged ? (state.section.kind === 'drop' ? 1 : 0.6) : 0;
  const flash = stepFlash(prev.flash, flashRequest, step);

  const h = state.hits;
  const hit = (x: number) => clamp01(x * react);
  const shakeAmp = calm ? 0 : 0.012 * s.shake * hit(h.snare);
  const pal = paletteCoefficients(s.palette, hue);
  const time = prev.time + step;

  const uniforms: FrameUniforms = {
    uTime: time,
    uTravel: travel,
    uMotion: motion,
    uBeat: state.beatPhase,
    uBar: state.barPhase,
    uKick: hit(h.kick),
    uSnare: hit(h.snare),
    uHats: hit(h.hats) * 0.5,
    uBass: hit(Math.max(h.bass, state.levels.bass)),
    uChords: hit(h.chords),
    uPad: hit(h.pad),
    uArp: hit(h.arp),
    uLead: hit(h.lead),
    uEnergy: clamp01(state.section.energy),
    uIntensity: clamp01(state.intensity),
    uProgress: clamp01(state.section.progress),
    uMelody: clamp01(state.melody),
    uSeed: seed,
    uWarp: warp,
    uPulse: calm ? 0 : hit(h.kick),
    uShake: [Math.sin(time * 53.1) * shakeAmp, Math.cos(time * 47.3) * shakeAmp],
    uGain: 0.4 + 1.2 * s.intensity,
    uDetail: s.detail,
    uSteps: Math.round(STEPS_MIN + (STEPS_MAX - STEPS_MIN) * s.detail),
    uPalA: pal.a,
    uPalB: pal.b,
    uPalC: pal.c,
    uPalD: pal.d,
    uGrain: 0.12 * s.grain,
    uFlash: flash.level,
  };
  return {
    uniforms,
    motion: { time, travel, motion, travelRate, hue, seed, sectionIndex: state.section.index, flash: flash.state },
  };
}
