/**
 * The one error type @procmuse/visuals throws. It extends the engine's
 * ProcMuseError (code `internal` for GPU failures, `invalid-argument` for bad
 * input) so the app's single error surface handles both packages the same way;
 * `reason` carries the visuals-specific cause.
 */
import { ProcMuseError } from '@procmuse/engine';

export type VisualsErrorReason =
  | 'no-webgl2'
  | 'shader-compile'
  | 'shader-link'
  | 'gl-resource'
  | 'framebuffer'
  | 'disposed'
  | 'invalid-argument';

export class VisualsError extends ProcMuseError {
  readonly reason: VisualsErrorReason;
  constructor(reason: VisualsErrorReason, message: string) {
    super(reason === 'invalid-argument' ? 'invalid-argument' : 'internal', message);
    this.name = 'VisualsError';
    this.reason = reason;
  }
}
