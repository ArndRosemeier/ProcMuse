/**
 * Events the engine emits. Times are in seconds of the engine clock at the
 * moment the sound is rendered; a host adds its own output offset.
 * Every event is plain data so it can cross threads.
 */
import type { PartId } from '../compose/parts.js';
import type { SectionKind } from '../compose/types.js';
import type { ParamValue } from '../core/params.js';

export interface NoteEventMsg {
  type: 'note';
  time: number;
  part: PartId;
  pitch: number;
  velocity: number;
  /** seconds */
  duration: number;
}

export interface BeatEventMsg {
  type: 'beat';
  time: number;
  bar: number;
  /** 0..3 */
  beat: number;
  tempo: number;
}

export interface SectionEventMsg {
  type: 'section';
  time: number;
  index: number;
  kind: SectionKind;
  energy: number;
  bars: number;
  startBar: number;
}

export interface ChordEventMsg {
  type: 'chord';
  time: number;
  /** pitch class of the chord root */
  root: number;
  degree: number;
  name: string;
  key: string;
}

export interface LevelsEventMsg {
  type: 'levels';
  time: number;
  parts: Record<PartId, number>;
  master: number;
  voices: number;
}

export interface ParamEventMsg {
  type: 'param';
  id: string;
  value: ParamValue;
}

export type EngineEvent = NoteEventMsg | BeatEventMsg | SectionEventMsg | ChordEventMsg | LevelsEventMsg | ParamEventMsg;
