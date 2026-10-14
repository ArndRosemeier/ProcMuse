/**
 * The message protocol between the main thread (WebEngine) and the audio
 * thread (processor). Both sides validate what they receive: a malformed
 * message is a loud error, never ignored.
 */
import { ProcMuseError, type EngineCommand, type EngineEvent, type ParamValue, type ParamValues } from '@procmuse/engine';

export const PROCESSOR_NAME = 'procmuse-engine';

export type ToProcessor =
  | { type: 'set'; id: string; value: ParamValue }
  | { type: 'setMany'; values: ParamValues }
  | { type: 'command'; command: EngineCommand }
  | { type: 'play' }
  | { type: 'pause' };

export type FromProcessor =
  | { type: 'ready'; values: ParamValues }
  | {
      type: 'events';
      events: EngineEvent[];
      /** context time minus engine time at the end of this batch */
      offset: number;
    }
  | { type: 'error'; code: string; message: string };

export interface ProcessorOptions {
  params: ParamValues;
}

function fail(what: string, data: unknown): never {
  throw new ProcMuseError('invalid-message', `${what}: ${JSON.stringify(data)?.slice(0, 200)}`);
}

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null;

export function parseToProcessor(data: unknown): ToProcessor {
  if (!isObj(data) || typeof data.type !== 'string') fail('bad message to processor', data);
  switch (data.type) {
    case 'set':
      if (typeof data.id !== 'string' || !['number', 'string', 'boolean'].includes(typeof data.value)) fail('bad set', data);
      return data as ToProcessor;
    case 'setMany':
      if (!isObj(data.values)) fail('bad setMany', data);
      return data as ToProcessor;
    case 'command':
      if (!isObj(data.command) || typeof data.command.type !== 'string') fail('bad command', data);
      return data as ToProcessor;
    case 'play':
    case 'pause':
      return data as ToProcessor;
    default:
      fail('unknown message to processor', data);
  }
}

export function parseFromProcessor(data: unknown): FromProcessor {
  if (!isObj(data) || typeof data.type !== 'string') fail('bad message from processor', data);
  switch (data.type) {
    case 'ready':
      if (!isObj(data.values)) fail('bad ready', data);
      return data as FromProcessor;
    case 'events':
      if (!Array.isArray(data.events) || typeof data.offset !== 'number') fail('bad events', data);
      return data as FromProcessor;
    case 'error':
      if (typeof data.message !== 'string') fail('bad error', data);
      return data as FromProcessor;
    default:
      fail('unknown message from processor', data);
  }
}
