/**
 * Instrument collections and the casting: which instrument plays each part.
 *
 * A collection names, per part, the recorded instruments that may take it
 * over. The "real instruments" amount decides how many of the collection's
 * parts do; the rest keep the style's synthesized instrument. Casting is
 * deterministic: the same seed, style, collection and amount always give the
 * same band.
 */
import { ProcMuseError } from '../core/errors.js';
import { hash32 } from '../core/rng.js';
import { patchSampleSets, type Patch } from '../instruments/patch.js';
import { getPatch, RECORDED_PATCHES } from '../instruments/registry.js';
import { BUILTIN_COLLECTIONS } from './collections/builtin.js';
import { PART_IDS, PART_INFO, type PartId } from './parts.js';

export interface Collection {
  id: string;
  name: string;
  description: string;
  /** per part: the recorded patches that suit it */
  parts: Partial<Record<PartId, string[]>>;
}

/** The collection id meaning "synthesized instruments only". */
export const NO_COLLECTION = 'none';

function bad(c: { id?: unknown }, msg: string): never {
  throw new ProcMuseError('invalid-collection', `collection ${String(c.id)}: ${msg}`);
}

export function validateCollection(c: Collection): Collection {
  if (!c || typeof c.id !== 'string' || !c.id || c.id === NO_COLLECTION) bad(c ?? {}, 'missing or reserved id');
  if (!c.name || !c.description) bad(c, 'needs a name and a description');
  const parts = Object.entries(c.parts ?? {});
  if (!parts.length) bad(c, 'casts no part');
  for (const [part, ids] of parts) {
    if (!PART_IDS.includes(part as PartId)) bad(c, `unknown part ${part}`);
    if (!Array.isArray(ids) || !ids.length) bad(c, `part ${part} lists no instrument`);
    for (const id of ids) {
      if (!RECORDED_PATCHES.some((p) => p.id === id)) bad(c, `part ${part}: ${id} is not a recorded instrument`);
      const cats = PART_INFO[part as PartId].categories;
      const patch = getPatch(id);
      // drums and texture take any recording made for them; pitched parts take pitched instruments
      if (patch.fixedNote !== undefined && !cats.includes(patch.category)) bad(c, `part ${part}: ${id} is a ${patch.category} hit`);
    }
  }
  return c;
}

export const COLLECTIONS: readonly Collection[] = BUILTIN_COLLECTIONS.map(validateCollection);

export function getCollection(id: string): Collection {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new ProcMuseError('invalid-collection', `unknown collection ${id}`);
  return c;
}

/** Every sample set a collection plays: what a host must load before choosing it. */
export function collectionSampleSets(id: string): string[] {
  if (id === NO_COLLECTION) return [];
  const sets = new Set<string>();
  for (const ids of Object.values(getCollection(id).parts)) for (const p of ids ?? []) for (const s of patchSampleSets(getPatch(p))) sets.add(s);
  return [...sets].sort();
}

/** Throws (loudly, naming what is missing) unless every set the collection needs is available. */
export function requireCollectionSamples(id: string, has: (set: string) => boolean): void {
  const missing = collectionSampleSets(id).filter((s) => !has(s));
  if (missing.length) {
    throw new ProcMuseError('missing-samples', `the ${getCollection(id).name} collection is not downloaded yet (missing ${missing.join(', ')})`);
  }
}

export interface CastingInputs {
  seed: number;
  /** collection id, or NO_COLLECTION */
  collection: string;
  /** 0..1: share of the collection's parts played by recorded instruments */
  real: number;
  /** the synthesized patch each part would play */
  synth: (part: PartId) => Patch;
}

/** How alike two patches are for a part: same family first, then same articulation (held vs struck). */
function likeness(a: Patch, b: Patch): number {
  return (a.category === b.category ? 2 : 0) + 1 - Math.abs(a.amp.sustain - b.amp.sustain);
}

/** The patch id each part plays. */
export function castBand(inputs: CastingInputs): Record<PartId, string> {
  const out = {} as Record<PartId, string>;
  for (const part of PART_IDS) out[part] = inputs.synth(part).id;
  if (inputs.collection === NO_COLLECTION || inputs.real <= 0) return out;
  const c = getCollection(inputs.collection);
  // a stable, seed-dependent order decides which parts turn real first as the amount rises
  const eligible = PART_IDS.filter((p) => c.parts[p]?.length).sort(
    (a, b) => hash32(`real:${a}`, inputs.seed) - hash32(`real:${b}`, inputs.seed),
  );
  const count = Math.round(Math.min(1, inputs.real) * eligible.length);
  for (const part of eligible.slice(0, count)) {
    const synth = inputs.synth(part);
    const options = (c.parts[part] as string[]).map((id) => ({ id, score: likeness(getPatch(id), synth) }));
    const top = Math.max(...options.map((o) => o.score));
    const best = options.filter((o) => o.score >= top - 0.25);
    out[part] = (best[hash32(`cast:${part}:${synth.id}`, inputs.seed) % best.length] as { id: string }).id;
  }
  return out;
}
