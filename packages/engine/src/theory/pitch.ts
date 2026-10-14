/** Pitch helpers. MIDI note numbers are the engine's pitch unit (69 = A4 = 440 Hz). */
export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type PitchClassName = (typeof PITCH_CLASS_NAMES)[number];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${PITCH_CLASS_NAMES[pitchClass(m)]}${Math.floor(m / 12) - 1}`;
}
