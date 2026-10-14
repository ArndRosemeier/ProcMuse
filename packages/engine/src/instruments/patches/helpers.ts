import type { AdsrSpec } from '../../dsp/envelope.js';

/** Shorthand for an ADSR spec, used by every patch file. */
export function env(attack: number, decay: number, sustain: number, release: number): AdsrSpec {
  return { attack, decay, sustain, release };
}
