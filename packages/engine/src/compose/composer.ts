/**
 * The composer: plans sections, themes and chords, and asks each part
 * generator for one bar at a time. It is pure and deterministic: the same seed
 * and the same inputs per bar produce the same notes.
 */
import { clamp } from '../core/math.js';
import { Rng } from '../core/rng.js';
import { buildChord, type Chord, type ChordType } from '../theory/chord.js';
import { generateProgression } from '../theory/progression.js';
import { Scale, type ScaleName } from '../theory/scale.js';
import { generateBass } from './generators/bass.js';
import { generateDrums } from './generators/drums.js';
import { generateArp, generateChords, generatePad } from './generators/harmony.js';
import { createMotif, generateLead, generateTexture } from './generators/melody.js';
import { PART_IDS, partRecord, type PartId } from './parts.js';
import type { Style } from './style.js';
import { BEATS_PER_BAR } from './rhythm.js';
import type { BarContext, Macros, NoteEvent, PartMemory, Section, SectionChoices, SectionKind, Theme } from './types.js';

export type PartMode = 'auto' | 'on' | 'off';

/** What the composer reads from the outside world, once per bar. */
export interface ComposerInputs {
  style(): Style;
  macros(): Macros;
  partMode(part: PartId): PartMode;
  /** tonic pitch class, or null for "choose from the seed" */
  key(): number | null;
  /** scale, or null for "choose from the style" */
  scale(): ScaleName | null;
}

export interface BarResult {
  bar: number;
  events: NoteEvent[];
  section: Section;
  /** true when this bar starts a new section */
  sectionStart: boolean;
  chord: Chord;
  /** true when the chord differs from the previous bar's */
  chordChange: boolean;
  scale: Scale;
}

const KIND_ENERGY: Record<SectionKind, number> = {
  intro: 0.3,
  build: 0.55,
  drop: 1,
  groove: 0.75,
  break: 0.25,
  outro: 0.2,
};

interface ThemeSeed {
  id: number;
  degrees: number[];
  types: ChordType[];
  chordBars: number;
}

export class Composer {
  private rng: Rng;
  private readonly inputs: ComposerInputs;
  private section: Section | null = null;
  private sectionCount = 0;
  private themes: ThemeSeed[] = [];
  private motifs = new Map<number, Theme['motif']>();
  private memory: Record<PartId, PartMemory>;
  private autoKey: number;
  private autoScale: ScaleName | null = null;
  private autoScaleStyle = '';
  private lastChordKey = '';
  private queuedNext: SectionKind | null = null;
  private plannedNext: SectionKind | null = null;

  constructor(seed: number, inputs: ComposerInputs) {
    this.inputs = inputs;
    this.rng = new Rng(seed);
    this.autoKey = this.rng.fork('key').int(0, 11);
    this.memory = partRecord(() => ({ voicing: null, lastPitch: null }));
  }

  /** Forces the next bar to start a new section of `kind` (or the planned one). */
  queueSection(kind: SectionKind | null): void {
    this.queuedNext = kind ?? this.plannedNext ?? 'drop';
  }

  get currentSection(): Section | null {
    return this.section;
  }

  private scaleFor(style: Style): Scale {
    const key = this.inputs.key() ?? this.autoKey;
    let name = this.inputs.scale();
    if (!name) {
      if (this.autoScale === null || this.autoScaleStyle !== style.id) {
        this.autoScale = this.rng.fork(`scale:${style.id}`).weighted(style.scales);
        this.autoScaleStyle = style.id;
      }
      name = this.autoScale;
    }
    return new Scale(key, name);
  }

  private newTheme(style: Style, macros: Macros): ThemeSeed {
    const id = this.themes.length;
    const r = this.rng.fork(`theme:${id}`);
    const length = Number(r.weighted(style.progressionLength));
    const degrees = generateProgression(r, style.progression, length, 0, true);
    const chordBars = macros.complexity > 0.75 && r.chance(0.5) ? 1 : Number(r.weighted(style.chordBars));
    const types = degrees.map(() => {
      const t = r.weighted(style.chordTypes);
      // complexity colours simple triads with extensions
      if (t === 'triad' && r.chance(macros.complexity * 0.5)) return r.pick<ChordType>(['seventh', 'add9', 'sus2']);
      return t;
    });
    const theme = { id, degrees, types, chordBars };
    this.themes.push(theme);
    return theme;
  }

  private themeFor(kind: SectionKind, style: Style, macros: Macros, r: Rng): ThemeSeed {
    // Recurrence makes music: drops and grooves share theme A, breaks prefer theme B.
    if (this.themes.length === 0) return this.newTheme(style, macros);
    if (r.chance(0.12 + 0.5 * macros.variation)) return this.newTheme(style, macros);
    const a = this.themes[0] as ThemeSeed;
    if (kind === 'break' || kind === 'intro') {
      return this.themes[1] ?? (r.chance(0.7) ? this.newTheme(style, macros) : a);
    }
    return r.chance(0.75) ? a : (r.pick(this.themes) as ThemeSeed);
  }

