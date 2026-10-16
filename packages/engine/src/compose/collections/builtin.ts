import type { Collection } from '../collection.js';

/**
 * The instrument collections: which recorded instruments may take over each
 * part. A part lists every instrument that suits it; the casting picks the one
 * closest to the style's own instrument for that part.
 */
export const BUILTIN_COLLECTIONS: Collection[] = [
  {
    id: 'broad',
    name: 'Broad Spectrum',
    description: 'The best of every section: piano, strings, brass, winds, harp, mallets and orchestral drums.',
    parts: {
      kick: ['real-bass-drum'],
      snare: ['real-snare'],
      hats: ['real-shaker'],
      perc: ['real-timpani', 'real-big-drum'],
      bass: ['real-basses-pizz', 'real-cellos-pizz', 'real-tuba', 'real-piano'],
      chords: ['real-piano', 'real-violins', 'real-horn', 'real-organ'],
      pad: ['real-violins', 'real-cellos', 'real-horn', 'real-organ'],
      arp: ['real-harp', 'real-marimba', 'real-violins-pizz', 'real-glockenspiel'],
      lead: ['real-solo-violin', 'real-flute', 'real-trumpet', 'real-oboe'],
      texture: ['real-cellos', 'real-gong'],
    },
  },
  {
    id: 'strings',
    name: 'Strings',
    description: 'A string orchestra: violins, violas, cellos, double basses, pizzicato and harp.',
    parts: {
      bass: ['real-basses-pizz', 'real-cellos-pizz', 'real-basses'],
      chords: ['real-violins', 'real-violas', 'real-violins-pizz'],
      pad: ['real-violins', 'real-violas', 'real-cellos'],
      arp: ['real-harp', 'real-violins-pizz'],
      lead: ['real-solo-violin', 'real-violins'],
      texture: ['real-cellos', 'real-basses'],
    },
  },
  {
    id: 'brass',
    name: 'Brass',
    description: 'Trumpet, French horn, trombone and tuba.',
    parts: {
      bass: ['real-tuba', 'real-trombone'],
      chords: ['real-horn', 'real-trombone', 'real-trumpet'],
      pad: ['real-horn', 'real-trombone'],
      arp: ['real-trumpet'],
      lead: ['real-trumpet', 'real-horn'],
      texture: ['real-tuba', 'real-horn'],
    },
  },
  {
    id: 'woodwinds',
    name: 'Woodwinds',
    description: 'Flute, oboe, clarinet and bassoon.',
    parts: {
      bass: ['real-bassoon'],
      chords: ['real-clarinet', 'real-bassoon'],
      pad: ['real-clarinet', 'real-flute'],
      arp: ['real-flute', 'real-clarinet'],
      lead: ['real-flute', 'real-oboe', 'real-clarinet'],
      texture: ['real-bassoon'],
    },
  },
  {
    id: 'keys',
    name: 'Keys & Mallets',
    description: 'Upright piano, church organ, marimba, xylophone and glockenspiel.',
    parts: {
      bass: ['real-piano'],
      chords: ['real-piano', 'real-organ'],
      pad: ['real-organ'],
      arp: ['real-marimba', 'real-xylophone', 'real-glockenspiel', 'real-piano'],
      lead: ['real-piano', 'real-xylophone', 'real-glockenspiel'],
      texture: ['real-organ'],
    },
  },
  {
    id: 'percussion',
    name: 'Orchestral Percussion',
    description: 'Concert bass drum, snare, shaker, timpani, a giant drum, claves and a gong.',
    parts: {
      kick: ['real-bass-drum'],
      snare: ['real-snare'],
      hats: ['real-shaker'],
      perc: ['real-timpani', 'real-big-drum', 'real-claves'],
      texture: ['real-gong'],
    },
  },
];
