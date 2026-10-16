import { describe, expect, it } from 'vitest';
import { Composer, type ComposerInputs } from '../src/compose/composer.js';
import { STYLES, getStyle } from '../src/compose/styles.js';
import { BUILTIN_PATCHES } from '../src/instruments/registry.js';
import { PART_IDS } from '../src/compose/parts.js';
import { Scale } from '../src/theory/scale.js';

function inputs(styleId = 'demoscene', energy = 0.7, journey: number | null = null): ComposerInputs {
  return {
    style: () => getStyle(styleId),
    macros: () => ({ energy, complexity: 0.5, variation: 0.4, swing: 0, humanize: 0.2 }),
    partMode: () => 'auto',
    key: () => null,
    scale: () => null,
    journey: () => journey,
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

  it('moves on to a new style after each piece: an outro, then the new style from its own start', () => {
    const c = new Composer(8, inputs('demoscene', 0.7, 32));
    const bars = Array.from({ length: 400 }, (_, i) => c.composeBar(i));
    const moves = bars.filter((b) => b.styleChange);
    expect(moves.length).toBeGreaterThanOrEqual(4);
    const visited = ['demoscene'];
    for (const b of moves) {
      const prev = bars[b.bar - 1];
      expect(prev?.section.kind).toBe('outro');
      expect(b.sectionStart).toBe(true);
      expect(b.section.kind).toBe(getStyle(b.styleChange as string).form.start);
      expect(b.styleChange).not.toBe(visited[visited.length - 1]);
      expect(b.styleChange).not.toBe(visited[visited.length - 2]);
      visited.push(b.styleChange as string);
    }
    expect(new Set(visited).size).toBeGreaterThanOrEqual(4);
  });

  it('a new style brings its own tempo-free material: fresh themes, and it is deterministic', () => {
    const run = () => {
      const c = new Composer(8, inputs('demoscene', 0.7, 32));
      return Array.from({ length: 200 }, (_, i) => c.composeBar(i));
    };
    const a = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
    const move = a.find((b) => b.styleChange) as (typeof a)[number];
    const before = a.filter((b) => b.bar < move.bar).map((b) => b.section.theme.id);
    expect(before).not.toContain(move.section.theme.id);
  });

  it('stays in the chosen style when the journey is off', () => {
    const bars = compose(8, 400);
    expect(bars.some((b) => b.styleChange)).toBe(false);
  });
});

describe('style catalogue', () => {
  it('is wide: at least 18 styles with unique ids and names', () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(18);
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    expect(new Set(STYLES.map((s) => s.name)).size).toBe(STYLES.length);
  });

  it('every instrument in the panel is some style\'s default, so automatic variety reaches all of them', () => {
    const used = new Set(STYLES.flatMap((s) => PART_IDS.map((p) => s.parts[p].instrument)));
    expect(BUILTIN_PATCHES.map((p) => p.id).filter((id) => !used.has(id))).toEqual([]);
  });

  it('every two styles are clearly distinct: at least three parts play different instruments', () => {
    for (const a of STYLES) {
      for (const b of STYLES) {
        if (a.id >= b.id) continue;
        const differing = PART_IDS.filter((p) => a.parts[p].instrument !== b.parts[p].instrument).length;
        expect(differing, `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
