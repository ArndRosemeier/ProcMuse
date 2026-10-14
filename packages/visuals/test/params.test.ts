import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ParamStore, validateParamValue } from '@procmuse/engine';
import { describe, expect, it } from 'vitest';
import { V, buildVisualParamSpecs, readSettings } from '../src/params.js';
import { SCENE_IDS } from '../src/scenes/registry.js';

describe('visual param specs', () => {
  const specs = buildVisualParamSpecs();

  it('are valid: unique ids, defaults validate, a ParamStore accepts them', () => {
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
    for (const s of specs) expect(validateParamValue(s, s.default)).toEqual(s.default);
    expect(() => new ParamStore(specs)).not.toThrow();
  });

  it('are plain serializable data', () => {
    expect(JSON.parse(JSON.stringify(specs))).toEqual(specs);
  });

  it('are prefixed, grouped, labelled and described in one sentence', () => {
    for (const s of specs) {
      expect(s.id.startsWith('visual.')).toBe(true);
      expect(s.group.startsWith('Visuals')).toBe(true);
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.description).toMatch(/^[A-Z].*\.$/);
      expect(s.description.replace(/\.$/, '')).not.toMatch(/\.\s/);
      if (s.kind === 'enum') for (const o of s.options) expect(o.label.length).toBeGreaterThan(0);
    }
  });

  it('declare exactly the ids in V, and the scene enum lists auto plus every scene', () => {
    expect(specs.map((s) => s.id).sort()).toEqual(Object.values(V).sort());
    const scene = specs.find((s) => s.id === V.scene);
    expect(scene?.kind === 'enum' && scene.options.map((o) => o.value)).toEqual(['auto', ...SCENE_IDS]);
  });

  it('flashes default OFF; reduce motion default follows the host preference', () => {
    const d = readSettings(new ParamStore(specs));
    expect(d.flashes).toBe(false);
    expect(d.reduceMotion).toBe(false);
    expect(readSettings(new ParamStore(buildVisualParamSpecs({ reduceMotionDefault: true }))).reduceMotion).toBe(true);
  });

  it('readSettings throws on a store without the visuals params', () => {
    expect(() => readSettings(new ParamStore([]))).toThrow(/unknown parameter visual\./);
  });

  it('pin: visual.* ids are spelled only in params.ts (everyone else uses V)', () => {
    const dir = join(__dirname, '../src');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const offenders = walk(dir)
      .filter((p) => p.endsWith('.ts') && !p.endsWith('params.ts'))
      .filter((p) => /['"`]visual\.[a-zA-Z]+['"`]/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
