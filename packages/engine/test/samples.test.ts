import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, NO_COLLECTION, castBand, collectionSampleSets, validateCollection } from '../src/compose/collection.js';
import { PART_IDS } from '../src/compose/parts.js';
import { ProcMuseError } from '../src/core/errors.js';
import { EngineCore } from '../src/engine/core.js';
import { P } from '../src/engine/paramSpecs.js';
import { Instrument } from '../src/instruments/instrument.js';
import { patchSampleSets, validatePatch, type Patch } from '../src/instruments/patch.js';
import { RECORDED_PATCHES, getPatch } from '../src/instruments/registry.js';
import { parseSampleIndex, sampleSetFromPcm } from '../src/instruments/sampleIndex.js';
import { SampleBank, pickZone, validateSampleSet, type SampleSet } from '../src/instruments/samples.js';
import { renderOffline } from '../src/render/offline.js';
import { midiToFreq } from '../src/theory/pitch.js';

const SR = 32000;
const ctx = { sampleRate: SR, cutoffOctaves: 0 };

/** A stand-in recording: a sine at each root, looped over whole periods. */
function sineSet(id: string, roots: number[], seconds = 0.5, looped = true): SampleSet {
  return {
    id,
    sampleRate: SR,
    zones: roots.map((root) => {
      const f = midiToFreq(root);
      const n = Math.round(seconds * SR);
      const data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / SR);
      const period = SR / f;
      const loopEnd = Math.round(Math.floor(n / period) * period);
      const loopStart = Math.round(Math.floor((n * 0.3) / period) * period);
      return looped ? { root, data, loopStart, loopEnd } : { root, data };
    }),
  };
}

const samplePatch = (set: string, extra: Partial<Patch> = {}): Patch =>
  validatePatch({
    id: `t-${set}`,
    name: set,
    category: 'strings',
    description: '',
    poly: 2,
    oscillators: [{ type: 'sample', set, level: 1 }],
    amp: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.05 },
    velocity: 0,
    level: 1,
    ...extra,
  });

const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Zero-crossing estimate of the frequency of a mono signal. */
function freqOf(x: Float32Array, from: number, to: number): number {
  let n = 0;
  for (let i = from + 1; i < to; i++) if ((x[i - 1] as number) < 0 && (x[i] as number) >= 0) n++;
  return (n * SR) / (to - from);
}

/** Every set the collections need, as stand-ins. */
function allStandIns(): SampleSet[] {
  const ids = new Set(RECORDED_PATCHES.flatMap(patchSampleSets));
  return [...ids].map((id) => sineSet(id, [36, 48, 60, 72, 84]));
}

describe('recorded instruments', () => {
  it('plays a zone at its own pitch, repitched for other notes, and loops past its end', () => {
    const bank = new SampleBank();
    bank.add(sineSet('s', [57]));
    const inst = new Instrument(samplePatch('s'), SR, 1, bank);
    const l = new Float32Array(SR * 2);
    const r = new Float32Array(SR * 2);
    inst.noteOn(57, 1);
    inst.render(l, r, 0, SR, ctx);
    expect(freqOf(l, 1000, 15000)).toBeCloseTo(midiToFreq(57), -1);
    // 1 s is twice the recording: the loop carries it, with no gap of silence
    let quietest = 1;
    for (let i = 16000; i < SR; i += 64) quietest = Math.min(quietest, peak(l.subarray(i, i + 128)));
    expect(quietest).toBeGreaterThan(0.2);
    inst.noteOff(57);
    inst.noteOn(69, 1); // an octave up
    inst.render(l, r, SR, 2 * SR, ctx);
    expect(freqOf(l, SR + 1000, SR + 15000)).toBeCloseTo(midiToFreq(69), -1);
  });

  it('a one-shot falls silent when its recording ends', () => {
    const bank = new SampleBank();
    bank.add(sineSet('o', [60], 0.2, false));
    const inst = new Instrument(samplePatch('o'), SR, 1, bank);
    const l = new Float32Array(SR);
    const r = new Float32Array(SR);
    inst.noteOn(60, 1);
    inst.render(l, r, 0, SR, ctx);
    expect(peak(l.subarray(0, 3000))).toBeGreaterThan(0.3);
    expect(peak(l.subarray(8000))).toBe(0);
  });

  it('picks the nearest zone of the loudest velocity layer the note reaches', () => {
    const set = sineSet('v', [48, 60, 72]);
    const loud = sineSet('v', [60]).zones.map((z) => ({ ...z, velocity: 0.7 }));
    const layered = { ...set, zones: [...set.zones, ...loud] };
    expect(pickZone(layered, 70, 0.5).root).toBe(72);
    expect(pickZone(layered, 70, 0.9)).toBe(loud[0]);
  });

  it('folds notes into a patch range by octaves', () => {
    const bank = new SampleBank();
    bank.add(sineSet('f', [60]));
    const inst = new Instrument(samplePatch('f', { range: [55, 79] }), SR, 1, bank);
    const l = new Float32Array(SR / 2);
    const r = new Float32Array(SR / 2);
    inst.noteOn(36, 1); // two octaves below the range: plays 60
    inst.render(l, r, 0, l.length, ctx);
    expect(freqOf(l, 1000, 15000)).toBeCloseTo(midiToFreq(60), -1);
  });

  it('is loud about missing or malformed recordings', () => {
    expect(() => new Instrument(samplePatch('nowhere'), SR, 1, new SampleBank())).toThrow(/not loaded/);
    expect(() => new Instrument(samplePatch('nowhere'), SR, 1, null)).toThrow(ProcMuseError);
    const good = sineSet('x', [60]);
    expect(() => validateSampleSet({ ...good, zones: [] })).toThrow(ProcMuseError);
    expect(() => validateSampleSet({ ...good, zones: [{ ...(good.zones[0] as SampleSet['zones'][0]), loopEnd: 1e9 }] })).toThrow(/loop/);
    expect(() => validateSampleSet({ ...good, sampleRate: 0 })).toThrow(ProcMuseError);
  });
});

