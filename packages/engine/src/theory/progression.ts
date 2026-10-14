/** Chord progressions as Markov chains over scale degrees. */
import type { Rng } from '../core/rng.js';

/** transitions[from][to] = weight. Degrees are 0..6 (0 = tonic). */
export type ProgressionTable = Readonly<Record<number, Readonly<Record<number, number>>>>;

/**
 * Generates `length` degrees, starting at `start`. When `cadence` is set, the
 * last chord is drawn only from degrees that lead home (V, IV, or VII), so the
 * loop resolves back to the start.
 */
export function generateProgression(rng: Rng, table: ProgressionTable, length: number, start = 0, cadence = true): number[] {
  const out = [start];
  for (let i = 1; i < length; i++) {
    const prev = out[i - 1] as number;
    const row = table[prev] ?? table[0];
    if (!row) throw new RangeError('progression table has no row for the tonic');
    let next = rng.weightedNumber(row);
    if (cadence && i === length - 1) {
      const options: Record<number, number> = {};
      for (const d of [4, 3, 6, 5, 1]) {
        if (d !== prev && (row[d] ?? 0) > 0) options[d] = row[d] as number;
      }
      if (Object.keys(options).length) next = rng.weightedNumber(options);
    }
    out.push(next);
  }
  return out;
}
