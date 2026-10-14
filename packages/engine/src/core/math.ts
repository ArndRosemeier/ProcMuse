/** Small numeric helpers shared by DSP, composer and state tracking. */
export const TAU = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
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

/** Coefficient for a one-pole smoother reaching ~63% in `seconds`. */
export function onePoleCoef(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1;
  return 1 - Math.exp(-1 / (seconds * sampleRate));
}
