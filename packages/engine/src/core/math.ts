/** Small numeric helpers shared by DSP, composer and state tracking. */
export const TAU = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

/** Equal-power pan: returns [left, right] gains for pan in [-1, 1]. */
export function panGains(pan: number): [number, number] {
  const a = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * Per-step gain that falls 60 dB in `seconds` when applied `stepsPerSecond`
 * times a second: THE decay-time formula (oscillator fades, plucked strings,
 * reverb loops).
 */
export function t60Gain(seconds: number, stepsPerSecond: number): number {
  return Math.pow(10, -3 / (seconds * stepsPerSecond));
}

/** Coefficient for a one-pole smoother reaching ~63% in `seconds`. */
export function onePoleCoef(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1;
  return 1 - Math.exp(-1 / (seconds * sampleRate));
}
