#!/usr/bin/env node
// Builds the downloadable sample sets from a VSCO-2-CE checkout.
//
//   node scripts/samples/build.mjs --vsco <path to a VSCO-2-CE checkout> [--only id,id]
//
// For each source in sources.mjs: decode to mono at RATE, trim the silence in
// front, verify the pitch, find and crossfade a sustain loop (or fade a
// one-shot), level every zone, then write one FLAC per set and its zones into
// apps/procmuse/public/samples/index.json. Requires ffmpeg. Fails loudly on any
// surprise: a wrong checkout, a missing file, a pitch that disagrees with its name.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, VSCO } from './sources.mjs';

const RATE = 32000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../apps/procmuse/public/samples');
const TARGET_RMS = 0.1; // -20 dBFS over the body of each zone
const CROSSFADE = 0.12; // seconds of loop crossfade
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const args = process.argv.slice(2);
let vsco = '';
let only = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--vsco') vsco = args[++i];
  else if (args[i] === '--only') only = new Set(args[++i].split(','));
  else throw new Error(`unknown argument ${args[i]}`);
}
if (!vsco) throw new Error('--vsco <checkout> is required');
const head = execFileSync('git', ['-C', vsco, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== VSCO.commit) throw new Error(`VSCO checkout is at ${head}, sources.mjs pins ${VSCO.commit}`);

function decode(path) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

function noteNumber(name) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
}

const peakOf = (x, a = 0, b = x.length) => {
  let p = 0;
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};
const rmsOf = (x, a, b) => {
  let e = 0;
  for (let i = a; i < b; i++) e += x[i] * x[i];
  return Math.sqrt(e / Math.max(1, b - a));
};

/** Drops the silence in front of the first sound (keeping 3 ms of lead-in). */
function trimFront(x) {
  const thr = peakOf(x) * 0.003;
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < thr) i++;
  return x.subarray(Math.max(0, i - Math.round(0.003 * RATE)));
}

/** YIN fundamental estimate (Hz) over a window, or null if unpitched. */
function yin(x, start, size = 4096, fmin = 25, fmax = 2500) {
  const tauMax = Math.min(Math.floor(RATE / fmin), size - 1);
  const tauMin = Math.floor(RATE / fmax);
  if (start + size + tauMax > x.length) start = Math.max(0, x.length - size - tauMax);
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  let run = 0;
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < 0.15) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // no clear dip (a noisy pluck): accept the deepest one if it is still convincing
    let m = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[m]) m = t;
    if (cmnd[m] > 0.35) return null;
    tau = m;
  }
  const a = cmnd[tau - 1] ?? cmnd[tau];
  const b = cmnd[tau];
  const c = cmnd[tau + 1] ?? cmnd[tau];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return RATE / (tau + shift);
}

const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

