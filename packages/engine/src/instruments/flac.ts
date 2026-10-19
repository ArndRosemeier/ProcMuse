/**
 * FLAC decoder: the recordings' file format, decoded by the engine's own code.
 *
 * Browsers disagree on which formats `decodeAudioData` accepts (Safari on iPad
 * refuses FLAC), so hosts do not rely on it: every host hands the file's bytes
 * to `decodeFlac` and gets the same PCM, bit for bit. It is pure code over a
 * byte array: no DOM, no Web Audio, no timers.
 *
 * Full FLAC up to 24 bits: any channel count and stereo decorrelation, fixed
 * and LPC predictors, Rice partitions with escape codes, wasted bits. Every
 * frame's header CRC-8 and body CRC-16 are checked, and the decoded audio is
 * checked against the stream's MD5 signature when the encoder wrote one.
 * Anything malformed is a loud ProcMuseError, never partial audio.
 */
import { ProcMuseError } from '../core/errors.js';

export interface FlacAudio {
  sampleRate: number;
  bitsPerSample: number;
  /** one array per channel, scaled to [-1, 1) */
  channels: Float32Array[];
}

function bad(msg: string): never {
  throw new ProcMuseError('invalid-samples', `FLAC: ${msg}`);
}

/** Reads big-endian bit fields through a 32-bit window. */
class Bits {
  pos = 0; // in bits
  private readonly end: number;
  /** the file plus zero bytes, so a window never reads past the array */
  private readonly b: Uint8Array;
  constructor(readonly buf: Uint8Array) {
    this.b = new Uint8Array(buf.length + 8);
    this.b.set(buf);
    this.end = buf.length * 8;
  }

  get byte(): number {
    return this.pos >>> 3;
  }

  /** The 32 bits at byte `i`. */
  private word(i: number): number {
    const b = this.b;
    return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  }

  /** Unsigned read of 0..32 bits. */
  u(n: number): number {
    if (n === 0) return 0;
    if (n > 24) return this.u(n - 16) * 65536 + this.u(16);
    if (this.pos + n > this.end) bad('the file ends early');
    const v = ((this.word(this.pos >>> 3) << (this.pos & 7)) >>> 0) >>> (32 - n);
    this.pos += n;
    return v;
  }

  /** Signed (two's complement) read of 1..32 bits. */
  s(n: number): number {
    const v = this.u(n);
    return v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }

  /** Counts zero bits up to and including the next one bit. */
  unary(): number {
    let n = 0;
    for (;;) {
      if (this.pos >= this.end) bad('the file ends early');
      const w = (this.word(this.pos >>> 3) << (this.pos & 7)) >>> 0;
      // the window holds at least 25 bits of the file
      if (w) {
        const z = Math.clz32(w);
        if (z < 25) {
          if (this.pos + z + 1 > this.end) bad('the file ends early');
          this.pos += z + 1;
          return n + z;
        }
      }
      n += 25;
      this.pos += 25;
    }
  }

