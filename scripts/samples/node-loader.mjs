// Loads the built sample sets in Node (ffmpeg decodes the FLAC files), for offline renders.
// The browser does the same through @procmuse/web's SampleLibrary.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionSampleSets, parseSampleIndex, sampleSetFromPcm } from '../../packages/engine/dist/index.js';

export const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../apps/procmuse/public/samples');

export function loadSampleSets(ids, dir = SAMPLES_DIR) {
  const index = parseSampleIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
  return ids.map((id) => {
    const entry = index.sets[id];
    if (!entry) throw new Error(`no sample set ${id} in ${dir}`);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, entry.file), '-f', 'f32le', '-ac', '1', '-'], { maxBuffer: 1 << 30 });
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
    return sampleSetFromPcm(index, id, pcm);
  });
}

export function loadCollection(id, dir = SAMPLES_DIR) {
  return loadSampleSets(collectionSampleSets(id), dir);
}
