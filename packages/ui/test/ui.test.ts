// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ParamStore, buildParamSpecs, type ParamSpec } from '@procmuse/engine';
import { createControl } from '../src/controls.js';
import { createParamView } from '../src/paramView.js';
import { Workspace } from '../src/workspace.js';
import { memoryStore } from '../src/storage.js';
import { sliderToValue, valueToSlider, formatNumber, nextSliderValue } from '../src/format.js';

function engineParams() {
  return new ParamStore(buildParamSpecs());
}

/** Accessible name of a form control: its <label for>, or the element its aria-labelledby points at. */
function accessibleName(el: Element): string {
  const by = el.getAttribute('aria-labelledby');
  if (by) return document.getElementById(by)?.textContent ?? '';
  const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
  return label?.textContent ?? el.getAttribute('aria-label') ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('generated controls', () => {
  it('every engine parameter becomes a named, described control', () => {
    const params = engineParams();
    for (const spec of params.specs) {
      const c = createControl(spec, params);
      document.body.append(c.el);
      const input = c.el.querySelector('input[type=range], select, [role=radiogroup], [role=switch]') as HTMLElement;
      expect(input, spec.id).toBeTruthy();
      expect(accessibleName(input)).toBe(spec.label);
      const help = document.getElementById(input.getAttribute('aria-describedby') ?? '');
      expect(help?.textContent).toBe(spec.description);
      expect(c.el.querySelector('.pm-reset')?.getAttribute('aria-label')).toBe(`Reset ${spec.label} to default`);
    }
  });

  it('sliders write mapped values and speak them, and follow outside changes', () => {
    const params = engineParams();
    const spec = params.spec('music.tempo');
    const c = createControl(spec, params);
    document.body.append(c.el);
    const input = c.el.querySelector('input[type=range]') as HTMLInputElement;
    input.value = '1000';
    input.dispatchEvent(new Event('input'));
    expect(params.get('music.tempo')).toBe(200);
    expect(input.getAttribute('aria-valuetext')).toBe('200 BPM');
    params.set('music.tempo', 90);
    expect(input.getAttribute('aria-valuetext')).toBe('90 BPM');
  });

  it('short choices are radio groups, long ones are selects, booleans are switches', () => {
    const params = engineParams();
    const mode = createControl(params.spec('part.bass.mode'), params);
    expect(mode.el.querySelectorAll('input[type=radio]')).toHaveLength(3);
    const style = createControl(params.spec('music.style'), params);
    expect(style.el.querySelector('select')).toBeTruthy();
    const bool: ParamSpec = { kind: 'bool', id: 'x.flag', label: 'Flag', description: 'A flag.', group: 'X', default: false };
    const store = new ParamStore([bool]);
    const sw = createControl(bool, store);
    const btn = sw.el.querySelector('[role=switch]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-checked')).toBe('false');
    btn.click();
    expect(store.get('x.flag')).toBe(true);
    expect(btn.getAttribute('aria-checked')).toBe('true');
  });

  it('reset restores the default', () => {
    const params = engineParams();
    params.set('music.energy', 0.1);
    const c = createControl(params.spec('music.energy'), params);
    (c.el.querySelector('.pm-reset') as HTMLButtonElement).click();
    expect(params.get('music.energy')).toBe(0.6);
  });

  it('arrow keys move a slider by one visible step, page keys by a tenth', () => {
    const params = engineParams();
    const c = createControl(params.spec('music.energy'), params);
    document.body.append(c.el);
    const input = c.el.querySelector('input[type=range]') as HTMLInputElement;
    const key = (k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
    key('ArrowRight');
    expect(params.get('music.energy')).toBe(0.61);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(params.get('music.energy')).toBe(0.59);
    key('PageUp');
    expect(params.get('music.energy')).toBe(0.69);
    expect(input.getAttribute('aria-valuetext')).toBe('69%');
    const log = { kind: 'number', id: 'f', label: 'F', description: 'f', group: 'g', min: 20, max: 20000, step: 1, default: 20, scale: 'log' } as const;
    expect(nextSliderValue(log, 20, 1)).toBe(21);
    expect(nextSliderValue(log, 20000, 1)).toBe(20000);
  });

  it('slider mapping round-trips and formats', () => {
    const spec = { kind: 'number', id: 'a', label: 'A', description: 'a', group: 'g', min: 20, max: 20000, step: 1, default: 440, scale: 'log', unit: 'Hz' } as const;
    expect(sliderToValue(spec, valueToSlider(spec, 440))).toBeCloseTo(440, -1);
    expect(formatNumber(spec, 440)).toBe('440 Hz');
  });
});

describe('param view', () => {
  it('keeps advanced options behind a disclosure and filters by search', () => {
    const params = engineParams();
    const view = createParamView(params, { filter: (s) => s.group === 'Part: Bass', search: true });
    document.body.append(view.el);
    const toggle = view.el.querySelector('.pm-disclosure') as HTMLButtonElement;
    const more = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(more.hidden).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(more.hidden).toBe(false);
    const search = view.el.querySelector('input[type=search]') as HTMLInputElement;
    search.value = 'instrument';
    search.dispatchEvent(new Event('input'));
    const visible = Array.from(view.el.querySelectorAll<HTMLElement>('.pm-control')).filter((c) => !c.hidden);
    expect(visible.map((c) => c.dataset.param)).toEqual(['part.bass.instrument']);
  });
});

describe('workspace and panels', () => {
  function workspace() {
    return new Workspace(document.body, { store: memoryStore() });
  }

  it('panels move by keyboard, collapse, hide and come back from the dock', () => {
    const ws = workspace();
    const panel = ws.addPanel({ id: 'mix', title: 'Mix', content: document.createElement('div'), x: 100, y: 100 });
    const move = panel.el.querySelector('.pm-move') as HTMLButtonElement;
    move.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(panel.geometry.x).toBe(116);
    move.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
    expect(panel.geometry.y).toBe(164);
    const collapse = panel.el.querySelector('[aria-controls]') as HTMLButtonElement;
    collapse.click();
    expect(collapse.getAttribute('aria-expanded')).toBe('false');
    (panel.el.querySelector('[aria-label="Hide Mix panel"]') as HTMLButtonElement).click();
    expect(panel.el.hidden).toBe(true);
    const dockBtn = Array.from(ws.dock.querySelectorAll('button')).find((b) => b.textContent === 'Mix') as HTMLButtonElement;
    expect(dockBtn.getAttribute('aria-pressed')).toBe('false');
    dockBtn.click();
    expect(panel.el.hidden).toBe(false);
  });

  it('remembers panel positions and interface settings', () => {
    const store = memoryStore();
    const a = new Workspace(document.body, { store });
    a.addPanel({ id: 'p', title: 'P', content: document.createElement('div'), x: 10, y: 10 }).moveTo(200, 150);
    a.settings.set('ui.scale', 1.4);
    document.body.innerHTML = '';
    const b = new Workspace(document.body, { store });
    const p = b.addPanel({ id: 'p', title: 'P', content: document.createElement('div'), x: 10, y: 10 });
    expect(p.geometry.x).toBe(200);
    expect(b.settings.get('ui.scale')).toBe(1.4);
    expect(b.root.style.getPropertyValue('--pm-scale')).toBe('1.4');
  });

  it('small screens show one panel at a time as a sheet, without touching the floating layout', () => {
    const store = memoryStore();
    const ws = new Workspace(document.body, { store, layout: 'sheet' });
    const div = () => document.createElement('div');
    const a = ws.addPanel({ id: 'a', title: 'A', content: div(), x: 10, y: 10 });
    const b = ws.addPanel({ id: 'b', title: 'B', content: div(), x: 10, y: 10, hidden: true });
    const c = ws.addPanel({ id: 'c', title: 'C', content: div(), x: 10, y: 10 });
    const dockBtn = (t: string) => Array.from(ws.dock.querySelectorAll('button')).find((x) => x.textContent === t) as HTMLButtonElement;
    expect(ws.root.classList.contains('pm-sheet')).toBe(true);
    // the first panel shown by default opens; the sheet is placed by CSS, so nothing to drag
    expect([a.el.hidden, b.el.hidden, c.el.hidden]).toEqual([false, true, true]);
    expect((a.el.querySelector('.pm-move') as HTMLElement).hidden).toBe(true);
    expect(a.el.style.left).toBe('');
    dockBtn('B').click();
    expect([a.el.hidden, b.el.hidden, c.el.hidden]).toEqual([true, false, true]);
    expect([dockBtn('A'), dockBtn('B')].map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    (b.el.querySelector('[aria-label="Hide B panel"]') as HTMLButtonElement).click();
    expect([a, b, c].every((p) => p.el.hidden)).toBe(true);
    // the choice persists, and the floating layout still has its own visibility
    document.body.innerHTML = '';
    const again = new Workspace(document.body, { store, layout: 'sheet' });
    const a2 = again.addPanel({ id: 'a', title: 'A', content: div(), x: 10, y: 10 });
    expect(a2.el.hidden).toBe(true);
    again.setLayout('float');
    expect(a2.el.hidden).toBe(false);
    expect(a2.el.style.left).toBe('10px');
    again.setLayout('sheet');
    again.resetLayout();
    expect(a2.el.hidden).toBe(false);
  });

  it('shortcuts run, but never while typing, and keys are unique', () => {
    const ws = workspace();
    let n = 0;
    ws.shortcuts.register({ key: 'n', keyLabel: 'N', description: 'Next', run: () => n++ });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', bubbles: true }));
    expect(n).toBe(1);
    const input = document.createElement('input');
    input.type = 'search';
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(n).toBe(1);
    expect(() => ws.shortcuts.register({ key: 'N', keyLabel: 'N', description: 'dup', run: () => {} })).toThrow();
  });

  it('errors are visible on the one error surface', () => {
    const ws = workspace();
    expect(ws.errors.el.hidden).toBe(true);
    ws.errors.show(new Error('boom'), 'Audio');
    expect(ws.errors.el.hidden).toBe(false);
    expect(ws.errors.el.getAttribute('role')).toBe('alert');
    expect(ws.errors.el.textContent).toContain('boom');
  });

  it('high contrast and compact settings switch classes', () => {
    const ws = workspace();
    ws.settings.set('ui.contrast', true);
    ws.settings.set('ui.compact', true);
    expect(ws.root.classList.contains('pm-contrast')).toBe(true);
    expect(ws.root.classList.contains('pm-compact')).toBe(true);
  });
});
