/**
 * Recorded-instrument collections in the app: one-press download, the
 * Instruments panel, and making sure a preset's collection is loaded before
 * the preset is applied.
 */
import {
  COLLECTIONS,
  NO_COLLECTION,
  P,
  PART_IDS,
  PART_INFO,
  castBand,
  getPatch,
  type ParamSpec,
  type ParamValue,
} from '@procmuse/engine';
import { createControl, h, type Workspace } from '@procmuse/ui';
import { SampleLibrary, type WebEngine } from '@procmuse/web';

const MB = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

/** Downloads collections once and hands them to the engine. */
export class Collections {
  readonly library: SampleLibrary;
  private readonly loading = new Map<string, Promise<void>>();

  constructor(private readonly engine: WebEngine) {
    this.library = new SampleLibrary(new URL('samples/', document.baseURI));
  }

  /** Makes a collection playable: downloads (or reads back) and decodes it, once. */
  prepare(id: string, onProgress?: (fraction: number) => void): Promise<void> {
    if (id === NO_COLLECTION || this.engine.hasCollection(id)) return Promise.resolve();
    let job = this.loading.get(id);
    if (!job) {
      job = this.library
        .load(id, (p) => onProgress?.(p.total ? p.loaded / p.total : 0))
        .then((sets) => this.engine.addSamples(sets))
        .finally(() => this.loading.delete(id));
      this.loading.set(id, job);
    }
    return job;
  }

  async use(id: string, onProgress?: (fraction: number) => void): Promise<void> {
    await this.prepare(id, onProgress);
    this.engine.set(P.collection, id);
  }

  /** Loads whatever collection a preset names, so applying it cannot fail on missing recordings. */
  async prepareFor(preset: Record<string, ParamValue>): Promise<void> {
    const c = preset[P.collection];
    if (typeof c === 'string') await this.prepare(c);
  }
}

/** The Instruments panel body: the collections, the real-instruments amount, and who plays what. */
export function instrumentsPanel(ws: Workspace, engine: WebEngine, collections: Collections): HTMLElement {
  const realSpec = engine.specs.find((s) => s.id === P.real) as ParamSpec;
  const cast = h('p', { class: 'pm-help pm-cast', attrs: { 'aria-live': 'polite' } });
  const rows = new Map<string, { button: HTMLButtonElement; bar: HTMLElement; progress: HTMLElement }>();

  const label = async (id: string): Promise<string> => {
    if (id === NO_COLLECTION) return 'Use';
    if (engine.hasCollection(id) || (await collections.library.downloaded(id))) return 'Use';
    return `Download · ${MB(await collections.library.bytes(id))}`;
  };

  const refresh = async () => {
    const active = String(engine.get(P.collection));
    for (const [id, row] of rows) {
      const on = id === active;
      row.button.setAttribute('aria-pressed', String(on));
      row.button.classList.toggle('pm-btn-primary', on);
      if (!row.button.disabled) row.button.textContent = on ? 'Playing' : await label(id);
    }
    // who plays what, computed by the same casting the engine uses
    const band = castBand({
      seed: Number(engine.get(P.seed)),
      collection: active,
      real: Number(engine.get(P.real)),
      synth: (part) => getPatch(String(engine.get(P.part(part, 'instrument')))),
    });
    const real = PART_IDS.filter((p) => getPatch(band[p]).oscillators.some((o) => o.type === 'sample'));
    cast.textContent = real.length
      ? `Recorded now: ${real.map((p) => `${PART_INFO[p].label}: ${getPatch(band[p]).name}`).join(', ')}.`
      : 'Every part is synthesized.';
  };

  const pick = async (id: string, name: string) => {
    const row = rows.get(id);
    if (!row) return;
    row.button.disabled = true;
    try {
      if (id !== NO_COLLECTION && !engine.hasCollection(id)) {
        row.button.textContent = 'Downloading…';
        row.progress.hidden = false;
        ws.announce(`Downloading ${name}`);
      }
      await collections.use(id, (f) => {
        row.bar.style.width = `${Math.round(f * 100)}%`;
        row.progress.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      });
      ws.announce(id === NO_COLLECTION ? 'Synthesized instruments only' : `${name} collection playing`);
    } catch (err) {
      ws.errors.show(err, `${name} collection`);
    } finally {
      row.button.disabled = false;
      row.progress.hidden = true;
      await refresh();
    }
  };

  const list = h('ul', { class: 'pm-collections', attrs: { 'aria-label': 'Instrument collections' } });
  const entries = [
    { id: NO_COLLECTION, name: 'Synthesized only', description: 'Every part plays a synthesized instrument.' },
    ...COLLECTIONS,
  ];
  for (const c of entries) {
    const titleId = `pm-col-${c.id}`;
    const bar = h('span');
    const progress = h(
      'div',
      { class: 'pm-progress', attrs: { role: 'progressbar', 'aria-label': `Downloading ${c.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' } },
      bar,
    );
    progress.hidden = true;
    const button = h('button', {
      class: 'pm-btn',
      text: '…',
      attrs: { type: 'button', 'aria-describedby': titleId, 'aria-pressed': 'false' },
      on: { click: () => void pick(c.id, c.name) },
    });
    rows.set(c.id, { button, bar, progress });
    list.append(
      h(
        'li',
        { class: 'pm-collection' },
        h('div', { class: 'pm-collection-text' }, h('strong', { text: c.name, attrs: { id: titleId } }), h('span', { class: 'pm-help', text: c.description })),
        button,
        progress,
      ),
    );
  }

  engine.onParam((id) => {
    if (id === P.collection || id === P.real || id === P.seed || id.endsWith('.instrument')) void refresh();
  });
  void refresh().catch((err: unknown) => ws.errors.show(err, 'Instrument collections'));

  return h(
    'div',
    {},
    h('p', {
      class: 'pm-help',
      text: 'Real recorded instruments from a chamber orchestra (VS Chamber Orchestra, public domain). A collection downloads once, then plays at once whenever you choose it.',
    }),
    list,
    createControl(realSpec, engine).el,
    cast,
  );
}
