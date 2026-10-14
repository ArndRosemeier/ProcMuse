/**
 * Every visuals parameter, declared once with the engine's ParamSpec type so
 * the same generated UI controls music and visuals. Ids are spelled only here
 * (everyone else uses V); `readSettings` is the one place values become a
 * typed VisualSettings.
 */
import type { ParamSpec, ParamStore } from '@procmuse/engine';
import { VisualsError } from './errors.js';
import { PALETTES, type PaletteId } from './palettes.js';
import { SCENES, type SceneId } from './scenes/registry.js';

export const V = {
  scene: 'visual.scene',
  speed: 'visual.speed',
  intensity: 'visual.intensity',
  reactivity: 'visual.reactivity',
  palette: 'visual.palette',
  detail: 'visual.detail',
  grain: 'visual.grain',
  quality: 'visual.quality',
  reduceMotion: 'visual.reduceMotion',
  flashes: 'visual.flashes',
  shake: 'visual.shake',
  crossfade: 'visual.crossfade',
} as const;

export const QUALITY_LEVELS = [
  { id: 'auto', label: 'Automatic', description: 'Adjusts the resolution on the fly to keep the animation smooth.' },
  { id: 'low', label: 'Low', description: 'Renders at about 40% resolution: fastest, softest picture.' },
  { id: 'medium', label: 'Medium', description: 'Renders at about 65% resolution: a balance of speed and sharpness.' },
  { id: 'high', label: 'High', description: 'Renders at full resolution: sharpest, needs a strong graphics chip.' },
] as const;
export type QualityId = (typeof QUALITY_LEVELS)[number]['id'];

export type SceneChoice = 'auto' | SceneId;

/** Typed snapshot of the visuals parameters. */
export interface VisualSettings {
  scene: SceneChoice;
  speed: number;
  intensity: number;
  reactivity: number;
  palette: PaletteId;
  detail: number;
  grain: number;
  quality: QualityId;
  reduceMotion: boolean;
  flashes: boolean;
  shake: number;
  crossfade: number;
}

export interface VisualSpecOptions {
  /** Default for "Reduce motion"; hosts pass the user's prefers-reduced-motion setting. */
  reduceMotionDefault?: boolean;
}

const GROUP = 'Visuals';
const GROUP_SAFETY = 'Visuals: Comfort';

export function buildVisualParamSpecs(options: VisualSpecOptions = {}): ParamSpec[] {
  return [
    {
      kind: 'enum',
      id: V.scene,
      label: 'Scene',
      description: 'Which animation plays; Automatic changes scene when the music moves to a new section.',
      group: GROUP,
      options: [
        { value: 'auto', label: 'Automatic', description: 'Follow the song: a new scene at section changes, the tunnel on drops.' },
        ...SCENES.map((s) => ({ value: s.id, label: s.label, description: s.description })),
      ],
      default: 'auto',
    },
    {
      kind: 'number',
      id: V.speed,
      label: 'Speed',
      description: 'How fast the camera travels and the shapes move.',
      group: GROUP,
      min: 0,
      max: 2,
      step: 0.01,
      default: 1,
      unit: '×',
    },
    {
      kind: 'number',
      id: V.intensity,
      label: 'Brightness',
      description: 'How bright and glowing the animation is overall.',
      group: GROUP,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.5,
    },
    {
      kind: 'number',
      id: V.reactivity,
      label: 'Music reactivity',
      description: 'How strongly the beat, the instruments and the song energy drive the animation.',
      group: GROUP,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.7,
    },
    {
      kind: 'enum',
      id: V.palette,
      label: 'Colours',
      description: 'The colour palette; Follow the chords shifts colour with the harmony.',
      group: GROUP,
      options: PALETTES.map((p) => ({ value: p.id, label: p.label, description: p.description })),
      default: 'chord',
    },
    {
      kind: 'number',
      id: V.detail,
      label: 'Detail',
      description: 'How much geometric detail the scenes compute; lower is faster.',
      group: GROUP,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.6,
    },
    {
      kind: 'number',
      id: V.grain,
      label: 'Film grain',
      description: 'Amount of flickering film grain over the picture.',
      group: GROUP,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.35,
    },
    {
      kind: 'enum',
      id: V.quality,
      label: 'Quality',
      description: 'Rendering resolution; Automatic lowers it when the animation starts to stutter.',
      group: GROUP,
      options: QUALITY_LEVELS.map((q) => ({ value: q.id, label: q.label, description: q.description })),
      default: 'auto',
    },
    {
      kind: 'bool',
      id: V.reduceMotion,
      label: 'Reduce motion',
      description: 'Slows all movement and turns off flashes, camera punches and shaking.',
      group: GROUP_SAFETY,
      default: options.reduceMotionDefault ?? false,
    },
    {
      kind: 'bool',
      id: V.flashes,
      label: 'Flashes',
      description: 'Allows white flashes at section changes, limited to at most three per second.',
      group: GROUP_SAFETY,
      default: false,
    },
    {
      kind: 'number',
      id: V.shake,
      label: 'Camera shake',
      description: 'How much the picture jolts on snare hits; off while Reduce motion is on.',
      group: GROUP_SAFETY,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.25,
      advanced: true,
    },
    {
      kind: 'number',
      id: V.crossfade,
      label: 'Scene fade time',
      description: 'How many seconds a change of scene takes to blend over.',
      group: GROUP,
      min: 0.5,
      max: 8,
      step: 0.1,
      default: 2,
      unit: 's',
      advanced: true,
    },
  ];
}

function enumValue<T extends string>(store: ParamStore, id: string, allowed: readonly T[]): T {
  const v = store.string(id);
  if (!(allowed as readonly string[]).includes(v)) throw new VisualsError('invalid-argument', `${id}: unknown value ${v}`);
  return v as T;
}

/** Reads the visuals parameters out of a store into a typed snapshot. Throws on a store without them. */
export function readSettings(store: ParamStore): VisualSettings {
  return {
    scene: enumValue<SceneChoice>(store, V.scene, ['auto', ...SCENES.map((s) => s.id)]),
    speed: store.number(V.speed),
    intensity: store.number(V.intensity),
    reactivity: store.number(V.reactivity),
    palette: enumValue<PaletteId>(store, V.palette, PALETTES.map((p) => p.id)),
    detail: store.number(V.detail),
    grain: store.number(V.grain),
    quality: enumValue<QualityId>(store, V.quality, QUALITY_LEVELS.map((q) => q.id)),
    reduceMotion: store.bool(V.reduceMotion),
    flashes: store.bool(V.flashes),
    shake: store.number(V.shake),
    crossfade: store.number(V.crossfade),
  };
}
