/**
 * Presets and share links: a preset is the set of parameter values that differ
 * from the defaults, for the music engine and the visuals together.
 */
import { ProcMuseError, type ParamSource, type ParamValue } from '@procmuse/engine';
import type { KeyValueStore } from '@procmuse/ui';

export type Preset = Record<string, ParamValue>;

export interface PresetTarget {
  name: string;
  source: ParamSource;
}

export function capturePreset(targets: readonly PresetTarget[]): Preset {
  const out: Preset = {};
  for (const { source } of targets) {
    for (const spec of source.specs) {
      const v = source.get(spec.id);
      if (v !== spec.default) out[spec.id] = v;
    }
  }
  return out;
}

/** Applies a preset: every id must belong to a target, and values are validated by the target. */
export function applyPreset(targets: readonly PresetTarget[], preset: Preset): void {
  for (const id of Object.keys(preset)) {
    if (!targets.some((t) => t.source.specs.some((s) => s.id === id))) {
      throw new ProcMuseError('unknown-param', `preset contains unknown setting ${id}`);
    }
  }
  for (const { source } of targets) {
    // style first: it resets instruments and mix, which the preset may then override
    const ids = source.specs.map((s) => s.id).sort((a, b) => (a === 'music.style' ? -1 : b === 'music.style' ? 1 : 0));
    for (const id of ids) {
      const spec = source.specs.find((s) => s.id === id);
      if (!spec) continue;
      source.set(id, id in preset ? (preset[id] as ParamValue) : spec.default);
    }
  }
}

export function encodePreset(p: Preset): string {
  const json = JSON.stringify(p);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodePreset(text: string): Preset {
  try {
    const b64 = text.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    for (const v of Object.values(value)) {
      if (!['number', 'string', 'boolean'].includes(typeof v)) throw new Error('bad value');
    }
    return value as Preset;
  } catch (err) {
    throw new ProcMuseError('invalid-argument', `this share link is damaged (${(err as Error).message})`);
  }
}

/** Saved presets by name, in the browser. */
export class PresetLibrary {
  constructor(private readonly store: KeyValueStore) {}

  list(): Record<string, Preset> {
    const raw = this.store.get('presets');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Preset>;
    return parsed;
  }

  save(name: string, preset: Preset): void {
    const all = this.list();
    all[name] = preset;
    this.store.set('presets', JSON.stringify(all));
  }

  remove(name: string): void {
    const all = this.list();
    delete all[name];
    this.store.set('presets', JSON.stringify(all));
  }
}