  private planSection(startBar: number, style: Style, macros: Macros): Section {
    const index = this.sectionCount++;
    const r = this.rng.fork(`section:${index}`);
    let kind: SectionKind;
    if (this.queuedNext) {
      kind = this.queuedNext;
      this.queuedNext = null;
    } else if (!this.section) {
      kind = style.form.start;
    } else {
      kind = this.plannedNext ?? r.weighted(style.form.transitions[this.section.kind]);
    }
    const bars = Number(r.weighted(style.form.lengths[kind])) * (macros.variation > 0.7 && r.chance(0.4) ? 0.5 : 1);
    const energy = clamp(KIND_ENERGY[kind] * (0.45 + 1.1 * macros.energy), 0, 1);
    const seed = this.themeFor(kind, style, macros, r);
    if (!this.motifs.has(seed.id)) this.motifs.set(seed.id, createMotif(this.rng.fork(`motif:${seed.id}`), macros.complexity, style.lead.density));

    const scale = this.scaleFor(style);
    const theme: Theme = {
      id: seed.id,
      chordBars: seed.chordBars,
      progression: seed.degrees.map((d, i) => buildChord(scale, d, seed.types[i] as ChordType)),
      motif: this.motifs.get(seed.id) as Theme['motif'],
    };

    const active = {} as Record<PartId, boolean>;
    for (const p of PART_IDS) {
      const mode = this.inputs.partMode(p);
      if (mode !== 'auto') {
        active[p] = mode === 'on';
        continue;
      }
      let on = style.parts[p].minEnergy <= energy + 1e-9;
      if (kind === 'break' && (p === 'kick' || p === 'bass' || p === 'snare' || p === 'hats' || p === 'perc')) on = false;
      if ((kind === 'intro' || kind === 'outro') && (p === 'lead' || p === 'snare') && energy < 0.7) on = false;
      if (kind === 'build' && p === 'lead') on = false;
      if (on && p !== 'kick' && r.chance(0.2 * macros.variation)) on = false;
      active[p] = on;
    }
    if (!active.chords && !active.pad && this.inputs.partMode('pad') === 'auto') active.pad = true;

    const choices: SectionChoices = {
      bass: r.weighted(this.biasBass(style, macros)),
      chords: r.weighted(style.chords.patterns),
      arp: r.weighted(style.arp.patterns),
      arpRate: r.chance(clamp(style.arp.rate16 * (0.5 + macros.complexity), 0, 1)) ? 4 : 2,
      drumSeed: r.fork('drums').int(0, 0x7fffffff),
    };
    const section: Section = { index, kind, startBar, bars: Math.max(2, bars), energy, active, theme, choices };
    this.plannedNext = r.fork('next').weighted(style.form.transitions[kind]);
    return section;
  }

  private biasBass(style: Style, macros: Macros): Partial<Record<string, number>> {
    const w: Partial<Record<string, number>> = { ...style.bass.patterns };
    // busier patterns become likelier with complexity
    for (const busy of ['sync', 'walk', 'gallop', 'arp']) if (w[busy]) w[busy] = (w[busy] as number) * (0.5 + macros.complexity);
    return w;
  }

  composeBar(bar: number): BarResult {
    const style = this.inputs.style();
    const macros = this.inputs.macros();
    let sectionStart = false;
    if (!this.section || this.queuedNext || bar >= this.section.startBar + this.section.bars) {
      this.section = this.planSection(bar, style, macros);
      sectionStart = true;
    }
    const sec = this.section;
    const barInSection = bar - sec.startBar;
    const scale = this.scaleFor(style);
    const prog = sec.theme.progression;
    const chordIndex = Math.floor(barInSection / sec.theme.chordBars) % prog.length;
    // rebuild in the current scale so key changes apply on the next bar
    const seed = this.themes[sec.theme.id] as ThemeSeed;
    const chordAt = (i: number) => buildChord(scale, seed.degrees[i % seed.degrees.length] as number, seed.types[i % seed.types.length] as ChordType);
    const chord = chordAt(chordIndex);
    const nextChord = chordAt(chordIndex + 1);
    const chordKey = `${scale.root}:${scale.name}:${chord.degree}:${chord.type}`;
    const chordChange = chordKey !== this.lastChordKey;
    this.lastChordKey = chordKey;
    const isLast = barInSection === sec.bars - 1;

    const ctx: BarContext = {
      bar,
      startBeat: bar * BEATS_PER_BAR,
      barInSection,
      section: sec,
      nextSection: isLast ? (this.queuedNext ?? this.plannedNext) : null,
      chord,
      nextChord,
      chordIndex,
      scale,
      style,
      macros,
      rng: this.rng.fork(`bar:${bar}`),
    };

    const events: NoteEvent[] = [];
    const m = this.memory;
    const on = (p: PartId) => sec.active[p] && this.inputs.partMode(p) !== 'off';
    if (on('kick')) events.push(...generateDrums(ctx, 'kick'));
    if (on('snare')) events.push(...generateDrums(ctx, 'snare'));
    if (on('hats')) events.push(...generateDrums(ctx, 'hats'));
    if (on('perc')) events.push(...generateDrums(ctx, 'perc'));
    if (on('bass')) events.push(...generateBass(ctx, m.bass));
    if (on('chords')) events.push(...generateChords(ctx, m.chords));
    if (on('pad')) events.push(...generatePad(ctx, m.pad));
    if (on('arp')) events.push(...generateArp(ctx));
    if (on('lead')) events.push(...generateLead(ctx, m.lead));
    if (on('texture')) events.push(...generateTexture(ctx));
    events.sort((a, b) => a.start - b.start);
    return { bar, events, section: sec, sectionStart, chord, chordChange, scale };
  }
}