describe('collections and casting', () => {
  const synth = (part: (typeof PART_IDS)[number]) => getPatch(`${part === 'hats' ? 'hat-closed' : part === 'kick' ? 'kick-4k' : part === 'snare' ? 'snare-classic' : part === 'perc' ? 'perc-tom' : part === 'bass' ? 'bass-4k' : part === 'pad' ? 'pad-4k' : part === 'chords' ? 'keys-epiano' : part === 'arp' ? 'arp-4k' : part === 'lead' ? 'lead-flute' : 'texture-drone'}`);
  const cast = (collection: string, real: number, seed = 1) => castBand({ seed, collection, real, synth });
  const realParts = (band: Record<string, string>) => PART_IDS.filter((p) => band[p]?.startsWith('real-'));

  it('keeps every part synthesized without a collection or at 0%', () => {
    expect(realParts(cast(NO_COLLECTION, 1))).toEqual([]);
    expect(realParts(cast('broad', 0))).toEqual([]);
  });

  it('at 100% casts every part the collection covers; rising amounts only add parts', () => {
    for (const c of COLLECTIONS) {
      expect(realParts(cast(c.id, 1))).toEqual(PART_IDS.filter((p) => c.parts[p]?.length));
      let prev: string[] = [];
      for (const amount of [0.2, 0.4, 0.6, 0.8, 1]) {
        const now = realParts(cast(c.id, amount));
        expect(now).toEqual(expect.arrayContaining(prev));
        prev = now;
      }
    }
  });

  it('prefers the recorded instrument closest to the style’s own (flute lead stays a lead)', () => {
    expect(['real-solo-violin', 'real-flute', 'real-oboe']).toContain(cast('broad', 1).lead);
    expect(cast('broad', 1, 99)).toEqual(cast('broad', 1, 99));
  });

  it('every built-in collection is valid; a broken one is refused loudly', () => {
    expect(COLLECTIONS.length).toBeGreaterThanOrEqual(6);
    expect(() => validateCollection({ id: 'x', name: 'X', description: 'x', parts: { lead: ['lead-saw'] } })).toThrow(/not a recorded/);
    expect(() => validateCollection({ id: 'x', name: 'X', description: 'x', parts: { lead: ['real-bass-drum'] } })).toThrow(/hit/);
  });

  it('the engine refuses a collection whose recordings are missing, and plays it once they are in', () => {
    const core = new EngineCore({ sampleRate: SR });
    expect(() => core.setParam(P.collection, 'strings')).toThrow(/not downloaded/);
    expect(core.params.string(P.collection)).toBe(NO_COLLECTION);
    for (const s of allStandIns()) core.addSamples(s);
    core.setParam(P.collection, 'strings');
    core.setParam(P.real, 1);
    const l = new Float32Array(SR * 4);
    core.process(l, new Float32Array(SR * 4));
    expect(l.every(Number.isFinite)).toBe(true);
    expect(peak(l)).toBeGreaterThan(0.01);
    // a style change resets the mix, not the collection
    core.setParam(P.style, 'lofi');
    expect(core.params.string(P.collection)).toBe('strings');
  });

  it('renders every collection at 100% without clipping', () => {
    const samples = allStandIns();
    for (const c of COLLECTIONS) {
      const res = renderOffline({ seconds: 6, sampleRate: SR, samples, params: { [P.collection]: c.id, [P.real]: 1, [P.energy]: 1 } });
      expect(res.left.every(Number.isFinite)).toBe(true);
      expect(peak(res.left)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the shipped sample files', () => {
  const dir = join(__dirname, '../../../apps/procmuse/public/samples');
  const index = parseSampleIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));

  it('hold exactly the sets the recorded instruments play, each file present at its listed size', () => {
    const played = new Set(RECORDED_PATCHES.flatMap(patchSampleSets));
    expect(Object.keys(index.sets).sort()).toEqual([...played].sort());
    for (const e of Object.values(index.sets)) {
      const path = join(dir, e.file);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBe(e.bytes);
    }
    for (const c of COLLECTIONS) for (const s of collectionSampleSets(c.id)) expect(index.sets[s]).toBeDefined();
  });

  it('slices decoded audio by the index, and refuses audio of the wrong length', () => {
    const [id, e] = Object.entries(index.sets)[0] as [string, (typeof index.sets)[string]];
    const set = sampleSetFromPcm(index, id, new Float32Array(e.frames).fill(0.1));
    expect(set.zones.length).toBe(e.zones.length);
    expect(() => sampleSetFromPcm(index, id, new Float32Array(e.frames - 1))).toThrow(/frames/);
  });
});
