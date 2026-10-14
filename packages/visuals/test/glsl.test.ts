import { describe, expect, it } from 'vitest';
import { COMPOSITE_BODY, COMPOSITE_SOURCE } from '../src/glsl/composite.js';
import { PRELUDE, SCENE_MAIN, VERTEX_SOURCE } from '../src/glsl/prelude.js';
import { SCENES, sceneSource } from '../src/scenes/registry.js';
import { UNIFORM_TYPES } from '../src/uniforms.js';

const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const TYPES = 'void|float|int|bool|vec[234]|ivec[234]|mat[234]';
const FN_DEF = new RegExp(`^\\s*(?:${TYPES})\\s+(\\w+)\\s*\\([^;{)]*\\)\\s*\\{`, 'gm');
const definedFunctions = (src: string) => [...stripComments(src).matchAll(FN_DEF)].map((m) => m[1] as string);

/** Every GLSL source that is authored separately. */
const SOURCES: Record<string, string> = {
  prelude: PRELUDE,
  sceneMain: SCENE_MAIN,
  composite: COMPOSITE_BODY,
  ...Object.fromEntries(SCENES.map((s) => [`scene ${s.id}`, s.body])),
};

describe('GLSL sources', () => {
  it('there are at least four scenes, the 4k tunnel among them', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(4);
    expect(SCENES.map((s) => s.id)).toContain('tunnel');
  });

  it.each(SCENES.map((s) => [s.id, s] as const))('scene %s: prelude exactly once, version first, entry point defined', (_id, scene) => {
    const src = sceneSource(scene);
    expect(src.startsWith('#version 300 es\n')).toBe(true);
    expect(count(src, PRELUDE)).toBe(1);
    expect(count(src, '#version')).toBe(1);
    expect(count(src, '@procmuse/visuals prelude')).toBe(1);
    expect(definedFunctions(scene.body)).toContain('sceneColor');
    expect(count(src, 'void main()')).toBe(1);
  });

  it('the composite program uses the same prelude exactly once', () => {
    expect(count(COMPOSITE_SOURCE, PRELUDE)).toBe(1);
    expect(COMPOSITE_SOURCE.startsWith('#version 300 es\n')).toBe(true);
  });

  it('pin: no function is defined in more than one GLSL source (helpers live in the prelude)', () => {
    const owners = new Map<string, string[]>();
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const fn of definedFunctions(src)) {
        if (fn === 'main' || fn === 'sceneColor') continue; // entry points: one per program by design
        owners.set(fn, [...(owners.get(fn) ?? []), name]);
      }
    }
    const dupes = [...owners].filter(([, o]) => o.length > 1);
    expect(dupes).toEqual([]);
    expect(definedFunctions(PRELUDE)).toEqual(expect.arrayContaining(['rot', 'palette', 'hash12', 'noise3', 'fbm3', 'grain', 'tonemap']));
  });

  it('scene helpers are prefixed with their scene id', () => {
    for (const s of SCENES) {
      for (const fn of definedFunctions(s.body)) if (fn !== 'sceneColor') expect(fn.startsWith(s.id)).toBe(true);
    }
  });

  it('every u* identifier used is declared in the uniform table, declared once', () => {
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const m of stripComments(src).matchAll(/\bu[A-Z]\w*/g)) {
        expect(Object.keys(UNIFORM_TYPES), `${name} uses ${m[0]}`).toContain(m[0]);
      }
    }
    for (const u of Object.keys(UNIFORM_TYPES)) expect(count(PRELUDE, ` ${u};`)).toBe(1);
  });

  it('is GLSL ES 3.00, not 1.00 leftovers, and braces/parentheses balance', () => {
    for (const [name, src] of Object.entries({ ...SOURCES, vertex: VERTEX_SOURCE })) {
      const code = stripComments(src);
      expect(code, name).not.toMatch(/\bgl_FragColor\b|\btexture2D\b|\battribute\b|\bvarying\b/);
      expect(count(code, '{'), `${name} braces`).toBe(count(code, '}'));
      expect(count(code, '('), `${name} parens`).toBe(count(code, ')'));
    }
  });

  it('loops are bounded by constants (dynamic counts only via break)', () => {
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const m of stripComments(src).matchAll(/for\s*\(\s*int\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(\w+)\s*;/g)) {
        expect(m[1], name).toMatch(/^(\d+|MAX_LOOP)$/);
      }
    }
  });

  it('float literals: no bare integer passed where GLSL ES needs a float in common helpers', () => {
    // cheap guard against the most common compile error: vecN(1, 0) style ints are legal, but `float x = 1;` is not
    for (const [name, src] of Object.entries(SOURCES)) {
      expect(stripComments(src), name).not.toMatch(/\bfloat\s+\w+\s*=\s*-?\d+\s*;/);
    }
  });
});
