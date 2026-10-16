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
import { STYLES } from './styles.js';
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
  /** bars a style plays before the composer moves on to another one, or null to stay */
  journey(): number | null;
}

export interface BarResult {
  bar: number;
  events: NoteEvent[];
  section: Section;
  /** true when this bar starts a new section */
  sectionStart: boolean;
  /** the style the composer moved on to at this bar (its journey), else null */
  styleChange: string | null;
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
  /**
   * The journey: a "piece" is the stretch played in one style. When it has run
   * its course, the composer plays an outro and starts the next piece in a
   * new style. `moved` holds that choice until the outside world adopts it
   * (or picks another style itself).
   */
  private piece = { index: 0, startBar: 0, themeStart: 0, styleId: '', previousId: '' };
  private moved: { from: string; to: Style } | null = null;

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

  /** The style to compose in: the input's, unless the journey has just moved on from it. */
  private currentStyle(): Style {
    const style = this.inputs.style();
    if (this.moved && this.moved.from !== style.id) this.moved = null;
    return this.moved?.to ?? style;
  }

  /** Every new piece goes somewhere else: never the style it leaves, nor the one before that. */
  private nextStyle(current: Style): Style {
    const r = this.rng.fork(`journey:${this.piece.index}`);
    const fresh = STYLES.filter((s) => s.id !== current.id && s.id !== this.piece.previousId);
    return r.pick(fresh.length ? fresh : STYLES.filter((s) => s.id !== current.id));
  }

  private startPiece(startBar: number, style: Style, previousId: string): void {
    this.piece = { index: this.piece.index + 1, startBar, themeStart: this.themes.length, styleId: style.id, previousId };
    this.autoKey = this.rng.fork(`key:${this.piece.index}`).int(0, 11);
    this.autoScale = null;
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
    // Themes belong to a piece: a new style starts from fresh ideas.
    const own = this.themes.slice(this.piece.themeStart);
    if (own.length === 0) return this.newTheme(style, macros);
    if (r.chance(0.12 + 0.5 * macros.variation)) return this.newTheme(style, macros);
    const a = own[0] as ThemeSeed;
    if (kind === 'break' || kind === 'intro') {
      return own[1] ?? (r.chance(0.7) ? this.newTheme(style, macros) : a);
    }
    return r.chance(0.75) ? a : (r.pick(own) as ThemeSeed);
  }

  /**
   * Picks the next section's kind, and moves the journey on: a piece that has
   * run its course ends with an outro, and the section after it starts the
   * next piece in a new style. Returns the style the section is planned in.
   */
  private planKind(startBar: number, style: Style, r: Rng): { kind: SectionKind; style: Style } {
    if (style.id !== this.piece.styleId) {
      // the outside world chose this style: its piece starts now
      this.piece = { ...this.piece, startBar, themeStart: this.themes.length, styleId: style.id };
    }
    if (this.queuedNext) {
      const kind = this.queuedNext;
      this.queuedNext = null;
      return { kind, style };
    }
    if (!this.section) return { kind: style.form.start, style };
    const bars = this.inputs.journey();
    const due = bars !== null && startBar - this.piece.startBar >= bars;
    if (due && this.section.kind === 'outro') {
      const next = this.nextStyle(style);
      // held until the outside world's style (not the composer's) changes
      this.moved = { from: this.inputs.style().id, to: next };
      this.startPiece(startBar, next, style.id);
      return { kind: next.form.start, style: next };
    }
    if (due) return { kind: 'outro', style };
    return { kind: this.plannedNext ?? r.weighted(style.form.transitions[this.section.kind]), style };
  }

  private planSection(startBar: number, current: Style, macros: Macros): Section {
    const index = this.sectionCount++;
    const r = this.rng.fork(`section:${index}`);
    const { kind, style } = this.planKind(startBar, current, r);
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
    let style = this.currentStyle();
    const macros = this.inputs.macros();
    let sectionStart = false;
    let styleChange: string | null = null;
    if (!this.section || this.queuedNext || bar >= this.section.startBar + this.section.bars) {
      this.section = this.planSection(bar, style, macros);
      sectionStart = true;
      const planned = this.currentStyle();
      if (planned !== style) {
        styleChange = planned.id;
        style = planned;
      }
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
    return { bar, events, section: sec, sectionStart, styleChange, chord, chordChange, scale };
  }
}
