/**
 * EngineCore: composer + sequencer + mixer behind one sample-pulling API.
 *
 * It is the ONE render path: the AudioWorklet calls `process` for live audio,
 * and `renderOffline` calls the same `process` for files and tests. It has no
 * dependency on Web Audio, the DOM, or timers.
 */
import { Composer, type ComposerInputs, type PartMode } from '../compose/composer.js';
import { PART_IDS, PART_INDEX, partRecord, type PartId } from '../compose/parts.js';
import { getStyle } from '../compose/styles.js';
import { BEATS_PER_BAR } from '../compose/rhythm.js';
import type { Macros, SectionKind } from '../compose/types.js';
import { ProcMuseError } from '../core/errors.js';
import { hash32 } from '../core/rng.js';
import { ParamStore, type ParamValue, type ParamValues } from '../core/params.js';
import { getPatch } from '../instruments/registry.js';
import { MAX_BLOCK, Mixer, type MixSettings } from '../mix/mixer.js';
import { PITCH_CLASS_NAMES } from '../theory/pitch.js';
import { SCALE_LABELS, type ScaleName } from '../theory/scale.js';
import { CHORD_NAME } from './chordName.js';
import type { EngineEvent } from './events.js';
import { DELAY_BEATS, P, buildParamSpecs, seedFrom, styleDefaults } from './paramSpecs.js';
import { EventQueue, ItemKind, type QueueItem } from './queue.js';

export type EngineCommand =
  | { type: 'regenerate'; seed?: number }
  | { type: 'nextSection'; kind?: SectionKind }
  | { type: 'panic' };

export interface EngineCoreOptions {
  sampleRate: number;
  /** initial parameter values (validated) */
  params?: Readonly<Record<string, unknown>>;
}

const LEVELS_INTERVAL = 1 / 30;

export class EngineCore {
  readonly sampleRate: number;
  readonly params: ParamStore;
  private composer!: Composer;
  private mixer: Mixer;
  private queue = new EventQueue();
  /** musical position in beats at the next sample to render */
  private beat = 0;
  private nextBarToCompose = 0;
  private frames = 0;
  private lastLevels = -1;
  private listener: ((e: EngineEvent) => void) | null = null;
  private mixDirty = true;
  private mix: MixSettings;
  private macros: Macros = { energy: 0.5, complexity: 0.5, variation: 0.5, swing: 0, humanize: 0 };
  private macrosDirty = true;
  private inputs: ComposerInputs;
  private applyingStyle = false;

  constructor(options: EngineCoreOptions) {
    if (!(options.sampleRate >= 8000 && options.sampleRate <= 384000)) {
      throw new ProcMuseError('invalid-argument', `sampleRate ${options.sampleRate} is out of range`);
    }
    this.sampleRate = options.sampleRate;
    this.params = new ParamStore(buildParamSpecs());
    this.mixer = new Mixer(this.sampleRate);
    this.mix = { ...this.mixer.settings };
    if (options.params) {
      const style = options.params[P.style];
      if (style !== undefined) this.params.apply({ [P.style]: style, ...styleDefaults(String(style)) });
      this.params.apply(options.params);
    }
    const params = this.params;
    this.inputs = {
      style: () => getStyle(params.string(P.style)),
      macros: () => this.readMacros(),
      partMode: (p: PartId) => params.string(P.part(p, 'mode')) as PartMode,
      key: () => {
        const k = params.string(P.key);
        return k === 'auto' ? null : PITCH_CLASS_NAMES.indexOf(k as (typeof PITCH_CLASS_NAMES)[number]);
      },
      scale: () => {
        const s = params.string(P.scale);
        return s === 'auto' ? null : (s as ScaleName);
      },
    };
    this.composer = new Composer(params.number(P.seed), this.inputs);
    PART_IDS.forEach((p, i) => this.loadInstrument(p, i));
    params.onParam((id, value) => this.onParam(id, value));
  }

  /** Receives every event the engine emits. One listener (the host); fan-out is the host's job. */
  setListener(fn: ((e: EngineEvent) => void) | null): void {
    this.listener = fn;
  }

  /** Engine clock in seconds (frames rendered so far). */
  get time(): number {
    return this.frames / this.sampleRate;
  }

  get position(): number {
    return this.beat;
  }

  setParam(id: string, value: unknown): void {
    this.params.set(id, value);
  }

  setParams(values: Readonly<Record<string, unknown>>): void {
    this.params.apply(values);
  }

