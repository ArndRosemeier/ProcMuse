/** Time-grid helpers: the ONE place swing and humanize are applied to generated notes. */
import type { BarContext, NoteEvent } from './types.js';
import type { PartId } from './parts.js';

export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = 16;

/** Beat offset (within the bar) of a 16th step, with swing delaying the off-16ths up to a triplet feel. */
export function stepToBeat(step: number, swing: number): number {
  const base = step / 4;
  return step % 2 === 1 ? base + swing * (1 / 12) : base;
}

/**
 * Creates a note at a 16th step (fractional steps allowed) of the current bar.
 * Applies the bar's swing and humanize macros consistently for every part.
 */
export function noteAt(ctx: BarContext, part: PartId, pitch: number, velocity: number, step: number, durationBeats: number): NoteEvent {
  const h = ctx.macros.humanize;
  const swung = Number.isInteger(step) ? stepToBeat(step, ctx.macros.swing) : step / 4;
  const jitter = h > 0 && step !== 0 ? ctx.rng.jitter(0.012 * h) : 0;
  const vel = Math.min(1, Math.max(0.05, velocity + (h > 0 ? ctx.rng.jitter(0.12 * h) : 0)));
  return {
    part,
    pitch: Math.round(pitch),
    velocity: vel,
    start: ctx.startBeat + Math.max(0, swung + jitter),
    duration: Math.max(0.02, durationBeats),
  };
}

/** Standard accent shape for a 16th step: downbeats loudest, off-16ths softest. */
export function accent(step: number): number {
  return step % 4 === 0 ? 1 : step % 2 === 0 ? 0.82 : 0.66;
}

