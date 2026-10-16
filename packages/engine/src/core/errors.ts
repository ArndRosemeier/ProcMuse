/**
 * The one error type the engine throws. Every failure is loud: callers get a
 * ProcMuseError with a stable machine-readable `code`, never a silent default.
 */
export type ProcMuseErrorCode =
  | 'unknown-param'
  | 'invalid-param-value'
  | 'invalid-patch'
  | 'invalid-style'
  | 'invalid-message'
  | 'invalid-collection'
  | 'invalid-samples'
  | 'missing-samples'
  | 'invalid-argument'
  | 'internal';

export class ProcMuseError extends Error {
  readonly code: ProcMuseErrorCode;
  constructor(code: ProcMuseErrorCode, message: string) {
    super(message);
    this.name = 'ProcMuseError';
    this.code = code;
  }
}

/**
 * Throws a ProcMuseError when `condition` is false.
 *
 * Validators (patch, style, collection, sample set, sample index) each keep a
 * one-line local `bad()` that prefixes the subject ("patch x: ..."). Folding them
 * into one helper would still leave a per-file adapter for the prefix, so they
 * stay; the duplicate finder lists them, and this note is why.
 */
export function check(condition: unknown, code: ProcMuseErrorCode, message: string): asserts condition {
  if (!condition) throw new ProcMuseError(code, message);
}
