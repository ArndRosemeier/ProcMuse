/**
 * Render resolution. Fixed levels map to a scale of the canvas size; `auto`
 * runs a small pure controller on measured frame intervals.
 */
import type { QualityId } from './params.js';

export const QUALITY_SCALE: Record<Exclude<QualityId, 'auto'>, number> = { low: 0.4, medium: 0.65, high: 1 };

export const AUTO_MIN_SCALE = 0.3;
export const AUTO_MAX_SCALE = 1;

export interface AutoQualityState {
  scale: number;
  /** smoothed frame interval, seconds */
  avgDt: number;
  /** seconds until the next adjustment is allowed */
  cooldown: number;
  /** seconds the frame rate has been comfortably fast */
  goodFor: number;
}

export const initialAutoQuality = (): AutoQualityState => ({ scale: 0.65, avgDt: 1 / 60, cooldown: 1, goodFor: 0 });

const SLOW = 1 / 48;
const FAST = 1 / 57;

/**
 * Feeds one measured frame interval. Intervals over 0.25 s (tab in background,
 * debugger) are not measurements of render cost and leave the state unchanged.
 */
export function stepAutoQuality(prev: AutoQualityState, frameDt: number): AutoQualityState {
  if (!(frameDt > 0) || frameDt > 0.25) return prev;
  const avgDt = prev.avgDt + (frameDt - prev.avgDt) * 0.1;
  const cooldown = Math.max(0, prev.cooldown - frameDt);
  const goodFor = avgDt < FAST ? prev.goodFor + frameDt : 0;
  let scale = prev.scale;
  let nextCooldown = cooldown;
  let nextGood = goodFor;
  if (cooldown === 0 && avgDt > SLOW && scale > AUTO_MIN_SCALE) {
    scale = Math.max(AUTO_MIN_SCALE, scale * 0.85);
    nextCooldown = 0.75;
  } else if (cooldown === 0 && goodFor > 2 && scale < AUTO_MAX_SCALE) {
    scale = Math.min(AUTO_MAX_SCALE, scale * 1.08);
    nextCooldown = 1;
    nextGood = 0;
  }
  return { scale, avgDt, cooldown: nextCooldown, goodFor: nextGood };
}

/** The resolution scale to render scenes at. */
export function resolutionScale(quality: QualityId, auto: AutoQualityState): number {
  return quality === 'auto' ? auto.scale : QUALITY_SCALE[quality];
}