  snapshot(): ParamValues {
    return this.params.snapshot();
  }

  command(cmd: EngineCommand): void {
    switch (cmd.type) {
      case 'regenerate': {
        const seed = cmd.seed ?? seedFrom(hash32(String(this.frames), this.params.number(P.seed)));
        this.params.set(P.seed, seed); // onParam restarts the composer
        break;
      }
      case 'nextSection':
        this.composer.queueSection(cmd.kind ?? null);
        this.dropFutureNotes();
        break;
      case 'panic':
        this.queue.filter(() => false);
        this.mixer.allNotesOff();
        break;
      default:
        throw new ProcMuseError('invalid-message', `unknown command ${JSON.stringify(cmd)}`);
    }
  }

  private emit(e: EngineEvent): void {
    this.listener?.(e);
  }

  private readMacros(): Macros {
    if (this.macrosDirty) {
      const p = this.params;
      this.macros = {
        energy: p.number(P.energy),
        complexity: p.number(P.complexity),
        variation: p.number(P.variation),
        swing: p.number(P.swing),
        humanize: p.number(P.humanize),
      };
      this.macrosDirty = false;
    }
    return this.macros;
  }

  private loadInstrument(part: PartId, index: number): void {
    const id = this.params.string(P.part(part, 'instrument'));
    this.mixer.setInstrument(index, getPatch(id), hash32(`${part}:${id}`, this.params.number(P.seed)));
  }

  private onParam(id: string, value: ParamValue): void {
    this.mixDirty = true;
    this.macrosDirty = true;
    if (id === P.style && !this.applyingStyle) {
      this.applyingStyle = true;
      try {
        const defaults = styleDefaults(String(value));
        for (const [k, v] of Object.entries(defaults)) {
          this.params.set(k, v);
          this.emit({ type: 'param', id: k, value: v });
        }
      } finally {
        this.applyingStyle = false;
      }
      this.composer.queueSection(null);
      this.dropFutureNotes();
    } else if (id === P.seed) {
      this.restartComposer();
    } else if (id.endsWith('.instrument')) {
      const part = id.split('.')[1] as PartId;
      this.loadInstrument(part, PART_INDEX[part]);
    } else if (id.endsWith('.mode') && value === 'off') {
      const part = id.split('.')[1] as PartId;
      this.queue.filter((it) => !(it.part === PART_INDEX[part] && it.kind === ItemKind.On));
    }
  }

  /** Drops not-yet-started notes after the current bar so new material starts at the next bar line. */
  private dropFutureNotes(): void {
    const nextBar = Math.floor(this.beat / BEATS_PER_BAR) + 1;
    const cut = nextBar * BEATS_PER_BAR;
    this.queue.filter((it) => it.kind === ItemKind.Off || it.beat < cut);
    this.nextBarToCompose = Math.min(this.nextBarToCompose, nextBar);
  }

  private restartComposer(): void {
    this.composer = new Composer(this.params.number(P.seed), this.inputs);
    this.dropFutureNotes();
  }

  private refreshMix(): void {
    if (!this.mixDirty) return;
    const p = this.params;
    const tempo = p.number(P.tempo);
    const m = this.mix;
    m.volumeDb = p.number(P.volume);
    m.space = p.number(P.space);
    m.duck = p.number(P.duck);
    m.cutoffOctaves = (p.number(P.brightness) - 0.5) * 3;
    m.reverbSize = p.number(P.reverbSize);
    m.reverbDamping = p.number(P.reverbDamping);
    const beats = DELAY_BEATS[p.string(P.delayTime) as keyof typeof DELAY_BEATS];
    m.delaySamples = Math.min((beats * 60 * this.sampleRate) / tempo, this.sampleRate * 2.4);
    m.delayFeedback = p.number(P.delayFeedback) * 0.85;
    this.mixer.updateSettings(m);
    PART_IDS.forEach((part, i) => {
      const ch = this.mixer.channels[i];
      if (!ch) return;
      ch.settings = {
        gainDb: p.number(P.part(part, 'level')),
        pan: p.number(P.part(part, 'pan')),
        reverb: p.number(P.part(part, 'reverb')),
        delay: p.number(P.part(part, 'delay')),
      };
    });
    this.mixDirty = false;
  }

