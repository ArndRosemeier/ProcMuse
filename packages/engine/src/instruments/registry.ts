/** The patch library: every built-in instrument, validated once at load. */
import { ProcMuseError } from '../core/errors.js';
import { validatePatch, type Patch, type PatchCategory } from './patch.js';
import { BASS_PATCHES } from './patches/bass.js';
import { DRUM_PATCHES } from './patches/drums.js';
import { HARMONIC_PATCHES } from './patches/harmonic.js';
import { MELODIC_PATCHES } from './patches/melodic.js';
import { TEXTURE_PATCHES } from './patches/texture.js';

export const BUILTIN_PATCHES: readonly Patch[] = [
  ...DRUM_PATCHES,
  ...BASS_PATCHES,
  ...HARMONIC_PATCHES,
  ...MELODIC_PATCHES,
  ...TEXTURE_PATCHES,
].map(validatePatch);

const BY_ID = new Map<string, Patch>();
for (const p of BUILTIN_PATCHES) {
  if (BY_ID.has(p.id)) throw new ProcMuseError('invalid-patch', `duplicate patch id ${p.id}`);
  BY_ID.set(p.id, p);
}

export function getPatch(id: string): Patch {
  const p = BY_ID.get(id);
  if (!p) throw new ProcMuseError('invalid-patch', `unknown patch ${id}`);
  return p;
}

export function patchesIn(categories: readonly PatchCategory[]): Patch[] {
  return BUILTIN_PATCHES.filter((p) => categories.includes(p.category));
}