  /** Rice-coded signed values into dst[from..to), parameter k: the hot loop, kept in locals. */
  rice(dst: Int32Array, from: number, to: number, k: number): void {
    const b = this.b;
    const end = this.end;
    let pos = this.pos;
    for (let i = from; i < to; i++) {
      // the quotient: zeros up to a one
      let q = 0;
      for (;;) {
        const at = pos >>> 3;
        const w = ((((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) << (pos & 7)) >>> 0);
        const z = Math.clz32(w);
        if (z < 25) {
          q += z;
          pos += z + 1;
          break;
        }
        q += 25;
        pos += 25;
        if (pos >= end) bad('the file ends early');
      }
      // the remainder: k bits
      let v = q;
      if (k) {
        let rem: number;
        if (k <= 24) {
          const at = pos >>> 3;
          const w = (((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) << (pos & 7)) >>> 0;
          rem = w >>> (32 - k);
          pos += k;
        } else {
          this.pos = pos;
          rem = this.u(k);
          pos = this.pos;
        }
        // a valid residual fits 32 bits, so 32-bit wrapping is exact
        v = (q << k) | rem;
      }
      if (pos > end) bad('the file ends early');
      // zigzag back to signed
      dst[i] = (v >>> 1) ^ -(v & 1);
    }
    this.pos = pos;
  }

  align(): void {
    this.pos = (this.pos + 7) & ~7;
  }
}

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c8 = i;
  let c16 = i << 8;
  for (let b = 0; b < 8; b++) {
    c8 = c8 & 0x80 ? ((c8 << 1) ^ 0x07) & 0xff : (c8 << 1) & 0xff;
    c16 = c16 & 0x8000 ? ((c16 << 1) ^ 0x8005) & 0xffff : (c16 << 1) & 0xffff;
  }
  CRC8[i] = c8;
  CRC16[i] = c16;
}
const crc8 = (b: Uint8Array, from: number, to: number) => {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ b[i]!]!;
  return c;
};
const crc16 = (b: Uint8Array, from: number, to: number) => {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >>> 8) ^ b[i]!]!;
  return c;
};

interface StreamInfo {
  sampleRate: number;
  channels: number;
  bps: number;
  total: number;
  md5: Uint8Array;
}

