/**
 * THE source of randomness for the whole engine. Nothing else may call
 * Math.random (pinned by test/pins.test.ts): every random choice derives from the
 * session seed, so a seed plus a parameter history replays exactly.
 *
 * `fork(label)` derives an independent stream from this stream's SEED and the
 * label only, never from how much of this stream has been consumed. That keeps
 * choices stable: changing how many numbers the bass part draws in bar 12 does
 * not reshuffle the drums in bar 13.
 */

/** 32-bit FNV-1a hash, mixed with a seed. Deterministic across platforms. */
export function hash32(text: string, seed = 0x811c9dc5): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Symmetric jitter in [-amount, amount). */
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks a key of `weights` with probability proportional to its weight. */
  weighted<K extends string>(weights: Readonly<Partial<Record<K, number>>>): K {
    const keys = Object.keys(weights) as K[];
    let total = 0;
    for (const k of keys) total += Math.max(0, weights[k] ?? 0);
    if (total <= 0) throw new RangeError('Rng.weighted: no positive weight');
    let r = this.next() * total;
    for (const k of keys) {
      r -= Math.max(0, weights[k] ?? 0);
      if (r < 0) return k;
    }
    return keys[keys.length - 1] as K;
  }

  /** Like `weighted`, for numeric keys (e.g. scale degrees). */
  weightedNumber(weights: Readonly<Record<number, number>>): number {
    return Number(this.weighted(weights as Record<string, number>));
  }

  /** Independent child stream keyed by label (see file comment). */
  fork(label: string | number): Rng {
    return new Rng(hash32(String(label), this.seed));
  }
}
