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

/** Throws a ProcMuseError when `condition` is false. */
export function check(condition: unknown, code: ProcMuseErrorCode, message: string): asserts condition {
  if (!condition) throw new ProcMuseError(code, message);
}
