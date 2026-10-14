/**
 * Architecture pins: each test goes red when a second implementation of a
 * centralized idea appears, or a layer boundary is crossed. See
 * docs/ARCHITECTURE.md for the seam each one protects.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function files(dir: string, ext = /\.ts$/): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
const src = (pkg: string) => files(join(ROOT, 'packages', pkg, 'src'));
const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const grep = (paths: string[], re: RegExp) => paths.filter((p) => re.test(strip(readFileSync(p, 'utf8')))).map(rel);

describe('pins', () => {
  it('randomness: only core/rng.ts may own a PRNG; Math.random is banned in the engine', () => {
    expect(grep(src('engine'), /Math\.random\s*\(/)).toEqual([]);
  });

  it('one voice architecture: the only synth voice class is instruments/voice.ts', () => {
    expect(grep(src('engine'), /class\s+\w*(Voice|Synth)\b/)).toEqual(['packages/engine/src/instruments/voice.ts']);
  });

  it('instruments are data: patch files declare no classes or functions (helpers.ts excepted)', () => {
    const patchFiles = files(join(ROOT, 'packages/engine/src/instruments/patches')).filter((p) => !p.endsWith('helpers.ts'));
    expect(patchFiles.length).toBeGreaterThan(0);
    expect(grep(patchFiles, /\bclass\s|\bfunction\s|=>/)).toEqual([]);
  });

  it('styles are data: style files declare no classes, and generators never branch on a style id', () => {
    expect(grep(files(join(ROOT, 'packages/engine/src/compose/styles')), /\bclass\s/)).toEqual([]);
    expect(grep(files(join(ROOT, 'packages/engine/src/compose/generators')), /style\.id\b|'(demoscene|synthwave|techno|house|lofi|ambient|trance)'/)).toEqual([]);
  });

  it('swing and humanize are applied in exactly one place (compose/rhythm.ts)', () => {
    expect(grep(src('engine'), /macros\.(swing|humanize)/)).toEqual(['packages/engine/src/compose/rhythm.ts']);
  });

  it('saturation curves live only in dsp/shape.ts', () => {
    expect(grep(src('engine'), /Math\.tanh\s*\(/)).toEqual([]);
  });

  it('the engine is headless: no DOM, Web Audio or timers', () => {
    expect(grep(src('engine'), /\b(window|document|AudioContext|AudioWorkletNode|setTimeout|setInterval|requestAnimationFrame)\b/)).toEqual([]);
  });

  it('param ids are spelled only in engine/paramSpecs.ts (everyone else uses P)', () => {
    const offenders = grep(src('engine'), /['"`](music|sound|fx|master)\.[a-zA-Z]+['"`]/).filter((p) => !p.endsWith('engine/paramSpecs.ts'));
    expect(offenders).toEqual([]);
  });
});
