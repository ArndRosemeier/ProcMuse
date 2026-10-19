#!/usr/bin/env node
// Renders music to a WAV file and prints loudness stats per second.
// Usage: npm run render -- [--style demoscene] [--seed 42] [--seconds 60] [--out renders/out.wav] [--set id=value ...]
// Requires a build (`npm run typecheck` emits packages/engine/dist). A collection
// (--set instruments.collection=strings) loads its recordings with the engine's own decoder.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderOffline, encodeWav } from '../dist/index.js';

const args = process.argv.slice(2);
const opt = { style: 'demoscene', seed: 4096, seconds: 60, out: '', set: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  if (a === '--style') opt.style = next();
  else if (a === '--seed') opt.seed = Number(next());
  else if (a === '--seconds') opt.seconds = Number(next());
  else if (a === '--out') opt.out = next();
  else if (a === '--set') opt.set.push(next());
  else throw new Error(`unknown argument ${a}`);
}
const params = { 'music.style': opt.style, 'music.seed': opt.seed };
for (const kv of opt.set) {
  const [k, v] = kv.split('=');
  params[k] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
const t0 = performance.now();
const collection = params['instruments.collection'];
const samples = typeof collection === 'string' && collection !== 'none' ? (await import('../../../scripts/samples/node-loader.mjs')).loadCollection(collection) : [];
const res = renderOffline({ seconds: opt.seconds, params, samples });
const ms = performance.now() - t0;
const sr = res.sampleRate;
let peak = 0;
let nan = 0;
const perSec = [];
for (let s = 0; s < opt.seconds; s++) {
  let sum = 0;
  for (let i = s * sr; i < (s + 1) * sr && i < res.left.length; i++) {
    const l = res.left[i];
    const r = res.right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) nan++;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l * l + r * r;
  }
  perSec.push(Math.sqrt(sum / (2 * sr)));
}
const counts = {};
for (const e of res.events) {
  if (e.type === 'note') counts[e.part] = (counts[e.part] ?? 0) + 1;
}
const sections = res.events.filter((e) => e.type === 'section').map((e) => `${e.kind}(${e.bars})`);
const chords = res.events.filter((e) => e.type === 'chord').slice(0, 12).map((e) => e.name);
console.log(`style=${opt.style} seed=${opt.seed} ${opt.seconds}s rendered in ${ms.toFixed(0)} ms (${((opt.seconds * 1000) / ms).toFixed(1)}x realtime)`);
console.log(`peak=${peak.toFixed(3)} nonFinite=${nan}`);
console.log(`rms/s: ${perSec.map((x) => x.toFixed(2)).join(' ')}`);
console.log(`notes: ${JSON.stringify(counts)}`);
console.log(`sections: ${sections.join(' → ')}`);
console.log(`chords: ${chords.join(' ')}`);
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true });
  writeFileSync(opt.out, encodeWav(res.left, res.right, sr));
  console.log(`wrote ${opt.out}`);
}
