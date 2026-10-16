/** Bass generator: one algorithm with pattern families chosen per section. */
import { Rng } from '../../core/rng.js';
import { foldInto, noteAt } from '../rhythm.js';
import type { BassPattern } from '../style.js';
import type { BarContext, NoteEvent, PartMemory } from '../types.js';

const SYNC_TEMPLATES = [
  [0, 3, 6, 10, 12, 14],
  [0, 3, 7, 10, 14],
  [0, 2, 6, 8, 11, 14],
  [0, 6, 8, 11, 14],
];

export function generateBass(ctx: BarContext, mem: PartMemory): NoteEvent[] {
  const pattern = ctx.section.choices.bass as BassPattern;
  const { complexity } = ctx.macros;
  const oct = (ctx.style.bass.octave - 2) * 12;
  const root = foldInto(ctx.chord.root + oct, 28, 52);
  const fifth = root + 7;
  const octave = root + 12;
  const third = foldInto(root + (((ctx.chord.pitchClasses[1] ?? root) - root + 12) % 12), root, root + 11);
  const nextRoot = foldInto(ctx.nextChord.root + oct, 28, 52);
  const sectionRng = new Rng(ctx.section.choices.drumSeed).fork('bass');
  const out: NoteEvent[] = [];
  const add = (pitch: number, vel: number, step: number, dur: number) => out.push(noteAt(ctx, 'bass', pitch, vel, step, dur));
  const barInChord = ctx.barInSection % ctx.section.theme.chordBars;
  const lastBarOfChord = barInChord === ctx.section.theme.chordBars - 1;

  switch (pattern) {
    case 'pulse8':
      for (let s = 0; s < 16; s += 2) add(complexity > 0.55 && s % 4 === 2 ? octave : root, s % 4 === 0 ? 0.95 : 0.75, s, 0.42);
      break;
    case 'offbeat':
      for (let s = 2; s < 16; s += 4) add(root, 0.9, s, 0.4);
      if (complexity > 0.6) add(octave, 0.6, 15, 0.2);
      break;
    case 'root4':
      for (let s = 0; s < 16; s += 4) add(s === 8 && complexity > 0.4 ? fifth : root, 0.9, s, 0.9);
      break;
    case 'sync': {
      const tpl = SYNC_TEMPLATES[sectionRng.int(0, SYNC_TEMPLATES.length - 1)] as number[];
      tpl.forEach((s, i) => {
        const pick = i === 0 ? root : sectionRng.weighted({ root: 4, oct: 2 * complexity + 0.5, fifth: complexity + 0.3 });
        const pitch = typeof pick === 'number' ? pick : pick === 'oct' ? octave : pick === 'fifth' ? fifth : root;
        add(pitch, i === 0 ? 1 : 0.78, s, 0.45);
      });
      break;
    }
    case 'walk': {
      const tones = [root, third, fifth, octave];
      const approach = ctx.rng.chance(0.5) ? nextRoot - 1 : nextRoot + (ctx.rng.chance(0.5) ? 2 : -2);
      add(root, 0.95, 0, 0.9);
      add(ctx.rng.pick(tones.slice(1)), 0.8, 4, 0.9);
      add(ctx.scale.step(ctx.rng.pick(tones), ctx.rng.pick([-1, 1])), 0.8, 8, 0.9);
      add(lastBarOfChord ? approach : ctx.rng.pick(tones), 0.85, 12, 0.9);
      break;
    }
    case 'long':
      if (barInChord === 0) add(root, 0.85, 0, ctx.section.theme.chordBars * 4 - 0.25);
      if (complexity > 0.5 && barInChord === 0) add(fifth, 0.6, 8, 1.5);
      break;
    case 'arp': {
      const seq = [root, fifth, octave, fifth];
      for (let s = 0; s < 16; s++) add(seq[s % 4] as number, s % 4 === 0 ? 0.9 : 0.65, s, 0.2);
      break;
    }
    case 'gallop':
      for (let b = 0; b < 4; b++) {
        add(root, 0.95, b * 4, 0.2);
        add(b % 2 ? octave : root, 0.7, b * 4 + 2, 0.15);
        add(root, 0.7, b * 4 + 3, 0.15);
      }
      break;
    case 'octave':
      // disco: eighths jumping between the root and its octave
      for (let s = 0; s < 16; s += 2) add(s % 4 === 0 ? root : octave, s % 4 === 0 ? 0.95 : 0.8, s, 0.35);
      break;
    case 'riddim':
      // reggae: a heavy root, a rest on beat 2, then a phrase that answers it
      add(root, 1, 0, 1.4);
      add(complexity > 0.5 ? third : fifth, 0.75, 7, 0.4);
      add(fifth, 0.85, 8, 0.9);
      add(lastBarOfChord ? ctx.scale.quantize(nextRoot + (nextRoot > root ? -1 : 1)) : octave, 0.7, 12, 0.6);
      if (complexity > 0.6) add(fifth, 0.6, 14, 0.4);
      break;
  }

  // approach note into the next chord
  if (lastBarOfChord && nextRoot !== root && complexity > 0.45 && pattern !== 'walk' && pattern !== 'long' && pattern !== 'riddim' && ctx.rng.chance(complexity)) {
    const filtered = out.filter((e) => e.start < ctx.startBeat + 3.5);
    out.length = 0;
    out.push(...filtered);
    add(ctx.scale.quantize(nextRoot + (nextRoot > root ? -1 : 1)), 0.75, 14, 0.4);
  }
  mem.lastPitch = out.length ? (out[out.length - 1] as NoteEvent).pitch : mem.lastPitch;
  return out;
}