  /** Composes bars until the queue covers the near future. */
  private composeAhead(): void {
    while (this.nextBarToCompose * BEATS_PER_BAR <= this.beat + 0.5) {
      const bar = this.nextBarToCompose++;
      const res = this.composer.composeBar(bar);
      const startBeat = bar * BEATS_PER_BAR;
      if (res.sectionStart) {
        const s = res.section;
        this.pushMarker(startBeat, () =>
          this.emit({ type: 'section', time: this.time, index: s.index, kind: s.kind, energy: s.energy, bars: s.bars, startBar: s.startBar }),
        );
      }
      if (res.chordChange || res.sectionStart) {
        const c = res.chord;
        const keyName = `${PITCH_CLASS_NAMES[res.scale.root]} ${SCALE_LABELS[res.scale.name]}`;
        this.pushMarker(startBeat, () =>
          this.emit({
            type: 'chord',
            time: this.time,
            root: c.pitchClasses[0] as number,
            degree: c.degree,
            name: `${PITCH_CLASS_NAMES[c.pitchClasses[0] as number]}${CHORD_NAME(c, res.scale)}`,
            key: keyName,
          }),
        );
      }
      for (let b = 0; b < BEATS_PER_BAR; b++) {
        const beatIndex = b;
        this.pushMarker(startBeat + b, () =>
          this.emit({ type: 'beat', time: this.time, bar, beat: beatIndex, tempo: this.params.number(P.tempo) }),
        );
      }
      for (const e of res.events) {
        const part = PART_INDEX[e.part];
        this.queue.push({ beat: e.start, kind: ItemKind.On, part, pitch: e.pitch, velocity: e.velocity, duration: e.duration, marker: null });
        this.queue.push({ beat: e.start + e.duration, kind: ItemKind.Off, part, pitch: e.pitch, velocity: 0, duration: 0, marker: null });
      }
    }
  }

  private pushMarker(beat: number, fn: () => void): void {
    this.queue.push({ beat, kind: ItemKind.Marker, part: -1, pitch: 0, velocity: 0, duration: 0, marker: fn });
  }

  /** `offset` is the frame within the current block (for sample-accurate ducking). */
  private dispatch(it: QueueItem, offset: number): void {
    switch (it.kind) {
      case ItemKind.Marker:
        it.marker?.();
        break;
      case ItemKind.Off:
        this.mixer.noteOff(it.part, it.pitch);
        break;
      case ItemKind.On: {
        this.mixer.noteOn(it.part, it.pitch, it.velocity);
        if (it.part === PART_INDEX.kick) this.mixer.triggerDuck(offset);
        const part = PART_IDS[it.part] as PartId;
        this.emit({
          type: 'note',
          time: this.time,
          part,
          pitch: it.pitch,
          velocity: it.velocity,
          duration: (it.duration * 60) / this.params.number(P.tempo),
        });
        break;
      }
    }
  }

  /** Renders `outL.length` frames (any size) of stereo audio. */
  process(outL: Float32Array, outR: Float32Array): void {
    const total = outL.length;
    if (outR.length !== total) throw new ProcMuseError('invalid-argument', 'channel buffers differ in length');
    for (let done = 0; done < total; done += MAX_BLOCK) {
      const n = Math.min(MAX_BLOCK, total - done);
      this.processBlock(outL.subarray(done, done + n), outR.subarray(done, done + n), n);
    }
  }

  private processBlock(outL: Float32Array, outR: Float32Array, frames: number): void {
    this.refreshMix();
    this.mixer.beginBlock(frames);
    const beatsPerFrame = this.params.number(P.tempo) / 60 / this.sampleRate;
    let pos = 0;
    while (pos < frames) {
      this.composeAhead();
      // dispatch everything due now
      let it = this.queue.peek();
      while (it && it.beat <= this.beat + 1e-9) {
        this.queue.pop();
        this.dispatch(it, pos);
        it = this.queue.peek();
      }
      // render up to the next scheduled item (or the end of the block)
      let until = frames;
      if (it) until = Math.min(frames, pos + Math.max(1, Math.ceil((it.beat - this.beat) / beatsPerFrame - 1e-9)));
      this.mixer.renderVoices(pos, until);
      this.beat += (until - pos) * beatsPerFrame;
      this.frames += until - pos;
      pos = until;
    }
    this.mixer.finish(outL, outR, frames);
    if (this.time - this.lastLevels >= LEVELS_INTERVAL) {
      this.lastLevels = this.time;
      const parts = partRecord((_p, i) => this.mixer.channels[i]?.level ?? 0);
      this.emit({ type: 'levels', time: this.time, parts, master: this.mixer.masterLevel, voices: this.mixer.voiceCount });
    }
  }
}
