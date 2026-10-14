import type { Patch } from '../patch.js';
import { env } from './helpers.js';

/** Atmospheres, drones and transition effects. */
export const TEXTURE_PATCHES: Patch[] = [
  {
    id: 'texture-wind',
    name: 'Wind',
    category: 'texture',
    description: 'Drifting band-passed noise.',
    poly: 2,
    oscillators: [{ type: 'noise', level: 1, pink: true }],
    filter: { mode: 'bandpass', cutoff: 700, resonance: 0.5, keyTrack: 0.8 },
    lfo: { rate: 0.09, cutoff: 1.5 },
    amp: env(2.5, 1, 0.9, 3),
    level: 0.5,
  },
  {
    id: 'texture-riser',
    name: 'Riser',
    category: 'texture',
    description: 'Noise sweep that rises into a section change.',
    poly: 2,
    oscillators: [{ type: 'noise', level: 1 }],
    filter: { mode: 'bandpass', cutoff: 300, resonance: 0.4, envAmount: 5, env: env(3.5, 0.1, 1, 0.3) },
    amp: env(3, 0.1, 1, 0.25),
    level: 0.35,
  },
  {
    id: 'texture-drone',
    name: 'Drone',
    category: 'texture',
    description: 'Deep evolving drone.',
    poly: 2,
    oscillators: [
      { type: 'wave', wave: 'saw', level: 0.6, unison: 3, spread: 20 },
      { type: 'wave', wave: 'sine', level: 0.5, octave: -1 },
    ],
    filter: { mode: 'lowpass', cutoff: 350, resonance: 0.3 },
    lfo: { rate: 0.05, cutoff: 1 },
    amp: env(3, 1, 0.9, 4),
    level: 0.35,
  },
  {
    id: 'texture-sparkle',
    name: 'Sparkle',
    category: 'texture',
    description: 'Tiny high glints scattered over the mix.',
    poly: 6,
    oscillators: [{ type: 'fm', level: 1, ratio: 9, index: 1.5, indexEnv: 2, indexDecay: 0.05 }],
    amp: env(0.001, 0.3, 0, 0.3),
    level: 0.2,
  },
];
