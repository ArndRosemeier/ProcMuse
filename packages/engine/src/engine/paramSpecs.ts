/** Every engine parameter, declared once. The UI, presets and host apps all read this list. */
import type { ParamSpec } from '../core/params.js';
import { PART_IDS, PART_INFO, type PartId } from '../compose/parts.js';
import { DEFAULT_STYLE_ID, STYLES, getStyle } from '../compose/styles.js';
import { patchesIn } from '../instruments/registry.js';
import { PITCH_CLASS_NAMES } from '../theory/pitch.js';
import { SCALE_LABELS, SCALE_NAMES } from '../theory/scale.js';

export const DELAY_DIVISIONS = ['1/8', '3/16', '1/4', '3/8', '1/2'] as const;
export const DELAY_BEATS: Record<(typeof DELAY_DIVISIONS)[number], number> = {
  '1/8': 0.5,
  '3/16': 0.75,
  '1/4': 1,
  '3/8': 1.5,
  '1/2': 2,
};

/** Seeds are whole numbers in [0, SEED_LIMIT). */
export const SEED_LIMIT = 1_000_000;

/**
 * The one way to turn any 32-bit number into a valid seed. The engine feeds
 * it a hash (New idea stays deterministic); a host feeds it real entropy so
 * each fresh start composes something new.
 */
export function seedFrom(entropy: number): number {
  return (entropy >>> 0) % SEED_LIMIT;
}

