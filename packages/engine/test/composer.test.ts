import { describe, expect, it } from 'vitest';
import { Composer, type ComposerInputs } from '../src/compose/composer.js';
import { STYLES, getStyle } from '../src/compose/styles.js';
import { PART_IDS } from '../src/compose/parts.js';
import { Scale } from '../src/theory/scale.js';

function inputs(styleId = 'demoscene', energy = 0.7): ComposerInputs {
  return {
    style: () => getStyle(styleId),
    macros: () => ({ energy, complexity: 0.5, variation: 0.4, swing: 0, humanize: 0.2 }),
    partMode: () => 'auto',
    key: () => null,
    scale: () => null,
  };
}

function compose(seed: number, bars: number, styleId?: string) {
  const c = new Composer(seed, inputs(styleId));
  return Array.from({ length: bars }, (_, i) => c.composeBar(i));
}

describe('composer', () => {
  it('is deterministic: the same seed writes the same music', () => {
    expect(JSON.stringify(compose(11, 48))).toBe(JSON.stringify(compose(11, 48)));
  });

  it('different seeds write different music', () => {
    expect(JSON.stringify(compose(11, 16).map((b) => b.events))).not.toBe(JSON.stringify(compose(12, 16).map((b) => b.events)));
  });

  it.each(STYLES.map((s) => s.id))('style %s produces sections, harmony and notes inside each bar', (id) => {
    const bars = compose(3, 64, id);
    expect(bars[0]?.sectionStart).toBe(true);
    expect(new Set(bars.map((b) => b.section.index)).size).toBeGreaterThan(1);
    for (const b of bars) {
      for (const e of b.events) {
        expect(e.start).toBeGreaterThanOrEqual(b.bar * 4);
        expect(e.start).toBeLessThan(b.bar * 4 + 4);
        expect(e.duration).toBeGreaterThan(0);
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
      }
    }
    expect(bars.flatMap((b) => b.events).length).toBeGreaterThan(100);
  });

  it('pitched parts stay in the key', () => {
    const bars = compose(9, 32);
    for (const b of bars) {
      const scale = new Scale(b.scale.root, b.scale.name);
      for (const e of b.events) {
        if (e.part === 'pad' || e.part === 'chords' || e.part === 'arp' || e.part === 'lead') expect(scale.contains(e.pitch)).toBe(true);
      }
    }
  });

  it('part modes override the arrangement', () => {
    const base = inputs();
    const c = new Composer(5, { ...base, partMode: (p) => (p === 'lead' ? 'on' : p === 'kick' ? 'off' : 'auto') });
    const bars = Array.from({ length: 16 }, (_, i) => c.composeBar(i));
    const parts = new Set(bars.flatMap((b) => b.events.map((e) => e.part)));
    expect(parts.has('kick')).toBe(false);
    expect(parts.has('lead')).toBe(true);
  });

  it('every part gets used somewhere across styles', () => {
    const used = new Set<string>();
    for (const s of STYLES) for (const b of compose(21, 96, s.id)) for (const e of b.events) used.add(e.part);
    for (const p of PART_IDS) expect(used.has(p)).toBe(true);
  });
});