const BLOCK_SIZES = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
const RATES = [0, 88200, 176400, 192000, 8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const SIZES = [0, 8, 12, 0, 16, 20, 24, 32];
const FIXED = [[], [1], [2, -1], [3, -3, 1], [4, -6, 4, -1]].map((c) => Int32Array.from(c));

export function decodeFlac(bytes: ArrayBuffer | Uint8Array): FlacAudio {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length < 42 || buf[0] !== 0x66 || buf[1] !== 0x4c || buf[2] !== 0x61 || buf[3] !== 0x43) bad('not a FLAC file');
  const r = new Bits(buf);
  r.pos = 32;

  // metadata: STREAMINFO first, the rest skipped
  let info: StreamInfo | null = null;
  for (let last = 0; !last; ) {
    last = r.u(1);
    const type = r.u(7);
    const len = r.u(24);
    const end = r.byte + len;
    if (end > buf.length) bad('a metadata block runs past the end of the file');
    if (type === 0) {
      if (info || len !== 34) bad('bad STREAMINFO');
      r.u(16); // smallest block
      r.u(16); // largest block
      r.u(24); // smallest frame
      r.u(24); // largest frame
      const sampleRate = r.u(20);
      const channels = r.u(3) + 1;
      const bps = r.u(5) + 1;
      const total = r.u(36);
      info = { sampleRate, channels, bps, total, md5: buf.slice(r.byte, r.byte + 16) };
      if (!sampleRate || bps < 4) bad('bad STREAMINFO');
      if (bps > 24) bad(`${bps}-bit audio is not supported (up to 24)`);
    } else if (!info) bad('STREAMINFO is not the first block');
    r.pos = end * 8;
  }
  if (!info) bad('no STREAMINFO');
  const { channels, bps, total } = info;

  // An encoder writing to a pipe cannot go back to fill in the length (and the
  // MD5): then the frames run to the end of the file, the buffers grow, and the
  // frame CRCs alone vouch for the bits.
  let out = Array.from({ length: channels }, () => new Int32Array(total || 1 << 16));
  let done = 0;
  while (total ? done < total : r.byte < buf.length) {
    const start = r.byte;
    if (r.u(15) !== 0x7ffc) bad(`no frame at byte ${start}`);
    r.u(1); // blocking strategy: frames are read in order, so the number is not needed
    const bsCode = r.u(4);
    const rateCode = r.u(4);
    const chCode = r.u(4);
    const sizeCode = r.u(3);
    if (r.u(1)) bad('reserved bit set in a frame header');
    // the frame/sample number, UTF-8 coded
    const lead = r.u(8);
    const extra = lead < 0x80 ? 0 : lead === 0xfe ? 6 : Math.clz32(~(lead << 24)) - 1;
    if ((extra === 0 && lead >= 0x80) || lead === 0xff) bad('bad frame number');
    for (let i = 0; i < extra; i++) if (r.u(8) >>> 6 !== 2) bad('bad frame number');
    let block = BLOCK_SIZES[bsCode]!;
    if (bsCode === 1) block = 192;
    else if (bsCode === 6) block = r.u(8) + 1;
    else if (bsCode === 7) block = r.u(16) + 1;
    if (!block) bad('reserved block size');
    let rate = rateCode === 0 ? info.sampleRate : RATES[rateCode]!;
    if (rateCode === 12) rate = r.u(8) * 1000;
    else if (rateCode === 13) rate = r.u(16);
    else if (rateCode === 14) rate = r.u(16) * 10;
    else if (rateCode === 15) bad('bad sample rate code');
    if (rate !== info.sampleRate) bad(`a frame is at ${rate} Hz, the stream at ${info.sampleRate} Hz`);
    const frameBps = sizeCode === 0 ? bps : SIZES[sizeCode]!;
    if (!frameBps) bad('reserved sample size');
    if (frameBps !== bps) bad(`a frame has ${frameBps}-bit samples, the stream ${bps}-bit`);
    const frameChannels = chCode < 8 ? chCode + 1 : chCode <= 10 ? 2 : bad('reserved channel assignment');
    if (frameChannels !== channels) bad(`a frame has ${frameChannels} channels, the stream ${channels}`);
    if (r.u(8) !== crc8(buf, start, r.byte - 1)) bad(`frame header CRC mismatch at byte ${start}`);
    if (total && done + block > total) bad('more audio than the stream says it holds');
    if (done + block > out[0]!.length) {
      out = out.map((c) => {
        const grown = new Int32Array(Math.max(c.length * 2, done + block));
        grown.set(c);
        return grown;
      });
    }

    for (let ch = 0; ch < channels; ch++) {
      // the side channel carries one extra bit
      const side = (chCode === 8 && ch === 1) || (chCode === 9 && ch === 0) || (chCode === 10 && ch === 1);
      subframe(r, out[ch]!.subarray(done, done + block), bps + (side ? 1 : 0));
    }
    r.align();
    const end = r.byte;
    if (r.u(16) !== crc16(buf, start, end)) bad(`frame CRC mismatch at byte ${start}`);

    if (chCode >= 8) {
      const a = out[0]!;
      const b = out[1]!;
      for (let i = done; i < done + block; i++) {
        if (chCode === 8) b[i] = a[i]! - b[i]!; // left, side
        else if (chCode === 9) a[i] = a[i]! + b[i]!; // side, right
        else {
          const mid = a[i]! * 2 + (b[i]! & 1); // mid, side
          a[i] = (mid + b[i]!) >> 1;
          b[i] = (mid - b[i]!) >> 1;
        }
      }
    }
    done += block;
  }

  if (!total) out = out.map((c) => c.slice(0, done));
  if (info.md5.some((x) => x !== 0) && !equal(md5Pcm(out, bps), info.md5)) bad('the decoded audio does not match the file’s MD5 signature');

  const scale = 1 / 2 ** (bps - 1);
  return {
    sampleRate: info.sampleRate,
    bitsPerSample: bps,
    channels: out.map((c) => {
      const f = new Float32Array(c.length);
      for (let i = 0; i < c.length; i++) f[i] = c[i]! * scale;
      return f;
    }),
  };
}

