import { partRecord, type MusicState } from '@procmuse/engine';
import { buildVisualParamSpecs, readSettings, type VisualSettings } from '../src/params.js';
import { ParamStore } from '@procmuse/engine';

const zeros = () => partRecord(() => 0);

export function musicState(over: Partial<MusicState> = {}): MusicState {
  return {
    time: 0,
    tempo: 120,
    bar: 0,
    beat: 0,
    beatPhase: 0,
    barPhase: 0,
    section: { kind: 'groove', index: 1, energy: 0.5, progress: 0.2, bars: 8 },
    chord: { root: 0, name: 'C', key: 'C', hue: 0.2 },
    hits: zeros(),
    levels: zeros(),
    master: 0.5,
    intensity: 0.5,
    melody: 0.5,
    noteCount: 0,
    ...over,
  };
}

export function settings(over: Partial<VisualSettings> = {}): VisualSettings {
  return { ...readSettings(new ParamStore(buildVisualParamSpecs())), ...over };
}
