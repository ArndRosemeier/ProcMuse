/**
 * Controls generated from ParamSpecs: the ONE way a parameter becomes UI.
 * Native elements only (range, radio, select, switch button), each with a
 * visible label, a description wired to aria-describedby, a spoken value
 * (aria-valuetext) and a reset-to-default button.
 */
import type { BoolParamSpec, EnumParamSpec, NumberParamSpec, ParamSource, ParamSpec, ParamValue } from '@procmuse/engine';
import { h, uid } from './dom.js';
import { SLIDER_STEPS, formatNumber, nextSliderValue, sliderToValue, valueToSlider } from './format.js';

export interface Control {
  readonly el: HTMLElement;
  readonly spec: ParamSpec;
  dispose(): void;
}

/** Few enough options to show as a segmented radio group instead of a dropdown. */
const RADIO_MAX = 5;

const KEY_DIR: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 };

function shell(spec: ParamSpec, labelFor: string | null, input: HTMLElement, valueEl: HTMLElement | null, reset: () => void): HTMLElement {
  const helpId = uid('help');
  input.setAttribute('aria-describedby', helpId);
  const label = labelFor
    ? h('label', { class: 'pm-label', text: spec.label, attrs: { for: labelFor } })
    : h('span', { class: 'pm-label', text: spec.label, attrs: { id: input.getAttribute('aria-labelledby') ?? undefined } });
  const resetBtn = h('button', {
    class: 'pm-reset',
    text: '↺',
    attrs: { type: 'button', 'aria-label': `Reset ${spec.label} to default`, title: 'Reset to default' },
    on: { click: reset },
  });
  return h(
    'div',
    { class: `pm-control pm-control-${spec.kind}`, attrs: { 'data-param': spec.id, 'data-label': spec.label.toLowerCase() } },
    h('div', { class: 'pm-control-head' }, label, valueEl, resetBtn),
    input,
    h('p', { class: 'pm-help', text: spec.description, attrs: { id: helpId } }),
  );
}

function numberControl(spec: NumberParamSpec, source: ParamSource): Control {
  const id = uid('num');
  const output = h('output', { class: 'pm-value', attrs: { for: id, 'aria-hidden': 'true' } });
  const input = h('input', {
    class: 'pm-range',
    attrs: { id, type: 'range', min: 0, max: SLIDER_STEPS, step: 1 },
  });
  const show = (v: number) => {
    const text = formatNumber(spec, v);
    input.value = String(valueToSlider(spec, v));
    input.setAttribute('aria-valuetext', text);
    output.textContent = text;
  };
  const commit = (v: number) => {
    source.set(spec.id, v);
    show(v);
  };
  input.addEventListener('input', () => commit(sliderToValue(spec, Number(input.value))));
  // The native slider moves 1/SLIDER_STEPS per arrow press, which the spec's step
  // rounds away; arrows move to the next distinct value, Page keys by a tenth.
  input.addEventListener('keydown', (e) => {
    const dir = KEY_DIR[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    commit(nextSliderValue(spec, source.get(spec.id) as number, dir, e.key.startsWith('Page')));
  });
  show(source.get(spec.id) as number);
  const off = source.onParam((pid, v) => pid === spec.id && show(v as number));
  const el = shell(spec, id, input, output, () => source.set(spec.id, spec.default));
  return { el, spec, dispose: off };
}

function enumControl(spec: EnumParamSpec, source: ParamSource): Control {
  if (spec.options.length <= RADIO_MAX) {
    const name = uid('radio');
    const labelId = uid('lbl');
    const radios: HTMLInputElement[] = [];
    const group = h('div', { class: 'pm-segmented', attrs: { role: 'radiogroup', 'aria-labelledby': labelId } });
    for (const opt of spec.options) {
      const rid = uid('opt');
      const radio = h('input', { attrs: { type: 'radio', id: rid, name, value: opt.value } });
      radio.addEventListener('change', () => radio.checked && source.set(spec.id, opt.value));
      radios.push(radio);
      group.append(h('span', { class: 'pm-segment' }, radio, h('label', { text: opt.label, attrs: { for: rid, title: opt.description } })));
    }
    const show = (v: ParamValue) => radios.forEach((r) => (r.checked = r.value === v));
    show(source.get(spec.id));
    const off = source.onParam((pid, v) => pid === spec.id && show(v));
    return { el: shell(spec, null, group, null, () => source.set(spec.id, spec.default)), spec, dispose: off };
  }
  const id = uid('sel');
  const select = h(
    'select',
    { class: 'pm-select', attrs: { id } },
    ...spec.options.map((o) => h('option', { text: o.label, attrs: { value: o.value, title: o.description } })),
  );
  select.addEventListener('change', () => source.set(spec.id, select.value));
  const show = (v: ParamValue) => (select.value = String(v));
  show(source.get(spec.id));
  const off = source.onParam((pid, v) => pid === spec.id && show(v));
  return { el: shell(spec, id, select, null, () => source.set(spec.id, spec.default)), spec, dispose: off };
}

function boolControl(spec: BoolParamSpec, source: ParamSource): Control {
  const id = uid('sw');
  const btn = h('button', { class: 'pm-switch', attrs: { id, type: 'button', role: 'switch' } }, h('span', { class: 'pm-switch-knob' }));
  const show = (v: ParamValue) => {
    btn.setAttribute('aria-checked', String(v === true));
  };
  btn.addEventListener('click', () => source.set(spec.id, !(source.get(spec.id) as boolean)));
  show(source.get(spec.id));
  const off = source.onParam((pid, v) => pid === spec.id && show(v));
  return { el: shell(spec, id, btn, null, () => source.set(spec.id, spec.default)), spec, dispose: off };
}

export function createControl(spec: ParamSpec, source: ParamSource): Control {
  switch (spec.kind) {
    case 'number':
      return numberControl(spec, source);
    case 'enum':
      return enumControl(spec, source);
    case 'bool':
      return boolControl(spec, source);
  }
}
