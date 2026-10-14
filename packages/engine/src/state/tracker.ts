/**
 * MusicState: a per-frame snapshot of "what the music is doing", built from
 * engine events. Visuals and UIs read this instead of parsing events, so every
 * consumer agrees on what a "kick hit" or "section progress" means.
 *
 * Events arrive early (the audio is rendered ahead of what is heard), so the
 * tracker holds them until the listener's clock reaches their time.
 */
import { PART_IDS, type PartId } from '../compose/parts.js';
import type { SectionKind } from '../compose/types.js';
import type { EngineEvent } from '../engine/events.js';

export interface MusicState {
  /** listener clock, seconds */
  time: number;
  tempo: number;
  bar: number;
  beat: number;
  /** 0..1 position inside the current beat */
  beatPhase: number;
  /** 0..1 position inside the current bar */
  barPhase: number;
  section: { kind: SectionKind; index: number; energy: number; progress: number; bars: number };
  chord: { root: number; name: string; key: string; /** 0..1 hue derived from the root on the circle of fifths */ hue: number };
  /** 1 at a note onset of that part, decaying to 0 */
  hits: Record<PartId, number>;
  /** smoothed loudness per part, roughly 0..1 */
  levels: Record<PartId, number>;
  master: number;
  /** smoothed overall intensity 0..1, from section energy and loudness */
  intensity: number;
  /** last lead pitch normalized to 0..1 over the keyboard */
  melody: number;
  /** total notes started (for counters and particle spawns) */
  noteCount: number;
}

const HIT_DECAY: Record<PartId, number> = {
  kick: 9,
  snare: 8,
  hats: 16,
  perc: 10,
  bass: 6,
  chords: 4,
  pad: 1.5,
  arp: 10,
  lead: 5,
  texture: 0.8,
};

function zeros(): Record<PartId, number> {
  return Object.fromEntries(PART_IDS.map((p) => [p, 0])) as Record<PartId, number>;
}

export class MusicStateTracker {
  private pending: EngineEvent[] = [];
  private lastHit: Record<PartId, number> = Object.fromEntries(PART_IDS.map((p) => [p, -1e9])) as Record<PartId, number>;
  private hitVel = zeros();
  private beatTime = 0;
  private sectionStartTime = 0;
  readonly state: MusicState = {
    time: 0,
    tempo: 120,
    bar: 0,
    beat: 0,
    beatPhase: 0,
    barPhase: 0,
    section: { kind: 'intro', index: 0, energy: 0.3, progress: 0, bars: 8 },
    chord: { root: 0, name: '', key: '', hue: 0 },
    hits: zeros(),
    levels: zeros(),
    master: 0,
    intensity: 0,
    melody: 0.5,
    noteCount: 0,
  };

  /** Queues events; they take effect when `update` reaches their time. */
  push(events: readonly EngineEvent[]): void {
    for (const e of events) if (e.type !== 'param') this.pending.push(e);
  }

  /** Clears everything (e.g. after a restart of the audio clock). */
  reset(): void {
    this.pending = [];
  }

  /** Advances to listener time `now` (engine-clock seconds) and returns the snapshot. */
  update(now: number): MusicState {
    const s = this.state;
    const dt = Math.max(0, Math.min(0.25, now - s.time));
    s.time = now;
    if (this.pending.length) {
      this.pending.sort((a, b) => ('time' in a ? a.time : 0) - ('time' in b ? b.time : 0));
      let i = 0;
      for (; i < this.pending.length; i++) {
        const e = this.pending[i] as EngineEvent;
        if ('time' in e && e.time > now) break;
        this.apply(e);
      }
      this.pending.splice(0, i);
    }
    const spb = 60 / s.tempo;
    s.beatPhase = Math.min(1, Math.max(0, (now - this.beatTime) / spb));
    s.barPhase = (s.beat + s.beatPhase) / 4;
    const secLen = s.section.bars * 4 * spb;
    s.section.progress = Math.min(1, Math.max(0, (now - this.sectionStartTime) / secLen));
    for (const p of PART_IDS) {
      s.hits[p] = this.hitVel[p] * Math.exp(-(now - this.lastHit[p]) * HIT_DECAY[p]);
    }
    let loud = 0;
    for (const p of PART_IDS) loud += s.levels[p];
    const target = Math.min(1, 0.55 * s.section.energy + 0.45 * Math.min(1, loud * 2.5));
    s.intensity += (target - s.intensity) * Math.min(1, dt * 2);
    return s;
  }

  private apply(e: EngineEvent): void {
    const s = this.state;
    switch (e.type) {
      case 'note':
        this.lastHit[e.part] = e.time;
        this.hitVel[e.part] = e.velocity;
        s.noteCount++;
        if (e.part === 'lead') s.melody = Math.min(1, Math.max(0, (e.pitch - 48) / 48));
        break;
      case 'beat':
        s.bar = e.bar;
        s.beat = e.beat;
        s.tempo = e.tempo;
        this.beatTime = e.time;
        break;
      case 'section':
        s.section = { kind: e.kind, index: e.index, energy: e.energy, progress: 0, bars: e.bars };
        this.sectionStartTime = e.time;
        break;
      case 'chord':
        // circle of fifths position gives harmonically related chords related colours
        s.chord = { root: e.root, name: e.name, key: e.key, hue: ((e.root * 7) % 12) / 12 };
        break;
      case 'levels':
        for (const p of PART_IDS) s.levels[p] = e.parts[p];
        s.master = e.master;
        break;
      case 'param':
        break;
    }
  }
}
