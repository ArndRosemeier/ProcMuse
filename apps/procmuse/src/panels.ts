/** The app's panels: which parameters live where, plus the few app-specific actions. */
import type { ParamSpec } from '@procmuse/engine';
import { createParamView, h, type KeyValueStore, type Workspace } from '@procmuse/ui';
import type { WebEngine } from '@procmuse/web';
import { NowPlaying } from './nowPlaying.js';
import { PresetLibrary, applyPreset, capturePreset, encodePreset, type PresetTarget } from './presets.js';
import type { VisualLayer } from './visualsLayer.js';

export interface PanelDeps {
  ws: Workspace;
  engine: WebEngine;
  visuals: VisualLayer | null;
  targets: PresetTarget[];
  store: KeyValueStore;
}

export async function togglePlay(ws: Workspace, engine: WebEngine): Promise<void> {
  if (engine.playing) engine.pause();
  else await engine.play();
  ws.announce(engine.playing ? 'Playing' : 'Paused');
  ws.refreshActions();
}

function button(text: string, onClick: () => void, label?: string): HTMLButtonElement {
  return h('button', { class: 'pm-btn', text, attrs: { type: 'button', 'aria-label': label }, on: { click: onClick } });
}

const inGroup = (...groups: string[]) => (s: ParamSpec) => groups.includes(s.group);

