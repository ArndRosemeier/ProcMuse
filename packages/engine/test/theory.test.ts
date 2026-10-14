import { describe, expect, it } from 'vitest';
import { Scale } from '../src/theory/scale.js';
import { buildChord, voiceLead } from '../src/theory/chord.js';
import { generateProgression } from '../src/theory/progression.js';
import { MINOR_POP } from '../src/compose/styles/base.js';
import { Rng } from '../src/core/rng.js';
import { midiToFreq, noteName } from '../src/theory/pitch.js';

describe('theory', () => {
  it('maps MIDI to frequency and names', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(noteName(60)).toBe('C4');
  });

  it('computes scale degrees across octaves', () => {
    const c = new Scale(0, 'major');
    expect(c.degree(0, 4)).toBe(60);
    expect(c.degree(7, 4)).toBe(72);
    expect(c.degree(-1, 4)).toBe(59);
    const a = new Scale(9, 'minor');
    expect(a.degree(2, 4)).toBe(72); // C5 is the third of A minor starting at A4=69
  });

  it('quantizes and steps within the scale', () => {
    const c = new Scale(0, 'major');
    expect(c.quantize(61)).toBe(60);
    expect(c.step(60, 1)).toBe(62);
    expect(c.step(60, -1)).toBe(59);
  });

  it('builds diatonic chords', () => {
    const c = new Scale(0, 'major');
    expect(buildChord(c, 0, 'triad').pitchClasses).toEqual([0, 4, 7]);
    expect(buildChord(c, 4, 'seventh').pitchClasses).toEqual([7, 11, 2, 5]);
  });

  it('voice leading moves little between chords', () => {
    const c = new Scale(0, 'major');
    const first = voiceLead(buildChord(c, 0, 'triad'), null, 3, 55, 79);
    const second = voiceLead(buildChord(c, 3, 'triad'), first, 3, 55, 79);
    const moved = second.reduce((acc, n, i) => acc + Math.abs(n - (first[i] as number)), 0);
    expect(moved).toBeLessThanOrEqual(5);
  });

  it('progressions start on the tonic and are reproducible', () => {
    const a = generateProgression(new Rng(5), MINOR_POP, 4);
    const b = generateProgression(new Rng(5), MINOR_POP, 4);
    expect(a).toEqual(b);
    expect(a[0]).toBe(0);
    expect(a).toHaveLength(4);
  });
});
