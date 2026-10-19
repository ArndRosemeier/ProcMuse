// Loads the built sample sets in Node, for offline renders. The engine's own
// decoder reads the files, exactly as @procmuse/web's SampleLibrary does in the browser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionSampleSets, parseSampleIndex, sampleSetFromFile } from '../../packages/engine/dist/index.js';

export const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../apps/procmuse/public/samples');

export function loadSampleSets(ids, dir = SAMPLES_DIR) {
  const index = parseSampleIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
  return ids.map((id) => {
    const entry = index.sets[id];
    if (!entry) throw new Error(`no sample set ${id} in ${dir}`);
    return sampleSetFromFile(index, id, readFileSync(join(dir, entry.file)));
  });
}

export function loadCollection(id, dir = SAMPLES_DIR) {
  return loadSampleSets(collectionSampleSets(id), dir);
}
