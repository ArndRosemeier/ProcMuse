/** Human-readable chord suffixes (e.g. "m7", "sus4"), derived from the chord's actual intervals. */
import type { Chord } from '../theory/chord.js';
import type { Scale } from '../theory/scale.js';

export function CHORD_NAME(chord: Chord, _scale: Scale): string {
  const pcs = chord.pitchClasses;
  const root = pcs[0] as number;
  const iv = (i: number) => (((pcs[i] ?? root) - root + 12) % 12);
  const third = iv(1);
  const fifth = chord.type === 'power' ? 7 : iv(2);
  let base = '';
  if (chord.type === 'power') return '5';
  if (chord.type === 'sus2') return 'sus2';
  if (chord.type === 'sus4') return 'sus4';
  if (third === 3) base = fifth === 6 ? 'dim' : 'm';
  else if (third === 4) base = fifth === 8 ? 'aug' : '';
  if (chord.type === 'seventh' || chord.type === 'ninth') {
    const sev = iv(3);
    const ext = chord.type === 'ninth' ? '9' : '7';
    if (sev === 11) return base === 'm' ? `m(maj${ext})` : `maj${ext}`;
    if (base === 'dim') return `m${ext}b5`;
    return `${base}${ext}`;
  }
  if (chord.type === 'add9') return `${base}add9`;
  return base;
}
