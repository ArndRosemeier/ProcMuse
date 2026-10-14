/** Lead melody (motif development) and texture (drones and risers). */
import { Rng } from '../../core/rng.js';
import { chordTonesInRange } from '../../theory/chord.js';
import { foldInto, noteAt } from '../rhythm.js';
import type { BarContext, Motif, NoteEvent, PartMemory } from '../types.js';

/** Creates a two-bar motif: rhythm (onsets in 16ths) plus a scale-step contour. */
export function createMotif(rng: Rng, complexity: number, density: number): Motif {
  const steps: number[] = [];
  for (let s = 0; s < 32; s++) {
    const p = s % 8 === 0 ? 0.85 : s % 4 === 0 ? 0.6 : s % 2 === 0 ? 0.35 : 0.1 + 0.25 * complexity;
    if (s === 0 || rng.chance(p * (0.5 + density))) steps.push(s);
  }
  // keep the phrase breathing: thin out if too dense
  while (steps.length > 6 + Math.round(10 * complexity)) steps.splice(rng.int(1, steps.length - 1), 1);
  const lengths = steps.map((s, i) => {
    const gap = (steps[i + 1] ?? 32) - s;
    return Math.max(1, Math.min(gap, rng.chance(0.3) ? 1 : 8));
  });
  const dir = rng.chance(0.5) ? 1 : -1;
  const contour = steps.map((_, i) => (i === 0 ? 0 : rng.weightedNumber({ [-2]: 1, [-1]: 3, 0: 1.5, 1: 3, 2: 1.2, 3: 0.4, [dir * 4]: 0.3 })));
  return { steps, lengths, contour };
}

/**
 * Plays the section theme's motif in an A A' A B phrase over four bars: the
 * repetition is what makes it a tune; strong beats snap to chord tones so it
 * always fits the harmony.
 */
export function generateLead(ctx: BarContext, mem: PartMemory): NoteEvent[] {
  const motif = ctx.section.theme.motif;
  const { low, high, density } = ctx.style.lead;
  const phraseBar = ctx.barInSection % 4;
  const half = phraseBar % 2; // which bar of the two-bar motif
  const phraseRng = new Rng(ctx.section.theme.id * 977 + phraseBar).fork('lead');
  const out: NoteEvent[] = [];
  const center = (low + high) / 2;
  let pitch = mem.lastPitch ?? center;
  const tones = chordTonesInRange(ctx.chord, low, high);
  const nearestTone = (p: number) => tones.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a), tones[0] ?? p);
  const keep = Math.min(1, density * (0.6 + 0.6 * ctx.macros.energy) + 0.15);
  const transpose = phraseBar === 2 ? phraseRng.pick([1, 2, -1]) : 0;

  motif.steps.forEach((s, i) => {
    if (s < half * 16 || s >= (half + 1) * 16) return;
    const step = s - half * 16;
    if (phraseBar === 3 && step > 8) return; // cadence bar breathes
    if (i > 0 && !phraseRng.chance(keep)) return;
    if (ctx.macros.variation > 0 && ctx.rng.chance(0.15 * ctx.macros.variation)) return;
    pitch = ctx.scale.step(pitch, (motif.contour[i] ?? 0) + (i === 0 ? transpose : 0));
    if (step % 4 === 0 && tones.length) pitch = nearestTone(pitch);
    pitch = foldInto(pitch, low, high);
    let len = (motif.lengths[i] ?? 2) / 4;
    if (phraseBar === 3 && step === 8) len = 2;
    out.push(noteAt(ctx, 'lead', pitch, 0.72 + 0.2 * (step % 4 === 0 ? 1 : 0), step, len * 0.92));
  });
  // land the phrase on a chord tone
  if (phraseBar === 3 && out.length === 0 && tones.length) {
    pitch = nearestTone(center);
    out.push(noteAt(ctx, 'lead', pitch, 0.8, 0, 3));
  }
  mem.lastPitch = foldInto(pitch, low, high);
  return out;
}

export function generateTexture(ctx: BarContext): NoteEvent[] {
  const sec = ctx.section;
  const out: NoteEvent[] = [];
  const root = foldInto(ctx.chord.root + 24, 48, 71);
  if (ctx.barInSection === 0) out.push(noteAt(ctx, 'texture', root, 0.6, 0, Math.min(sec.bars, 8) * 4 - 0.5));
  const risingInto = ctx.nextSection === 'drop' || ctx.nextSection === 'build';
  if (risingInto && ctx.barInSection === sec.bars - 2) out.push(noteAt(ctx, 'texture', root + 12, 0.8, 0, 7.5));
  return out;
}
