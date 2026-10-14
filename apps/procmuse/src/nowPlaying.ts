/** The "Now playing" readout: what the music is doing, as text (for everyone) plus meters (decorative). */
import { PART_IDS, PART_INFO, type MusicState } from '@procmuse/engine';
import { h } from '@procmuse/ui';

const SECTION_LABEL: Record<string, string> = {
  intro: 'Intro',
  build: 'Build-up',
  drop: 'Drop',
  groove: 'Groove',
  break: 'Breakdown',
  outro: 'Outro',
};

export class NowPlaying {
  readonly el: HTMLElement;
  private readonly fields: Record<'style' | 'section' | 'key' | 'chord' | 'tempo' | 'position', HTMLElement>;
  private readonly progress: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly meters: HTMLElement[] = [];
  private lastText = '';

  constructor() {
    const dd = () => h('dd');
    this.fields = { style: dd(), section: dd(), key: dd(), chord: dd(), tempo: dd(), position: dd() };
    const row = (label: string, el: HTMLElement) => h('div', { class: 'pm-now-row' }, h('dt', { text: label }), el);
    this.progressBar = h('span');
    this.progress = h('div', {
      class: 'pm-progress',
      attrs: { role: 'progressbar', 'aria-label': 'Section progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 },
    }, this.progressBar);
    const meterWrap = h('div', { class: 'pm-meters', attrs: { 'aria-hidden': 'true' } });
    for (const p of PART_IDS) {
      const bar = h('span');
      this.meters.push(bar);
      meterWrap.append(h('div', { class: 'pm-meter', attrs: { title: PART_INFO[p].label } }, bar, h('span', { text: PART_INFO[p].label.slice(0, 3) })));
    }
    this.el = h(
      'div',
      { class: 'pm-now' },
      h(
        'dl',
        {},
        row('Style', this.fields.style),
        row('Section', this.fields.section),
        row('Key', this.fields.key),
        row('Chord', this.fields.chord),
        row('Tempo', this.fields.tempo),
        row('Bar · beat', this.fields.position),
      ),
      this.progress,
      meterWrap,
    );
  }

  /** Call per animation frame; text updates only when it changes (no screen-reader chatter). */
  update(state: MusicState, styleName: string): void {
    const text = [
      styleName,
      SECTION_LABEL[state.section.kind] ?? state.section.kind,
      state.chord.key || '—',
      state.chord.name || '—',
      `${Math.round(state.tempo)} BPM`,
      `${state.bar + 1} · ${state.beat + 1}`,
    ];
    const joined = text.join('|');
    if (joined !== this.lastText) {
      this.lastText = joined;
      const f = this.fields;
      [f.style, f.section, f.key, f.chord, f.tempo, f.position].forEach((el, i) => (el.textContent = text[i] as string));
    }
    const pct = Math.round(state.section.progress * 100);
    this.progressBar.style.width = `${pct}%`;
    if (this.progress.getAttribute('aria-valuenow') !== String(pct)) this.progress.setAttribute('aria-valuenow', String(pct));
    PART_IDS.forEach((p, i) => {
      const v = Math.min(1, Math.max(state.hits[p], state.levels[p] * 3));
      (this.meters[i] as HTMLElement).style.height = `${Math.round(4 + v * 96)}%`;
    });
  }
}

export function sectionLabel(kind: string): string {
  return SECTION_LABEL[kind] ?? kind;
}
