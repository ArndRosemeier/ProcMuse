import { describe, expect, it } from 'vitest';
import { parseFromProcessor, parseToProcessor } from '../src/protocol.js';

describe('worklet protocol', () => {
  it('accepts well-formed messages both ways', () => {
    expect(parseToProcessor({ type: 'set', id: 'music.energy', value: 0.4 }).type).toBe('set');
    expect(parseToProcessor({ type: 'command', command: { type: 'regenerate' } }).type).toBe('command');
    expect(parseFromProcessor({ type: 'events', events: [], offset: 0.1 }).type).toBe('events');
    expect(parseToProcessor({ type: 'samples', sets: [] }).type).toBe('samples');
  });

  it('rejects malformed messages loudly instead of ignoring them', () => {
    expect(() => parseToProcessor({ type: 'set', id: 3 })).toThrow(/bad set/);
    expect(() => parseToProcessor({ type: 'launch' })).toThrow(/unknown message/);
    expect(() => parseToProcessor(null)).toThrow();
    expect(() => parseToProcessor({ type: 'samples', sets: {} })).toThrow(/bad samples/);
    expect(() => parseFromProcessor({ type: 'events', events: 'x', offset: 0 })).toThrow(/bad events/);
  });
});
