/**
 * WebEngine: the main-thread face of the engine. It owns the AudioContext
 * node, mirrors parameter values (validated here first, so mistakes throw in
 * the caller's code), relays engine events, and keeps a MusicState in sync
 * with what the listener is hearing right now.
 */
import {
  Emitter,
  MusicStateTracker,
  ParamStore,
  ProcMuseError,
  buildParamSpecs,
  type EngineCommand,
  type EngineEvent,
  type MusicState,
  type ParamSource,
  type ParamSpec,
  type ParamValue,
  type ParamValues,
} from '@procmuse/engine';
import { PROCESSOR_NAME, parseFromProcessor, type ProcessorOptions, type ToProcessor } from './protocol.js';

export interface WebEngineOptions {
  /** URL of the bundled processor module (see processor.ts). */
  processorUrl: string | URL;
  /** Use an existing context; otherwise one is created. Must be resumed from a user gesture. */
  context?: AudioContext;
  /** Initial parameter values. */
  params?: ParamValues;
  /** Connect to context.destination (default true). */
  connect?: boolean;
}

export interface WebEngineEvents extends Record<string, unknown> {
  /** every engine event, as it is produced (ahead of the listener) */
  event: EngineEvent;
  /** a parameter changed (by the caller or by the engine itself) */
  param: { id: string; value: ParamValue };
  error: ProcMuseError;
  playing: boolean;
}

export class WebEngine implements ParamSource {
  readonly context: AudioContext;
  readonly node: AudioWorkletNode;
  /** Final output; connect analysers or recorders here. */
  readonly output: GainNode;
  readonly specs: readonly ParamSpec[];
  private readonly store: ParamStore;
  private readonly tracker = new MusicStateTracker();
  private readonly emitter = new Emitter<WebEngineEvents>();
  private offset = 0;
  private _playing = false;
  private disposed = false;

  private constructor(context: AudioContext, node: AudioWorkletNode, store: ParamStore) {
    this.context = context;
    this.node = node;
    this.store = store;
    this.specs = store.specs;
    this.output = context.createGain();
    node.connect(this.output);
    node.port.onmessage = (ev) => this.receive(ev.data);
    node.onprocessorerror = () => this.fail(new ProcMuseError('internal', 'the audio engine crashed'));
  }

  static async create(options: WebEngineOptions): Promise<WebEngine> {
    const context = options.context ?? new AudioContext({ latencyHint: 'playback' });
    if (!context.audioWorklet) throw new ProcMuseError('internal', 'AudioWorklet is not available in this browser');
    await context.audioWorklet.addModule(options.processorUrl);
    const store = new ParamStore(buildParamSpecs());
    if (options.params) store.apply(options.params);
    const processorOptions: ProcessorOptions = { params: store.snapshot() };
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions,
    });
    const engine = new WebEngine(context, node, store);
    if (options.connect !== false) engine.output.connect(context.destination);
    return engine;
  }

  on<K extends keyof WebEngineEvents>(type: K, fn: (payload: WebEngineEvents[K]) => void): () => void {
    return this.emitter.on(type, fn);
  }

  onParam(fn: (id: string, value: ParamValue) => void): () => void {
    return this.emitter.on('param', ({ id, value }) => fn(id, value));
  }

  get(id: string): ParamValue {
    return this.store.get(id);
  }

  values(): ParamValues {
    return this.store.snapshot();
  }

  /** Validates locally (throws on bad input), then sends to the audio thread. */
  set(id: string, value: ParamValue): void {
    this.store.set(id, value);
    this.send({ type: 'set', id, value });
    this.emitter.emit('param', { id, value });
  }

  setMany(values: ParamValues): void {
    this.store.apply(values);
    this.send({ type: 'setMany', values });
    for (const [id, value] of Object.entries(values)) this.emitter.emit('param', { id, value });
  }

  command(command: EngineCommand): void {
    this.send({ type: 'command', command });
  }

  get playing(): boolean {
    return this._playing;
  }

  async play(): Promise<void> {
    await this.context.resume();
    this.send({ type: 'play' });
    this._playing = true;
    this.emitter.emit('playing', true);
  }

  pause(): void {
    this.send({ type: 'pause' });
    this._playing = false;
    this.emitter.emit('playing', false);
  }

  /** The music state at the moment the listener is hearing. Call once per animation frame. */
  musicState(): MusicState {
    const ts = this.context.getOutputTimestamp?.();
    const heard = ts?.contextTime ?? this.context.currentTime - (this.context.outputLatency || this.context.baseLatency || 0);
    return this.tracker.update(heard - this.offset);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.output.disconnect();
    this.emitter.clear();
  }

  private send(msg: ToProcessor): void {
    if (this.disposed) throw new ProcMuseError('internal', 'engine was disposed');
    this.node.port.postMessage(msg);
  }

  private fail(err: ProcMuseError): void {
    this.emitter.emit('error', err);
  }

  private receive(data: unknown): void {
    let msg;
    try {
      msg = parseFromProcessor(data);
    } catch (err) {
      this.fail(err as ProcMuseError);
      return;
    }
    switch (msg.type) {
      case 'ready':
        this.store.apply(msg.values);
        break;
      case 'events':
        this.offset = msg.offset;
        this.tracker.push(msg.events);
        for (const e of msg.events) {
          if (e.type === 'param') {
            this.store.set(e.id, e.value);
            this.emitter.emit('param', { id: e.id, value: e.value });
          }
          this.emitter.emit('event', e);
        }
        break;
      case 'error':
        this.fail(new ProcMuseError('internal', `audio engine: ${msg.message}`));
        break;
    }
  }
}