/** How long a style plays before the music moves on to another one on its own (in bars; null stays). */
export const JOURNEY_BARS = { never: null, rarely: 128, sometimes: 64, often: 32 } as const satisfies Record<string, number | null>;
export type JourneyPace = keyof typeof JOURNEY_BARS;
const JOURNEY_LABELS: Record<JourneyPace, string> = { never: 'Never', rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often' };

/** Param ids, so no other module spells them by hand. */
export const P = {
  style: 'music.style',
  journey: 'music.journey',
  seed: 'music.seed',
  tempo: 'music.tempo',
  key: 'music.key',
  scale: 'music.scale',
  energy: 'music.energy',
  complexity: 'music.complexity',
  variation: 'music.variation',
  swing: 'music.swing',
  humanize: 'music.humanize',
  brightness: 'sound.brightness',
  space: 'sound.space',
  reverbSize: 'fx.reverbSize',
  reverbDamping: 'fx.reverbDamping',
  delayTime: 'fx.delayTime',
  delayFeedback: 'fx.delayFeedback',
  duck: 'fx.duck',
  volume: 'master.volume',
  part: (part: PartId, field: 'mode' | 'instrument' | 'level' | 'pan' | 'reverb' | 'delay') => `part.${part}.${field}`,
} as const;

const unit = (id: string, label: string, description: string, group: string, def: number, advanced = false): ParamSpec => ({
  kind: 'number',
  id,
  label,
  description,
  group,
  min: 0,
  max: 1,
  step: 0.01,
  default: def,
  advanced,
});

export function buildParamSpecs(): ParamSpec[] {
  const style = getStyle(DEFAULT_STYLE_ID);
  const specs: ParamSpec[] = [
    {
      kind: 'enum',
      id: P.style,
      label: 'Style',
      description: 'The genre: sets instruments, rhythms, harmony and tempo.',
      group: 'Music',
      options: STYLES.map((s) => ({ value: s.id, label: s.name, description: s.description })),
      default: DEFAULT_STYLE_ID,
    },
    {
      kind: 'enum',
      id: P.journey,
      label: 'Style changes',
      description: 'How often the music moves on to a new style by itself: each style ends with an outro, then another begins. Never keeps the chosen style.',
      group: 'Music',
      options: (Object.keys(JOURNEY_BARS) as JourneyPace[]).map((k) => ({
        value: k,
        label: JOURNEY_LABELS[k],
        description: JOURNEY_BARS[k] === null ? 'Stay in the chosen style.' : `A new style about every ${JOURNEY_BARS[k]} bars.`,
      })),
      default: 'sometimes',
    },
    {
      kind: 'number',
      id: P.seed,
      label: 'Seed',
      description: 'The random seed. The same seed and settings always produce the same music. A fresh start picks a new one.',
      group: 'Music',
      min: 0,
      max: SEED_LIMIT - 1,
      step: 1,
      default: 4096,
    },
    {
      kind: 'number',
      id: P.tempo,
      label: 'Tempo',
      description: 'Speed in beats per minute.',
      group: 'Music',
      min: 50,
      max: 200,
      step: 1,
      default: style.tempo.default,
      unit: 'BPM',
    },
    {
      kind: 'enum',
      id: P.key,
      label: 'Key',
      description: 'The tonal centre. Auto picks one from the seed.',
      group: 'Music',
      options: [{ value: 'auto', label: 'Auto' }, ...PITCH_CLASS_NAMES.map((n) => ({ value: n, label: n }))],
      default: 'auto',
    },
    {
      kind: 'enum',
      id: P.scale,
      label: 'Scale',
      description: 'The mode and mood. Auto lets the style choose.',
      group: 'Music',
      options: [{ value: 'auto', label: 'Auto' }, ...SCALE_NAMES.map((n) => ({ value: n, label: SCALE_LABELS[n] }))],
      default: 'auto',
    },
    unit(P.energy, 'Energy', 'How intense the music is: more parts, louder sections, more drops.', 'Feel', 0.6),
    unit(P.complexity, 'Complexity', 'How busy and rich: denser rhythms, extended chords, longer arpeggios.', 'Feel', 0.5),
    unit(P.variation, 'Variation', 'How often new ideas replace familiar ones.', 'Feel', 0.4),
    unit(P.swing, 'Swing', 'Shuffle feel on the off-beats.', 'Feel', style.swing),
    unit(P.humanize, 'Humanize', 'Small timing and velocity imperfections.', 'Feel', 0.2),
    unit(P.brightness, 'Brightness', 'Opens or closes every filter: dark and muffled to bright and crisp.', 'Sound', 0.5),
    unit(P.space, 'Space', 'How much reverb and echo surround the sound.', 'Sound', 0.5),
    unit(P.reverbSize, 'Reverb size', 'From a small room to a huge hall.', 'Effects', style.fx.reverbSize, true),
    unit(P.reverbDamping, 'Reverb damping', 'Darker reverb tails at higher values.', 'Effects', 0.45, true),
    {
      kind: 'enum',
      id: P.delayTime,
      label: 'Echo time',
      description: 'Echo length, synced to the tempo.',
      group: 'Effects',
      options: DELAY_DIVISIONS.map((d) => ({ value: d, label: d })),
      default: '3/16',
      advanced: true,
    },
    unit(P.delayFeedback, 'Echo repeats', 'How long echoes keep repeating.', 'Effects', 0.4, true),
    unit(P.duck, 'Pump', 'Sidechain pumping: the kick pushes the other parts down.', 'Effects', style.fx.duck),
    {
      kind: 'number',
      id: P.volume,
      label: 'Volume',
      description: 'Master output level.',
      group: 'Master',
      min: -40,
      max: 6,
      step: 0.5,
      default: -3,
      unit: 'dB',
    },
  ];

  for (const part of PART_IDS) {
    const info = PART_INFO[part];
    const ps = style.parts[part];
    const group = `Part: ${info.label}`;
    specs.push(
      {
        kind: 'enum',
        id: P.part(part, 'mode'),
        label: `${info.label} mode`,
        description: `${info.description} Auto lets the arrangement decide when it plays.`,
        group,
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'on', label: 'Always' },
          { value: 'off', label: 'Mute' },
        ],
        default: 'auto',
      },
      {
        kind: 'enum',
        id: P.part(part, 'instrument'),
        label: `${info.label} instrument`,
        description: `The instrument playing the ${info.label.toLowerCase()} part.`,
        group,
        options: patchesIn(info.categories).map((p) => ({ value: p.id, label: p.name, description: p.description })),
        default: ps.instrument,
      },
      {
        kind: 'number',
        id: P.part(part, 'level'),
        label: `${info.label} level`,
        description: `Loudness of the ${info.label.toLowerCase()} part.`,
        group,
        min: -40,
        max: 6,
        step: 0.5,
        default: ps.level,
        unit: 'dB',
      },
      {
        kind: 'number',
        id: P.part(part, 'pan'),
        label: `${info.label} pan`,
        description: 'Position from left (-1) to right (+1).',
        group,
        min: -1,
        max: 1,
        step: 0.01,
        default: ps.pan,
        advanced: true,
      },
      unit(P.part(part, 'reverb'), `${info.label} reverb`, 'Amount sent to the reverb.', group, ps.reverb, true),
      unit(P.part(part, 'delay'), `${info.label} echo`, 'Amount sent to the echo.', group, ps.delay, true),
    );
  }
  return specs;
}

/** The parameter values a style implies; applied when the style changes. */
export function styleDefaults(styleId: string): Record<string, number | string> {
  const s = getStyle(styleId);
  const v: Record<string, number | string> = {
    [P.tempo]: s.tempo.default,
    [P.swing]: s.swing,
    [P.reverbSize]: s.fx.reverbSize,
    [P.duck]: s.fx.duck,
    [P.delayTime]: DELAY_DIVISIONS.reduce((best, d) =>
      Math.abs(DELAY_BEATS[d] - s.fx.delayBeats) < Math.abs(DELAY_BEATS[best] - s.fx.delayBeats) ? d : best,
    ),
  };
  for (const part of PART_IDS) {
    const ps = s.parts[part];
    v[P.part(part, 'instrument')] = ps.instrument;
    v[P.part(part, 'level')] = ps.level;
    v[P.part(part, 'pan')] = ps.pan;
    v[P.part(part, 'reverb')] = ps.reverb;
    v[P.part(part, 'delay')] = ps.delay;
  }
  return v;
}
