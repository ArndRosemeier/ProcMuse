/** Drum generator: one algorithm for every drum part, driven by the style's probability grids. */
import { Rng } from '../../core/rng.js';
import type { PartId } from '../parts.js';
import { accent, foldInto, noteAt } from '../rhythm.js';
import type { Grid } from '../style.js';
import type { BarContext, NoteEvent } from '../types.js';

export type DrumPart = Extract<PartId, 'kick' | 'snare' | 'hats' | 'perc'>;

export function generateDrums(ctx: BarContext, part: DrumPart): NoteEvent[] {
  const grid: Grid = ctx.style.drums[part];
  const { energy, complexity, variation } = ctx.macros;
  const sec = ctx.section;
  // The pattern is drawn once per section so the groove repeats; variation adds small per-bar changes.
  const patternRng = new Rng(sec.choices.drumSeed).fork(part);
  const barRng = ctx.rng.fork(part);
  const lastBar = ctx.barInSection === sec.bars - 1;
  const progress = sec.bars > 1 ? ctx.barInSection / (sec.bars - 1) : 1;
  const density = (0.35 + 0.65 * sec.energy) * (0.55 + 0.9 * complexity) * (0.7 + 0.6 * energy);
  const out: NoteEvent[] = [];
  const pitch = part === 'perc' ? foldInto(ctx.chord.root + 12 * 2, 55, 79) : 60;

  for (let step = 0; step < 16; step++) {
    const p = grid[step] as number;
    const draw = patternRng.next();
    let hit = p >= 1 || draw < p * density;
    if (p > 0 && p < 1 && barRng.chance(0.12 * variation)) hit = !hit;
    if (!hit) continue;
    let vel = accent(step) * (part === 'hats' ? 0.75 + 0.25 * patternRng.next() : 1);
    if (part === 'kick' && step !== 0) vel *= 0.9;
    const dur = part === 'hats' ? 0.12 : 0.25;
    const pp = part === 'perc' ? foldInto(pitch + [0, 7, 12, 5][step % 4]!, 55, 84) : pitch;
    out.push(noteAt(ctx, part, pp, vel, step, dur));
  }

  // Builds: snare rolls that tighten toward the drop.
  if (sec.kind === 'build' && part === 'snare') {
    const rate = progress > 0.75 ? 1 : progress > 0.4 ? 2 : 4;
    for (let step = 0; step < 16; step += rate) out.push(noteAt(ctx, part, pitch, 0.45 + 0.5 * (step / 16) * progress, step, 0.1));
  }

  // Fills on the last bar of a section.
  if (lastBar && (part === 'snare' || part === 'perc') && barRng.chance(0.3 + 0.6 * complexity) && sec.kind !== 'build') {
    const from = complexity > 0.6 ? 8 : 12;
    for (let step = from; step < 16; step++) {
      if (step % 2 === 1 && complexity < 0.4) continue;
      out.push(noteAt(ctx, part, part === 'perc' ? foldInto(pitch + 12 - (step - from), 55, 84) : pitch, 0.5 + 0.5 * ((step - from) / (16 - from)), step, 0.1));
    }
  }
  return out;
}
