/**
 * SampleLibrary: downloads, keeps and decodes the recorded instruments.
 *
 * The files live next to the app (built by scripts/samples/build.mjs): an
 * index.json and one mono FLAC per sample set, named by content hash. A
 * collection is downloaded once and kept in the browser's Cache Storage, so the
 * next visit loads it from disk. Every failure (network, a damaged file, a
 * decode that does not match the index) is a loud ProcMuseError.
 */
import {
  ProcMuseError,
  collectionSampleSets,
  parseSampleIndex,
  sampleSetFromPcm,
  type SampleIndex,
  type SampleSet,
} from '@procmuse/engine';

export interface SampleProgress {
  /** bytes received so far, over the whole collection */
  loaded: number;
  total: number;
}

const CACHE = 'procmuse-samples-v1';

export class SampleLibrary {
  private readonly base: URL;
  private indexPromise: Promise<SampleIndex> | null = null;

  /** `baseUrl`: the folder holding index.json, e.g. `new URL('samples/', document.baseURI)`. */
  constructor(baseUrl: string | URL) {
    this.base = new URL(baseUrl);
  }

  index(): Promise<SampleIndex> {
    this.indexPromise ??= (async () => {
      const res = await fetch(new URL('index.json', this.base), { cache: 'no-cache' });
      if (!res.ok) throw new ProcMuseError('missing-samples', `the instrument list could not be loaded (HTTP ${res.status})`);
      return parseSampleIndex(await res.json());
    })();
    // a failed attempt may be retried
    this.indexPromise.catch(() => (this.indexPromise = null));
    return this.indexPromise;
  }

  /** Download size of a collection in bytes. */
  async bytes(collection: string): Promise<number> {
    const index = await this.index();
    return collectionSampleSets(collection).reduce((n, id) => n + this.entry(index, id).bytes, 0);
  }

  /** True when every file of the collection is already kept in this browser. */
  async downloaded(collection: string): Promise<boolean> {
    const cache = await openCache();
    if (!cache) return false;
    const index = await this.index();
    for (const id of collectionSampleSets(collection)) {
      if (!(await cache.match(this.url(index, id)))) return false;
    }
    return true;
  }

  /** Downloads (or reads back) and decodes every set of a collection. */
  async load(collection: string, onProgress?: (p: SampleProgress) => void): Promise<SampleSet[]> {
    const index = await this.index();
    const ids = collectionSampleSets(collection);
    const total = ids.reduce((n, id) => n + this.entry(index, id).bytes, 0);
    const got = new Map<string, number>();
    const report = () => onProgress?.({ loaded: [...got.values()].reduce((a, b) => a + b, 0), total });
    const cache = await openCache();
    // a few files at a time: steady progress without opening dozens of connections
    const files = await mapLimit(ids, 4, async (id) => {
      const bytes = await this.fetchFile(index, id, cache, (n) => {
        got.set(id, n);
        report();
      });
      return { id, bytes };
    });
    report();
    // decode at the files' own rate: no resampling, so loop points stay exact
    const ctx = new OfflineAudioContext(1, 1, index.sampleRate);
    const sets: SampleSet[] = [];
    for (const { id, bytes } of files) {
      let audio: AudioBuffer;
      try {
        audio = await ctx.decodeAudioData(bytes);
      } catch (err) {
        throw new ProcMuseError('invalid-samples', `the recording ${id} could not be decoded (${(err as Error).message})`);
      }
      if (audio.sampleRate !== index.sampleRate) {
        throw new ProcMuseError('invalid-samples', `${id} decoded at ${audio.sampleRate} Hz, expected ${index.sampleRate}`);
      }
      // a copy the library owns, so it can be handed (transferred) to the audio thread
      sets.push(sampleSetFromPcm(index, id, audio.getChannelData(0).slice()));
    }
    return sets;
  }

  private entry(index: SampleIndex, id: string) {
    const e = index.sets[id];
    if (!e) throw new ProcMuseError('missing-samples', `the instrument list has no recording ${id}`);
    return e;
  }

  private url(index: SampleIndex, id: string): string {
    return new URL(this.entry(index, id).file, this.base).href;
  }

  private async fetchFile(index: SampleIndex, id: string, cache: Cache | null, progress: (bytes: number) => void): Promise<ArrayBuffer> {
    const url = this.url(index, id);
    const kept = await cache?.match(url);
    if (kept) {
      const buf = await kept.arrayBuffer();
      progress(buf.byteLength);
      return buf;
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new ProcMuseError('missing-samples', `downloading ${id} failed (HTTP ${res.status})`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.byteLength;
      progress(n);
    }
    const expected = this.entry(index, id).bytes;
    if (n !== expected) throw new ProcMuseError('invalid-samples', `${id}: received ${n} bytes, expected ${expected}`);
    const buf = new Uint8Array(n);
    let at = 0;
    for (const c of chunks) {
      buf.set(c, at);
      at += c.byteLength;
    }
    await cache?.put(url, new Response(buf.slice(), { headers: { 'content-type': 'audio/flac' } }));
    return buf.buffer;
  }
}

/**
 * Cache Storage keeps downloads across visits. It exists only on secure
 * origins (https, localhost); elsewhere the browser's ordinary HTTP cache is
 * the only keeping, which is an optional enrichment, not a failure.
 */
async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE);
  } catch {
    // storage refused (private browsing, blocked site data): the download still works, it is just not kept
    return null;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
