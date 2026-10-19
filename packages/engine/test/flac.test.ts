import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeFlac, md5 } from '../src/instruments/flac.js';

// Made with ffmpeg writing to a file, so each carries the MD5 of its audio,
// which decodeFlac checks: decoding them at all proves the samples bit-exact.
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/flac', name));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('decodeFlac', () => {
  it('md5 matches the RFC 1321 test vectors', () => {
    expect(hex(md5(new Uint8Array()))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hex(md5(new TextEncoder().encode('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(hex(md5(new TextEncoder().encode('a'.repeat(1000))))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });

  it('decodes stereo 16-bit (stereo decorrelation, LPC) to the signed audio', () => {
    const a = decodeFlac(fixture('stereo-16.flac'));
    expect(a.sampleRate).toBe(44100);
    expect(a.bitsPerSample).toBe(16);
    expect(a.channels.map((c) => c.length)).toEqual([17640, 17640]);
    const [left, right] = a.channels as [Float32Array, Float32Array];
    const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(left)).toBeCloseTo(0.7, 1);
    // the right channel stops after 0.2 s
    expect(peak(right.subarray(0, 8820))).toBeCloseTo(0.4, 1);
    expect(peak(right.subarray(8900))).toBe(0);
  });

  it('decodes 24-bit audio and fixed-predictor noise with silence (constant subframes)', () => {
    const a = decodeFlac(fixture('mono-24.flac'));
    expect([a.sampleRate, a.bitsPerSample, a.channels[0]!.length]).toEqual([48000, 24, 14400]);
    const b = decodeFlac(fixture('noise-fixed.flac'));
    expect([b.sampleRate, b.channels.length, b.channels[0]!.length]).toEqual([32000, 1, 6400]);
    expect(b.channels[0]!.subarray(0, 3000).every((v) => v === 0)).toBe(true);
  });

  it('is loud about a damaged file, never partial audio', () => {
    const good = fixture('stereo-16.flac');
    expect(() => decodeFlac(new TextEncoder().encode('RIFF....WAVEfmt '.repeat(4)))).toThrow(/not a FLAC file/);
    expect(() => decodeFlac(good.subarray(0, good.length - 100))).toThrow(/ends early|CRC/);
    // one flipped bit anywhere in the audio: caught by the frame checks (a CRC, or a field it garbles first)
    // (the audio is the last 8.6 kB; before it, ffmpeg leaves an 8 kB padding block decoders skip)
    for (const at of [good.length - 8000, good.length - 5000, good.length - 2000, good.length - 3]) {
      const flipped = new Uint8Array(good);
      flipped[at]! ^= 0x10;
      expect(() => decodeFlac(flipped)).toThrow(/^FLAC: /);
    }
    // a wrong signature in the header: the audio itself decodes, the check catches it
    const signed = new Uint8Array(good);
    signed[30]! ^= 1;
    expect(() => decodeFlac(signed)).toThrow(/MD5/);
  });
});
