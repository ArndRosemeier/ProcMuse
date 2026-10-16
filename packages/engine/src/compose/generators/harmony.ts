/** Chord, pad and arpeggio generators: everything that plays the current chord's tones. */
import { Rng } from '../../core/rng.js';
import { chordTonesInRange, voiceLead } from '../../theory/chord.js';
import { noteAt } from '../rhythm.js';
import type { ArpPattern, ChordPattern } from '../style.js';
import type { BarContext, NoteEvent, PartMemory } from '../types.js';

const STAB_TEMPLATES = [
  [0, 6, 10],
  [2, 6, 10, 14],
  [0, 3, 6, 10, 13],
  [0, 7, 10],
  [3, 6, 11, 14],
];

/** Comping rhythms (jazz, bossa, funk): drawn anew each bar, so the comping talks. */
const COMP_TEMPLATES = [
  [0, 6, 10],
  [2, 6, 11, 14],
  [0, 3, 8, 11],
  [3, 6, 10, 14],
  [0, 7, 12],
];

function voiceCount(ctx: BarContext): number {
  const [lo, hi] = ctx.style.chords.voices;
  return Math.round(lo + (hi - lo) * ctx.macros.complexity);
}

function barInChord(ctx: BarContext): number {
  return ctx.barInSection % ctx.section.theme.chordBars;
}

export function generateChords(ctx: BarContext, mem: PartMemory): NoteEvent[] {
  const { low, high } = ctx.style.chords;
  const voicing = voiceLead(ctx.chord, mem.voicing, voiceCount(ctx), low, high);
  mem.voicing = voicing;
  const pattern = ctx.section.choices.chords as ChordPattern;
  const out: NoteEvent[] = [];
  const hit = (step: number, dur: number, vel: number, strum = 0) =>
    voicing.forEach((p, i) => out.push(noteAt(ctx, 'chords', p, vel, step + i * strum, dur)));
  const hitAll = (steps: readonly number[], dur: number, vel: number, accented: number) => {
    for (const s of steps) hit(s, dur, s % 4 === 0 ? accented : vel);
  };
  switch (pattern) {
    case 'sustain':
      if (barInChord(ctx) === 0) hit(0, ctx.section.theme.chordBars * 4 - 0.1, 0.75);
      break;
    case 'stabs': {
      const tpl = STAB_TEMPLATES[new Rng(ctx.section.choices.drumSeed).fork('stabs').int(0, STAB_TEMPLATES.length - 1)] as number[];
      hitAll(tpl, 0.3, 0.72, 0.85);
      break;
    }
    case 'pulse': {
      const rate = ctx.macros.complexity > 0.65 ? 1 : 2;
      for (let s = 0; s < 16; s += rate) hit(s, rate * 0.2, s % 4 === 0 ? 0.8 : 0.62);
      break;
    }
    case 'offbeat':
      for (let s = 2; s < 16; s += 4) hit(s, 0.35, 0.75);
      break;
    case 'strum':
      hit(0, 2.6, 0.75, 0.12);
      if (ctx.macros.complexity > 0.4) hit(10, 1.4, 0.6, 0.1);
      break;
    case 'skank':
      // reggae: short chops on beats 2 and 4, doubled when the music is busy
      hitAll(ctx.macros.complexity > 0.55 ? [4, 6, 12, 14] : [4, 12], 0.22, 0.6, 0.78);
      break;
    case 'comp':
      hitAll(ctx.rng.fork('comp').pick(COMP_TEMPLATES) as number[], 0.6, 0.62, 0.74);
      break;
  }
  return out;
}

export function generatePad(ctx: BarContext, mem: PartMemory): NoteEvent[] {
  if (barInChord(ctx) !== 0) return [];
  const voices = ctx.macros.complexity > 0.5 ? 4 : 3;
  const voicing = voiceLead(ctx.chord, mem.voicing, voices, 57, 84);
  mem.voicing = voicing;
  const dur = ctx.section.theme.chordBars * 4 - 0.05;
  return voicing.map((p) => noteAt(ctx, 'pad', p, 0.7, 0, dur));
}

function arpSequence(pattern: ArpPattern, tones: number[], rng: Rng): number[] {
  const up = [...tones];
  const down = [...tones].reverse();
  switch (pattern) {
    case 'up':
      return up;
    case 'down':
      return down;
    case 'updown':
      return [...up, ...down.slice(1, -1)];
    case 'random':
      return Array.from({ length: Math.max(4, tones.length) }, () => rng.pick(tones));
    case 'pinky': {
      const top = up[up.length - 1] as number;
      return up.slice(0, -1).flatMap((t) => [t, top]);
    }
    case 'converge': {
      const seq: number[] = [];
      let i = 0;
      let j = up.length - 1;
      while (i <= j) {
        seq.push(up[i] as number);
        if (i !== j) seq.push(up[j] as number);
        i++;
        j--;
      }
      return seq;
    }
  }
}

export function generateArp(ctx: BarContext): NoteEvent[] {
  const octaves = Math.max(1, Math.round(ctx.style.arp.octaves * (0.6 + 0.6 * ctx.macros.complexity)));
  const tones = chordTonesInRange(ctx.chord, 60, 60 + 12 * octaves);
  if (tones.length === 0) return [];
  const pattern = ctx.section.choices.arp as ArpPattern;
  const seq = arpSequence(pattern, tones, ctx.rng.fork('arp-seq'));
  const perBeat = ctx.section.choices.arpRate;
  const stepSize = 4 / perBeat; // in 16ths
  const out: NoteEvent[] = [];
  const stepsInBar = 4 * perBeat;
  for (let i = 0; i < stepsInBar; i++) {
    // continue the sequence across bars so long patterns do not restart every bar
    const idx = (ctx.barInSection * stepsInBar + i) % seq.length;
    const step = i * stepSize;
    out.push(noteAt(ctx, 'arp', seq[idx] as number, i % perBeat === 0 ? 0.85 : 0.65, step, (stepSize / 4) * 0.7));
  }
  return out;
}
