// The recordings ProcMuse ships, taken from VS Chamber Orchestra: Community Edition (CC0).
// Each entry becomes one sample set (one FLAC file plus its zones in samples/index.json).
//
//   dir      folder inside the VSCO-2-CE checkout
//   pick     regex over file names; group `note` is a note name (A#2) or `idx` a number
//   notes    'name'   : root from the file name, octave corrected by pitch detection
//            {base, step}: root = base + step * idx (a mapping chart), verified by ear
//            'detect' : root from pitch detection alone (files not named by note)
//            <number> : unpitched, played at this MIDI note
//   kind     'sustain' (looped) or 'oneshot'
//   tolerance cents a recording may differ from its name (default 35; a piano's stretched top needs more)
//   seconds  longest kept per zone
//   spacing  minimum semitones between kept zones (fewer zones, smaller download)
export const VSCO = {
  name: 'VS Chamber Orchestra: Community Edition',
  url: 'https://github.com/sgossner/VSCO-2-CE',
  commit: '440300901dfe9275fd84e0b7763af1f8443ae62e',
  license: 'CC0 1.0 Universal (public domain)',
  credit: 'Recorded by Sam Gossner, Simon Dalzell and others; Versilian Studios.',
};

export const SOURCES = [
  // strings
  { id: 'vsco-violins', dir: 'Strings/Violin Section/susVib', pick: /_(?<note>[A-G]#?\d)_v2\.wav$/, notes: 'name', kind: 'sustain', seconds: 3.2, spacing: 3 },
  { id: 'vsco-violas', dir: 'Strings/Viola Section/susvib', pick: /_(?<note>[A-G]#?\d)_v2_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3.2, spacing: 3 },
  { id: 'vsco-cellos', dir: 'Strings/Cello Section/susvib', pick: /_(?<note>[A-G]#?\d)_v1_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3.2, spacing: 3 },
  { id: 'vsco-basses', dir: 'Strings/Solo Contrabass/SusVib', pick: /_(?<note>[A-G]#?\d)_v3_rr1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3.2, spacing: 3 },
  { id: 'vsco-violins-pizz', dir: 'Strings/Violin Section/Pizz', pick: /_(?<note>[A-G]#?\d)_v2_rr1\.wav$/, notes: 'name', kind: 'oneshot', seconds: 1.4, spacing: 3 },
  { id: 'vsco-cellos-pizz', dir: 'Strings/Cello Section/pizzT', pick: /_(?<note>[A-G]#?\d)_v2_RR1\.wav$/, notes: 'name', kind: 'oneshot', seconds: 1.6, spacing: 3 },
  { id: 'vsco-basses-pizz', dir: 'Strings/Solo Contrabass/Pizz', pick: /_(?<note>[A-G]#?\d)_v3_rr1\.wav$/, notes: 'name', kind: 'oneshot', seconds: 1.8, spacing: 3 },
  { id: 'vsco-solo-violin', dir: 'Strings/Solo Violin/Arco Vib', pick: /_(?<note>[A-G]#?\d)_f\.wav$/, notes: 'name', kind: 'sustain', seconds: 3.2, spacing: 3 },
  { id: 'vsco-harp', dir: 'Strings/Harp', pick: /_(?<note>[A-G]#?\d)_(mf|f|mp)\.wav$/, notes: 'name', kind: 'oneshot', seconds: 3, spacing: 3 },
  // brass
  { id: 'vsco-trumpet', dir: 'Brass/Trumpet/susvib', pick: /_(?<note>[A-G]#?\d)_v2_rr1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-horn', dir: 'Brass/F Horn/sus', pick: /_(?<note>[A-G]#?\d)_v2_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-trombone', dir: 'Brass/Tenor Trombone/sus', pick: /_(?<note>[A-G]#?\d)_v2_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-tuba', dir: 'Brass/Tuba/sus', pick: /_(?<note>[A-G]#?\d)_v2_rr1_Mid\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  // woodwinds
  { id: 'vsco-flute', dir: 'Woodwinds/Flute/susvib', pick: /_(?<note>[A-G]#?\d)_v1_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-oboe', dir: 'Woodwinds/Oboe/Vib', pick: /_(?<note>[A-G]#?\d)_v1_Main\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-clarinet', dir: 'Woodwinds/Clarinet/susLong', pick: /_(?<note>[A-G]#?\d)_v2_rr1_sum\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  { id: 'vsco-bassoon', dir: 'Woodwinds/Bassoon/sus', pick: /_(?<note>[A-G]#?\d)_v1_1\.wav$/, notes: 'name', kind: 'sustain', seconds: 3, spacing: 3 },
  // keys and mallets
  { id: 'vsco-piano', dir: 'Keys/Upright Piano', pick: /^Player_dyn2_rr1_(?<idx>\d+)\.wav$/, notes: { base: 21, step: 2 }, tolerance: 60, kind: 'oneshot', seconds: 3.5, spacing: 3 },
  { id: 'vsco-organ', dir: 'Keys/Organ/Loud', pick: /^Rode_Man3Open_(?<idx>\d+)\.wav$/, notes: { base: 35, step: 1 }, kind: 'sustain', seconds: 2.4, spacing: 3 },
  { id: 'vsco-marimba', dir: 'Percussion/Marimba', pick: /_(?<note>[A-G]#?\d)_loud_01\.wav$/, notes: 'name', kind: 'oneshot', seconds: 1.6, spacing: 3 },
  { id: 'vsco-xylophone', dir: 'Percussion/Xylo', pick: /_(?<note>[A-G]#?\d)_ff_01_far\.wav$/, notes: 'name', kind: 'oneshot', seconds: 1.2, spacing: 3 },
  { id: 'vsco-glockenspiel', dir: 'Percussion/Glock', pick: /_(?<note>[A-G]#?\d)\.wav$/, notes: 'name', kind: 'oneshot', seconds: 2.5, spacing: 3 },
  // percussion
  { id: 'vsco-timpani', dir: 'Percussion/Timpani', pick: /^Timpani(?<idx>\d)_Hit_v3_rr1_Sum\.wav$/, notes: 'detect', kind: 'oneshot', seconds: 2.5, spacing: 1 },
  { id: 'vsco-bass-drum', dir: 'VSCO 1 Percussion/drums/bass', pick: /^bdrum_ff_1\.wav$/, notes: 36, kind: 'oneshot', seconds: 2 },
  { id: 'vsco-snare', dir: 'VSCO 1 Percussion/drums/snare/drum1', pick: /^snare1_f_1\.wav$/, notes: 38, kind: 'oneshot', seconds: 0.9 },
  { id: 'vsco-shaker', dir: "VSCO 1 Percussion/varWood/Camo's Shaker", pick: /^shake3\.wav$/, notes: 42, kind: 'oneshot', seconds: 0.5 },
  { id: 'vsco-big-drum', dir: 'VSCO 1 Percussion/drums/other/ethnic/giant/mallet', pick: /^EthnicLargeMallet_hit_ff_1\.wav$/, notes: 45, kind: 'oneshot', seconds: 2 },
  { id: 'vsco-claves', dir: 'VSCO 1 Percussion/varWood', pick: /^claves_mf\.wav$/, notes: 75, kind: 'oneshot', seconds: 0.4 },
  { id: 'vsco-gong', dir: 'VSCO 1 Percussion/varMetal/Gong', pick: /^gong_hit_ff\.wav$/, notes: 48, kind: 'oneshot', seconds: 7 },
];
