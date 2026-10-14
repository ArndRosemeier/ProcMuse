/** Value formatting and slider mapping shared by every control. */
import type { NumberParamSpec } from '@procmuse/engine';

export const SLIDER_STEPS = 1000;

function decimals(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function formatNumber(spec: NumberParamSpec, value: number): string {
  const unitless = spec.min === 0 && spec.max === 1 && !spec.unit;
  if (unitless) return `${Math.round(value * 100)}%`;
  const text = value.toFixed(decimals(spec.step));
  return spec.unit ? `${text} ${spec.unit}` : text;
}

/** Slider position (0..SLIDER_STEPS) → value, honouring log scale and step. */
export function sliderToValue(spec: NumberParamSpec, pos: number): number {
  const t = pos / SLIDER_STEPS;
  let v: number;
  if (spec.scale === 'log' && spec.min > 0) v = spec.min * Math.pow(spec.max / spec.min, t);
  else v = spec.min + (spec.max - spec.min) * t;
  v = Math.round(v / spec.step) * spec.step;
  return Math.min(spec.max, Math.max(spec.min, Number(v.toFixed(10))));
}

export function valueToSlider(spec: NumberParamSpec, value: number): number {
  let t: number;
  if (spec.scale === 'log' && spec.min > 0) t = Math.log(value / spec.min) / Math.log(spec.max / spec.min);
  else t = (value - spec.min) / (spec.max - spec.min || 1);
  return Math.round(Math.min(1, Math.max(0, t)) * SLIDER_STEPS);
}

/**
 * The value one keyboard step away: the next distinct value along the slider
 * (so log scales and coarse steps both move), or a tenth of the travel for a page step.
 */
export function nextSliderValue(spec: NumberParamSpec, value: number, dir: 1 | -1, page = false): number {
  const from = valueToSlider(spec, value);
  if (page) return sliderToValue(spec, Math.min(SLIDER_STEPS, Math.max(0, from + dir * (SLIDER_STEPS / 10))));
  for (let pos = from + dir; pos >= 0 && pos <= SLIDER_STEPS; pos += dir) {
    const v = sliderToValue(spec, pos);
    if (v !== value) return v;
  }
  return value;
}
