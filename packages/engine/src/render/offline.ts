/** Offline rendering: the same EngineCore, pulled as fast as the CPU allows. */
import { EngineCore } from '../engine/core.js';
import type { EngineEvent } from '../engine/events.js';

export interface OfflineOptions {
  seconds: number;
  sampleRate?: number;
  params?: Readonly<Record<string, unknown>>;
  /** collect emitted events (default true) */
  collectEvents?: boolean;
}

export interface OfflineResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  events: EngineEvent[];
}

export function renderOffline(options: OfflineOptions): OfflineResult {
  const sampleRate = options.sampleRate ?? 44100;
  const core = new EngineCore({ sampleRate, params: options.params });
  const events: EngineEvent[] = [];
  if (options.collectEvents !== false) core.setListener((e) => events.push(e));
  const frames = Math.ceil(options.seconds * sampleRate);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  core.process(left, right);
  return { left, right, sampleRate, events };
}
