import { describe, expect, it } from 'vitest';
import { initialDirector, resolveScene, stepDirector } from '../src/director.js';
import { SCENE_IDS } from '../src/scenes/registry.js';
import { AUTO_MIN_SCALE, initialAutoQuality, resolutionScale, stepAutoQuality } from '../src/quality.js';

describe('scene director', () => {
  it('auto: tunnel first and on drops, other sections rotate through the rest', () => {
    expect(resolveScene('auto', { kind: 'intro', index: 0 })).toBe('tunnel');
    expect(resolveScene('auto', { kind: 'drop', index: 5 })).toBe('tunnel');
    const others = new Set([1, 2, 3, 4].map((index) => resolveScene('auto', { kind: 'groove', index })));
    expect(others.size).toBe(SCENE_IDS.length - 1);
    expect(resolveScene('grid', { kind: 'drop', index: 5 })).toBe('grid');
  });

  it('crossfades over the fade time and never cuts mid-fade', () => {
    let d = initialDirector('tunnel');
    d = stepDirector(d, 'grid', 0.1, 1);
    expect(d).toEqual({ from: 'tunnel', to: 'grid', fade: 0 });
    d = stepDirector(d, 'nebula', 0.5, 1); // request mid-fade waits
    expect(d.to).toBe('grid');
    expect(d.fade).toBeCloseTo(0.5);
    d = stepDirector(d, 'nebula', 0.6, 1);
    expect(d).toEqual({ from: 'grid', to: null, fade: 0 });
    d = stepDirector(d, 'nebula', 0.1, 1);
    expect(d.to).toBe('nebula');
  });
});

describe('auto quality', () => {
  it('lowers resolution on slow frames, raises it on fast ones, ignores huge gaps', () => {
    let q = initialAutoQuality();
    for (let i = 0; i < 300; i++) q = stepAutoQuality(q, 1 / 25);
    expect(q.scale).toBe(AUTO_MIN_SCALE);
    for (let i = 0; i < 2000; i++) q = stepAutoQuality(q, 1 / 60);
    expect(q.scale).toBe(1);
    expect(stepAutoQuality(q, 5)).toBe(q);
    expect(resolutionScale('low', q)).toBe(0.4);
    expect(resolutionScale('auto', q)).toBe(1);
  });
});
