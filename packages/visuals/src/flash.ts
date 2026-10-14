/**
 * THE flash limiter (photosensitivity safety). Every full-screen brightness
 * flash goes through `stepFlash`; nothing else may add white to the picture.
 *
 * Guarantees (pinned by test/flash.test.ts):
 * - at most `maxPerSecond` flashes are accepted in any rolling one-second
 *   window, and accepted flashes are at least 1/maxPerSecond apart;
 * - the flash level never exceeds `maxLevel` (caps the luminance jump);
 * - the level rises no faster than `maxRisePerSecond` (no hard cut to white).
 */
import { VisualsError } from './errors.js';

export interface FlashConfig {
  maxPerSecond: number;
  maxLevel: number;
  maxRisePerSecond: number;
  /** exponential decay rate of the flash envelope, 1/s */
  decayPerSecond: number;
}

export const FLASH_DEFAULTS: FlashConfig = {
  maxPerSecond: 3,
  maxLevel: 0.6,
  maxRisePerSecond: 8,
  decayPerSecond: 4,
};

export interface FlashState {
  /** limiter clock, seconds */
  clock: number;
  /** current output level 0..maxLevel */
  level: number;
  /** envelope the level follows (slew-limited) */
  envelope: number;
  /** clock times of accepted flashes within the last second */
  accepted: readonly number[];
}

export const initialFlashState = (): FlashState => ({ clock: 0, level: 0, envelope: 0, accepted: [] });

export interface FlashStep {
  state: FlashState;
  level: number;
  /** true when this step's request started a new flash */
  accepted: boolean;
}

/**
 * Advances the limiter by `dt` seconds. `request` (0..1) asks for a flash of
 * that strength this frame; 0 means none. Pure.
 */
export function stepFlash(prev: FlashState, request: number, dt: number, cfg: FlashConfig = FLASH_DEFAULTS): FlashStep {
  const clock = prev.clock + Math.max(0, dt);
  const recent = prev.accepted.filter((t) => clock - t < 1);
  const last = recent.length ? (recent[recent.length - 1] as number) : -Infinity;
  if (!Number.isFinite(request) || !Number.isFinite(dt)) {
    throw new VisualsError('invalid-argument', `stepFlash: request and dt must be finite (got ${request}, ${dt})`);
  }
  const strength = Math.min(1, Math.max(0, request));
  const accepted = strength > 0 && recent.length < cfg.maxPerSecond && clock - last >= 1 / cfg.maxPerSecond;
  let envelope = prev.envelope * Math.exp(-cfg.decayPerSecond * Math.max(0, dt));
  if (accepted) envelope = Math.max(envelope, strength * cfg.maxLevel);
  envelope = Math.min(envelope, cfg.maxLevel);
  const level = Math.min(envelope, prev.level + cfg.maxRisePerSecond * Math.max(0, dt));
  return {
    state: { clock, level, envelope, accepted: accepted ? [...recent, clock] : recent },
    level,
    accepted,
  };
}
