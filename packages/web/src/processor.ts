/**
 * The AudioWorklet processor: hosts one EngineCore on the audio thread.
 * Load this module with `audioContext.audioWorklet.addModule(url)`; the app's
 * bundler produces the URL (e.g. Vite: `import url from '@procmuse/web/processor?worker&url'`).
 */
import { EngineCore, type EngineEvent } from '@procmuse/engine';
import { PROCESSOR_NAME, parseToProcessor, type FromProcessor, type ProcessorOptions } from './protocol.js';

// Minimal declarations of the AudioWorkletGlobalScope (not in the DOM lib).
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

/** Flush events to the main thread about every 10 ms. */
const FLUSH_FRAMES = 480;

class ProcMuseProcessor extends AudioWorkletProcessor {
  private core: EngineCore | null = null;
  private playing = false;
  private batch: EngineEvent[] = [];
  private sinceFlush = 0;

  constructor(options: { processorOptions?: ProcessorOptions }) {
    super();
    try {
      this.core = new EngineCore({ sampleRate, params: options.processorOptions?.params });
      this.core.setListener((e) => this.batch.push(e));
      this.post({ type: 'ready', values: this.core.snapshot() });
    } catch (err) {
      this.postError(err);
    }
    this.port.onmessage = (ev: MessageEvent) => this.receive(ev.data);
  }

  private post(msg: FromProcessor): void {
    this.port.postMessage(msg);
  }

  private postError(err: unknown): void {
    const e = err as { code?: string; message?: string };
    this.post({ type: 'error', code: e.code ?? 'internal', message: e.message ?? String(err) });
  }

  private receive(data: unknown): void {
    try {
      const msg = parseToProcessor(data);
      const core = this.core;
      if (!core) throw new Error('engine failed to start');
      switch (msg.type) {
        case 'set':
          core.setParam(msg.id, msg.value);
          break;
        case 'setMany':
          core.setParams(msg.values);
          break;
        case 'command':
          core.command(msg.command);
          break;
        case 'play':
          this.playing = true;
          break;
        case 'pause':
          this.playing = false;
          core.command({ type: 'panic' });
          break;
      }
      // param events produced synchronously (e.g. style defaults) go out right away
      if (this.batch.some((e) => e.type === 'param')) this.flush();
    } catch (err) {
      this.postError(err);
    }
  }

  private flush(): void {
    if (!this.core) return;
    this.post({ type: 'events', events: this.batch, offset: currentTime - this.core.time });
    this.batch = [];
    this.sinceFlush = 0;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const core = this.core;
    if (!out || !core || !this.playing) return true;
    const l = out[0];
    const r = out[1] ?? out[0];
    if (!l || !r) return true;
    try {
      core.process(l, r === l ? new Float32Array(l.length) : r);
    } catch (err) {
      this.playing = false;
      this.postError(err);
      return true;
    }
    this.sinceFlush += l.length;
    if (this.sinceFlush >= FLUSH_FRAMES) this.flush();
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, ProcMuseProcessor);
