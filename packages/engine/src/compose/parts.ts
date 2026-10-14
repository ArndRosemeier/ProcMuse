/** The parts (tracks) of the band. One table: composer, mixer, params and UI all read it. */
import type { PatchCategory } from '../instruments/patch.js';

export const PART_IDS = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'arp', 'lead', 'texture'] as const;
export type PartId = (typeof PART_IDS)[number];

export interface PartInfo {
  label: string;
  description: string;
  /** patch categories this part may play */
  categories: PatchCategory[];
  /** is this part pushed down by the kick (sidechain)? */
  ducked: boolean;
}

export const PART_INFO: Record<PartId, PartInfo> = {
  kick: { label: 'Kick', description: 'The bass drum: the pulse of the track.', categories: ['kick'], ducked: false },
  snare: { label: 'Snare', description: 'Snares and claps on the backbeat.', categories: ['snare'], ducked: false },
  hats: { label: 'Hats', description: 'Hi-hats and shakers: the fast rhythm.', categories: ['hat'], ducked: false },
  perc: { label: 'Percussion', description: 'Toms, congas, blocks and bells for groove.', categories: ['perc'], ducked: false },
  bass: { label: 'Bass', description: 'The bass line.', categories: ['bass'], ducked: true },
  chords: { label: 'Chords', description: 'Rhythmic or sustained harmony.', categories: ['keys', 'pad', 'strings', 'brass', 'pluck'], ducked: true },
  pad: { label: 'Pad', description: 'Long, soft background harmony.', categories: ['pad', 'strings', 'texture'], ducked: true },
  arp: { label: 'Arpeggio', description: 'Broken chords in fast patterns.', categories: ['pluck', 'bell', 'keys', 'lead'], ducked: true },
  lead: { label: 'Lead', description: 'The melody.', categories: ['lead', 'bell', 'brass', 'keys', 'pluck', 'strings'], ducked: false },
  texture: { label: 'Texture', description: 'Atmospheres, drones and risers.', categories: ['texture'], ducked: true },
};

export const PART_INDEX: Record<PartId, number> = Object.fromEntries(PART_IDS.map((p, i) => [p, i])) as Record<PartId, number>;