function subframe(r: Bits, dst: Int32Array, bps: number): void {
  if (r.u(1)) bad('subframe padding bit set');
  const type = r.u(6);
  let wasted = 0;
  if (r.u(1)) wasted = r.unary() + 1;
  const w = bps - wasted;
  if (w < 1) bad('more wasted bits than sample bits');
  const n = dst.length;
  if (type === 0) {
    dst.fill(r.s(w));
  } else if (type === 1) {
    for (let i = 0; i < n; i++) dst[i] = r.s(w);
  } else if (type >= 8 && type <= 12) {
    const order = type - 8;
    if (order > n) bad('predictor order longer than the block');
    for (let i = 0; i < order; i++) dst[i] = r.s(w);
    residual(r, dst, order);
    predict(dst, FIXED[order]!, 0, w);
  } else if (type >= 32) {
    const order = type - 31;
    if (order > n) bad('predictor order longer than the block');
    for (let i = 0; i < order; i++) dst[i] = r.s(w);
    const precision = r.u(4) + 1;
    if (precision === 16) bad('bad LPC precision');
    const shift = r.s(5);
    if (shift < 0) bad('negative LPC shift');
    // coefs[j] weighs the sample j + 1 back
    const coefs = new Int32Array(order);
    for (let j = 0; j < order; j++) coefs[j] = r.s(precision);
    residual(r, dst, order);
    predict(dst, coefs, shift, w);
  } else {
    bad(`reserved subframe type ${type}`);
  }
  if (wasted) for (let i = 0; i < n; i++) dst[i] = dst[i]! * 2 ** wasted;
}

/**
 * Adds the prediction to the residual in dst[order..]. When the coefficients
 * keep every sum of `w`-bit samples inside 32 bits (the usual case), the fast
 * integer path is exact; otherwise plain numbers are, up to 2^53.
 */
function predict(dst: Int32Array, coefs: Int32Array, shift: number, w: number): void {
  const order = coefs.length;
  const n = dst.length;
  let reach = 0;
  for (let j = 0; j < order; j++) reach += Math.abs(coefs[j]!);
  if (reach * 2 ** (w - 1) < 2 ** 31) {
    for (let i = order; i < n; i++) {
      let p = 0;
      for (let j = 0; j < order; j++) p = (p + Math.imul(coefs[j]!, dst[i - 1 - j]!)) | 0;
      dst[i] = (dst[i]! + (p >> shift)) | 0;
    }
  } else {
    const div = 2 ** shift;
    for (let i = order; i < n; i++) {
      let p = 0;
      for (let j = 0; j < order; j++) p += coefs[j]! * dst[i - 1 - j]!;
      dst[i] = dst[i]! + Math.floor(p / div);
    }
  }
}

/** Rice-coded residual, written into dst[order..]. */
function residual(r: Bits, dst: Int32Array, order: number): void {
  const method = r.u(2);
  if (method > 1) bad('reserved residual coding');
  const paramBits = method === 0 ? 4 : 5;
  const escape = method === 0 ? 15 : 31;
  const partOrder = r.u(4);
  const parts = 1 << partOrder;
  const n = dst.length;
  if (n % parts || n / parts < order) bad('bad residual partitioning');
  let i = order;
  for (let p = 0; p < parts; p++) {
    const end = (p + 1) * (n / parts);
    const k = r.u(paramBits);
    if (k === escape) {
      const raw = r.u(5);
      for (; i < end; i++) dst[i] = raw ? r.s(raw) : 0;
    } else {
      r.rice(dst, i, end, k);
      i = end;
    }
  }
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** MD5 of the interleaved little-endian samples, as FLAC signs them. */
function md5Pcm(ch: Int32Array[], bps: number): Uint8Array {
  const width = Math.ceil(bps / 8);
  const n = ch[0]!.length;
  const bytes = new Uint8Array(n * ch.length * width);
  let at = 0;
  for (let i = 0; i < n; i++) {
    for (const c of ch) {
      const v = c[i]!;
      for (let b = 0; b < width; b++) bytes[at++] = (v >> (8 * b)) & 0xff;
    }
  }
  return md5(bytes);
}

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
const SHIFT = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

/** MD5 (RFC 1321), only for checking a stream's signature. */
export function md5(data: Uint8Array): Uint8Array {
  const len = data.length;
  const padded = new Uint8Array((((len + 8) >>> 6) + 1) * 64);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 2 ** 29), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getUint32(off + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const s = SHIFT[(i >>> 4) * 4 + (i & 3)]!;
      const t = (a + f + K[i]! + m[g]!) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v >>> 0, true));
  return out;
}
