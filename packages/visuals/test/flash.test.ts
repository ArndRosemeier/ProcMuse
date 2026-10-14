import { describe, expect, it } from 'vitest';
import { FLASH_DEFAULTS, initialFlashState, stepFlash } from '../src/flash.js';

const DT = 1 / 60;

function run(requests: (frame: number) => number, frames: number) {
  let state = initialFlashState();
  const out: { t: number; level: number; accepted: boolean }[] = [];
  for (let i = 0; i < frames; i++) {
    const r = stepFlash(state, requests(i), DT);
    state = r.state;
    out.push({ t: state.clock, level: r.level, accepted: r.accepted });
  }
  return out;
}

describe('flash limiter', () => {
  it('accepts at most 3 flashes in any one-second window, even when asked every frame', () => {
    const out = run(() => 1, 600);
    const times = out.filter((o) => o.accepted).map((o) => o.t);
    expect(times.length).toBeGreaterThan(10);
    for (const t of times) expect(times.filter((u) => u >= t && u < t + 1).length).toBeLessThanOrEqual(3);
    for (let i = 1; i < times.length; i++) expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
  });

  it('caps the level and the rise per frame (no hard cut to white)', () => {
    const out = run((i) => (i % 7 === 0 ? 1 : 0), 600);
    let prev = 0;
    for (const o of out) {
      expect(o.level).toBeLessThanOrEqual(FLASH_DEFAULTS.maxLevel + 1e-12);
      expect(o.level - prev).toBeLessThanOrEqual(FLASH_DEFAULTS.maxRisePerSecond * DT + 1e-12);
      prev = o.level;
    }
    expect(Math.max(...out.map((o) => o.level))).toBeGreaterThan(0.3);
  });

  it('decays to zero without requests', () => {
    const out = run((i) => (i === 0 ? 1 : 0), 300);
    expect(out[out.length - 1]?.level).toBeLessThan(1e-3);
  });

  it('rejects non-finite input loudly', () => {
    expect(() => stepFlash(initialFlashState(), Number.NaN, DT)).toThrow(/finite/);
  });
});
