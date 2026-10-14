/** Waveshaping: the one place saturation curves live. */

/** Fast tanh approximation (Padé), exact enough for audio, bounded to [-1, 1]. */
export function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** Drive in [0, 1] → pre-gain, with level compensation so drive changes tone more than loudness. */
export function drive(x: number, amount: number): number {
  if (amount <= 0) return x;
  const g = 1 + amount * 8;
  return softClip(x * g) / softClip(g) ;
}