/** Median pitch over several windows of the body: robust to the attack and to vibrato. */
function detectMidi(x, from) {
  const found = [];
  for (let k = 0; k < 6; k++) {
    const start = Math.round(from + k * 0.12 * RATE);
    if (start + 8192 > x.length) break;
    const hz = yin(x, start);
    if (hz) found.push(hzToMidi(hz));
  }
  if (found.length < 2) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

/** Finds a sustain loop and bakes a crossfade into it so the wrap is seamless. */
function makeLoop(x, rootMidi) {
  const period = RATE / (440 * 2 ** ((rootMidi - 69) / 12));
  const xf = Math.round(CROSSFADE * RATE);
  const end = Math.min(x.length - 1, Math.round(x.length * 0.92));
  const length = Math.round(Math.min(1.4 * RATE, (end - xf) * 0.55));
  if (length < 0.3 * RATE) throw new Error(`recording too short to loop (${(x.length / RATE).toFixed(2)} s)`);
  // pick the (start, end) pair whose neighbourhoods match best: normalized correlation,
  // ends tried over the last part of the body, starts within two periods of a loop length back
  const win = 1024;
  let best = -2;
  let start = end - length;
  let stop = end;
  const search = Math.max(4, Math.round(period * 2));
  const corrAt = (a0, b0) => {
    let num = 0;
    let ea = 0;
    let eb = 0;
    for (let i = -win; i < win; i += 2) {
      const a = x[a0 + i] ?? 0;
      const b = x[b0 + i] ?? 0;
      num += a * b;
      ea += a * a;
      eb += b * b;
    }
    return num / Math.sqrt(ea * eb || 1);
  };
  for (let e = end; e > end - 0.5 * RATE && e - length - search - xf > 0.25 * RATE; e -= Math.round(0.01 * RATE)) {
    for (const len of [length, Math.round(length * 0.8), Math.round(length * 1.2)]) {
      for (let s = e - len - search; s <= e - len + search; s++) {
        if (s - xf < 0.2 * RATE) continue;
        const corr = corrAt(e, s);
        if (corr > best) {
          best = corr;
          start = s;
          stop = e;
        }
      }
    }
  }
  return crossfadeLoop(x, start, stop, xf, best);
}

function crossfadeLoop(x, start, end, xf, best) {
  const out = x.slice(0, end);
  // equal-power crossfade: the tail before `end` turns into the audio before `start`
  for (let i = 0; i < xf; i++) {
    const t = (i + 0.5) / xf;
    const gOut = Math.cos((t * Math.PI) / 2);
    const gIn = Math.sin((t * Math.PI) / 2);
    out[end - xf + i] = x[end - xf + i] * gOut + x[start - xf + i] * gIn;
  }
  return { data: out, loopStart: start, loopEnd: end, match: best };
}

function makeOneShot(x, seconds) {
  const n = Math.min(x.length, Math.round(seconds * RATE));
  // end where it has died to -60 dB, if sooner
  const thr = peakOf(x) * 0.001;
  let last = n - 1;
  while (last > 0.05 * RATE && Math.abs(x[last]) < thr) last--;
  const len = Math.min(n, last + Math.round(0.02 * RATE));
  const out = x.slice(0, len);
  const fade = Math.min(Math.round(0.08 * RATE), len >> 2);
  for (let i = 0; i < fade; i++) out[len - fade + i] *= 1 - (i + 1) / fade;
  return out;
}

function encodeFlac(samples) {
  return execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'flac', '-sample_fmt', 's16', '-compression_level', '12', '-f', 'flac', '-'], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
    maxBuffer: 1 << 30,
  });
}