export function buildPanels({ ws, engine, visuals, targets, store }: PanelDeps): { nowPlaying: NowPlaying } {
  const W = window.innerWidth;
  const rightX = Math.max(16, W - 360);
  const errors = ws.errors;
  const safe = (label: string, fn: () => void) => () => {
    try {
      fn();
    } catch (err) {
      errors.show(err, label);
    }
  };

  // Mood: the big, friendly macros
  const mood = ws.addPanel({
    id: 'mood',
    title: 'Mood',
    x: 16,
    y: 16,
    content: createParamView(engine, { filter: inGroup('Feel', 'Sound') }).el,
  });

  // Music: style, key, tempo, seed, and arrangement actions
  const actions = h(
    'div',
    { class: 'pm-actions', attrs: { role: 'group', 'aria-label': 'Arrangement' } },
    button('New idea', safe('New idea', () => engine.command({ type: 'regenerate' })), 'New idea: compose something fresh'),
    button('Next section', safe('Next section', () => engine.command({ type: 'nextSection' }))),
    button('Drop', safe('Drop', () => engine.command({ type: 'nextSection', kind: 'drop' })), 'Drop now'),
    button('Break', safe('Break', () => engine.command({ type: 'nextSection', kind: 'break' })), 'Breakdown now'),
  );
  ws.addPanel({
    id: 'music',
    title: 'Music',
    // beside Mood, which is tall: stacking them would bury Music underneath
    x: Math.min(rightX, 16 + mood.el.offsetWidth + 16),
    y: 16,
    content: h('div', {}, actions, createParamView(engine, { filter: inGroup('Music'), headings: false }).el),
  });

  // Now playing
  const nowPlaying = new NowPlaying();
  ws.addPanel({ id: 'now', title: 'Now playing', x: rightX, y: 16, width: '20em', content: nowPlaying.el });

  // Band: every part's instrument, mode and mix
  ws.addPanel({
    id: 'band',
    title: 'Band',
    x: rightX,
    y: 330,
    hidden: true,
    content: createParamView(engine, {
      filter: (s) => s.group.startsWith('Part: '),
      groupPrefix: 'Part: ',
      search: true,
    }).el,
  });

  // Effects and master
  ws.addPanel({
    id: 'fx',
    title: 'Effects',
    x: Math.max(16, W / 2 - 170),
    y: 80,
    hidden: true,
    content: createParamView(engine, { filter: inGroup('Effects', 'Master') }).el,
  });

  // Visuals
  if (visuals?.source) {
    ws.addPanel({
      id: 'visuals',
      title: 'Visuals',
      x: Math.max(16, W / 2 - 170),
      y: 140,
      hidden: true,
      content: createParamView(visuals.source).el,
    });
  }

  // Settings: interface preferences, presets, sharing, help
  const library = new PresetLibrary(store);
  const nameId = 'pm-preset-name';
  const nameInput = h('input', { class: 'pm-search', attrs: { id: nameId, type: 'text', placeholder: 'My groove', autocomplete: 'off' } });
  const selectId = 'pm-preset-select';
  const select = h('select', { class: 'pm-select', attrs: { id: selectId } });
  const refreshPresets = () => {
    select.replaceChildren(h('option', { text: 'Choose a preset…', attrs: { value: '' } }), ...Object.keys(library.list()).map((n) => h('option', { text: n, attrs: { value: n } })));
  };
  refreshPresets();
  const presetUi = h(
    'section',
    { class: 'pm-group', attrs: { 'aria-labelledby': 'pm-presets-title' } },
    h('h3', { class: 'pm-group-title', text: 'Presets', attrs: { id: 'pm-presets-title' } }),
    h(
      'div',
      { class: 'pm-preset-row' },
      h('div', {}, h('label', { class: 'pm-label', text: 'Preset name', attrs: { for: nameId } }), nameInput),
      button('Save', safe('Save preset', () => {
        const name = nameInput.value.trim();
        if (!name) throw new Error('give the preset a name first');
        library.save(name, capturePreset(targets));
        refreshPresets();
        ws.announce(`Saved preset ${name}`);
      }), 'Save current settings as a preset'),
    ),
    h(
      'div',
      { class: 'pm-preset-row' },
      h('div', {}, h('label', { class: 'pm-label', text: 'Saved presets', attrs: { for: selectId } }), select),
      button('Load', safe('Load preset', () => {
        const p = library.list()[select.value];
        if (!p) throw new Error('choose a saved preset first');
        applyPreset(targets, p);
        ws.announce(`Loaded preset ${select.value}`);
      })),
    ),
    h(
      'div',
      { class: 'pm-actions' },
      button('Copy share link', safe('Share link', () => {
        const url = `${location.origin}${location.pathname}#p=${encodePreset(capturePreset(targets))}`;
        history.replaceState(null, '', url);
        void navigator.clipboard?.writeText(url).then(
          () => ws.announce('Share link copied'),
          () => ws.announce('Share link is in the address bar'),
        );
      })),
      button('Reset everything', safe('Reset', () => {
        applyPreset(targets, {});
        ws.announce('All settings reset');
      })),
    ),
  );
  ws.addPanel({
    id: 'settings',
    title: 'Settings',
    x: Math.max(16, W / 2 - 170),
    y: 200,
    hidden: true,
    content: h(
      'div',
      {},
      createParamView(ws.settings).el,
      presetUi,
      h('div', { class: 'pm-actions' }, button('Reset layout', () => ws.resetLayout()), button('Keyboard shortcuts', () => ws.shortcuts.openHelp())),
    ),
  });

  // Dock actions
  ws.addAction({ id: 'play', label: 'Play or pause (Space)', icon: '⏯', run: () => void togglePlay(ws, engine), pressed: () => engine.playing, keep: true });
  ws.addAction({ id: 'idea', label: 'New idea (R)', icon: '✦', run: safe('New idea', () => engine.command({ type: 'regenerate' })) });
  ws.addAction({ id: 'next', label: 'Next section (N)', icon: '⏭', run: safe('Next section', () => engine.command({ type: 'nextSection' })) });
  ws.addAction({ id: 'hide', label: 'Hide or show interface (H)', icon: '◐', run: () => ws.toggleAll(), pressed: () => ws.allHidden, keep: true });
  ws.addAction({ id: 'help', label: 'Keyboard shortcuts (?)', icon: '?', run: () => ws.shortcuts.openHelp() });

  return { nowPlaying };
}