function buildSet(src) {
  const dir = join(vsco, src.dir);
  const files = readdirSync(dir).filter((f) => src.pick.test(f)).sort();
  if (!files.length) throw new Error(`${src.id}: no file in ${src.dir} matches ${src.pick}`);
  // 1. decode, trim, find each zone's root
  const raw = files.map((f) => {
    const x = trimFront(decode(join(dir, f)));
    const g = src.pick.exec(f).groups ?? {};
    let named = null;
    if (src.notes === 'name') named = noteNumber(g.note);
    else if (typeof src.notes === 'object') named = src.notes.base + src.notes.step * Number(g.idx);
    const pitched = typeof src.notes !== 'number';
    const detected = pitched ? detectMidi(x, Math.round((src.kind === 'sustain' ? 0.35 : 0.06) * RATE)) : null;
    return { file: f, x, named, detected };
  });
  let zones;
  if (typeof src.notes === 'number') {
    zones = raw.map((r) => ({ ...r, root: src.notes }));
  } else {
    if (raw[0].named !== null) {
      // named notes: most must be confirmed by ear (short, high plucks may not be measurable)
      const heard = raw.filter((r) => r.detected !== null);
      if (heard.length < Math.ceil(raw.length * 0.6)) throw new Error(`${src.id}: pitch found in only ${heard.length} of ${raw.length} files`);
      // the library's octave numbering differs between instruments: take the set's median offset
      const offs = heard.map((r) => Math.round((r.detected - r.named) / 12) * 12).sort((a, b) => a - b);
      const off = offs[Math.floor(offs.length / 2)];
      const tolerance = src.tolerance ?? 35;
      zones = raw.map((r) => {
        const root = r.named + off;
        if (r.detected === null) {
          console.log(`  ${src.id}: ${r.file} has no measurable pitch: trusting its name (${root})`);
          return { ...r, root };
        }
        const err = r.detected - root;
        // the recording must sound its name within a third of a semitone; a detector that locked onto
        // a harmonic (2nd..4th) or a subharmonic still proves the tuning
        const cents = Math.min(...[1, 2, 3, 4, 1 / 2, 1 / 3, 1 / 4].map((k) => Math.abs(err - 12 * Math.log2(k)))) * 100;
        // a file whose name is a semitone or two off but which sounds a clean note: the sound wins, said aloud
        const near = Math.round(r.detected);
        if (cents > tolerance && Math.abs(r.detected - near) < 0.25 && Math.abs(near - root) <= 2) {
          console.log(`  ${src.id}: ${r.file} is named ${root} but sounds ${r.detected.toFixed(2)}: using ${near}`);
          return { ...r, root: near };
        }
        if (cents > tolerance) throw new Error(`${src.id}: ${r.file} sounds ${r.detected.toFixed(2)}, named ${root} (${cents.toFixed(0)} cents)`);
        return { ...r, root };
      });
    } else {
      for (const r of raw) if (r.detected === null) throw new Error(`${src.id}: no pitch found in ${r.file}`);
      zones = raw.map((r) => ({ ...r, root: Math.round(r.detected) }));
    }
  }
  // 2. thin out to the wanted spacing, lowest first; drop duplicates of one root
  zones.sort((a, b) => a.root - b.root);
  const kept = [];
  for (const z of zones) if (!kept.length || z.root - kept[kept.length - 1].root >= (src.spacing ?? 12)) kept.push(z);
  // 3. shape and level each zone
  const shaped = kept.map((z) => {
    let data;
    let loop = null;
    let body;
    if (src.kind === 'sustain') {
      const cut = z.x.slice(0, Math.min(z.x.length, Math.round((src.seconds + 0.4) * RATE)));
      loop = makeLoop(cut, z.root);
      data = loop.data;
      body = [loop.loopStart, loop.loopEnd];
    } else {
      data = makeOneShot(z.x, src.seconds);
      body = [0, Math.min(data.length, Math.round(0.3 * RATE))];
    }
    const rms = rmsOf(data, body[0], body[1]);
    if (!(rms > 1e-5)) throw new Error(`${src.id}: ${z.file} is silent`);
    let gain = TARGET_RMS / rms;
    const peak = peakOf(data) * gain;
    if (peak > 0.95) gain *= 0.95 / peak;
    for (let i = 0; i < data.length; i++) data[i] *= gain;
    return { root: z.root, file: z.file, data, loop };
  });
  // 4. one file per set
  const total = shaped.reduce((n, z) => n + z.data.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  const zoneMeta = shaped.map((z) => {
    all.set(z.data, at);
    const meta = { root: z.root, start: at, length: z.data.length };
    if (z.loop) Object.assign(meta, { loopStart: z.loop.loopStart, loopEnd: z.loop.loopEnd });
    at += z.data.length;
    return meta;
  });
  const flac = encodeFlac(all);
  const hash = createHash('sha256').update(flac).digest('hex').slice(0, 10);
  const file = `${src.id}.${hash}.flac`;
  writeFileSync(join(OUT, file), flac);
  const worst = shaped.filter((z) => z.loop).reduce((m, z) => Math.min(m, z.loop.match), 1);
  console.log(
    `${src.id.padEnd(20)} ${String(shaped.length).padStart(2)} zones  ${shaped.map((z) => z.root).join(',')}  ${(total / RATE).toFixed(1)} s  ${(flac.length / 1e6).toFixed(2)} MB${src.kind === 'sustain' ? `  worst loop match ${worst.toFixed(3)}` : ''}`,
  );
  return { file, bytes: flac.length, frames: total, zones: zoneMeta };
}

mkdirSync(OUT, { recursive: true });
const indexPath = join(OUT, 'index.json');
const previous = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { sets: {} };
const sets = { ...previous.sets };
for (const src of SOURCES) {
  if (only && !only.has(src.id)) continue;
  if (sets[src.id]) rmSync(join(OUT, sets[src.id].file), { force: true });
  sets[src.id] = buildSet(src);
}
for (const id of Object.keys(sets)) if (!SOURCES.some((s) => s.id === id)) {
  rmSync(join(OUT, sets[id].file), { force: true });
  delete sets[id];
}
// files of earlier builds that no set points to any more
const referenced = new Set(Object.values(sets).map((s) => s.file));
for (const f of readdirSync(OUT)) if (f.endsWith('.flac') && !referenced.has(f)) rmSync(join(OUT, f));
const index = { version: 1, sampleRate: RATE, source: VSCO, sets };
writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
writeFileSync(
  join(OUT, 'CREDITS.txt'),
  `Recorded instruments: ${VSCO.name}\n${VSCO.url} (commit ${VSCO.commit})\nLicense: ${VSCO.license}\n${VSCO.credit}\nProcessed for ProcMuse by scripts/samples/build.mjs (mono, ${RATE} Hz, trimmed, looped, levelled).\n`,
);
const bytes = Object.values(sets).reduce((n, s) => n + s.bytes, 0);
console.log(`${Object.keys(sets).length} sets, ${(bytes / 1e6).toFixed(1)} MB → ${OUT}`);
