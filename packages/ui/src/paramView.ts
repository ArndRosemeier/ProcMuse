/**
 * A view of many parameters: grouped sections, the essentials up front,
 * advanced options behind a disclosure, and a filter box. This is how the UI
 * stays simple at first glance while exposing every option.
 */
import type { ParamSource, ParamSpec } from '@procmuse/engine';
import { createControl, type Control } from './controls.js';
import { h, uid } from './dom.js';

export interface ParamViewOptions {
  /** which specs to show */
  filter?: (spec: ParamSpec) => boolean;
  /** show a filter box (for long lists) */
  search?: boolean;
  /** strip this prefix from group headings, e.g. "Part: " */
  groupPrefix?: string;
  /** render group headings (default true) */
  headings?: boolean;
}

export interface ParamView {
  readonly el: HTMLElement;
  dispose(): void;
}

export function createParamView(source: ParamSource, options: ParamViewOptions = {}): ParamView {
  const specs = source.specs.filter(options.filter ?? (() => true));
  const controls: Control[] = [];
  const root = h('div', { class: 'pm-params' });

  const groups = new Map<string, ParamSpec[]>();
  for (const s of specs) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }

  let search: HTMLInputElement | null = null;
  if (options.search) {
    const id = uid('search');
    search = h('input', { class: 'pm-search', attrs: { id, type: 'search', placeholder: 'Filter controls…', autocomplete: 'off' } });
    root.append(h('div', { class: 'pm-search-row' }, h('label', { class: 'pm-sr-only', text: 'Filter controls', attrs: { for: id } }), search));
  }

  const sections: HTMLElement[] = [];
  for (const [group, list] of groups) {
    const headingId = uid('grp');
    const title = options.groupPrefix && group.startsWith(options.groupPrefix) ? group.slice(options.groupPrefix.length) : group;
    const section = h('section', { class: 'pm-group', attrs: { 'aria-labelledby': options.headings === false ? undefined : headingId } });
    if (options.headings !== false) section.append(h('h3', { class: 'pm-group-title', text: title, attrs: { id: headingId } }));
    const basic = list.filter((s) => !s.advanced);
    const advanced = list.filter((s) => s.advanced);
    for (const s of basic) {
      const c = createControl(s, source);
      controls.push(c);
      section.append(c.el);
    }
    if (advanced.length) {
      const moreId = uid('more');
      const more = h('div', { class: 'pm-advanced', attrs: { id: moreId, hidden: true } });
      for (const s of advanced) {
        const c = createControl(s, source);
        controls.push(c);
        more.append(c.el);
      }
      const toggle = h('button', {
        class: 'pm-disclosure',
        text: `More ${title.toLowerCase()} options (${advanced.length})`,
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': moreId },
      });
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        more.hidden = !open;
      });
      section.append(toggle, more);
    }
    sections.push(section);
    root.append(section);
  }

  const empty = h('p', { class: 'pm-empty', text: 'No controls match.', attrs: { hidden: true, role: 'status' } });
  root.append(empty);
  search?.addEventListener('input', () => {
    const q = (search as HTMLInputElement).value.trim().toLowerCase();
    let shown = 0;
    for (const c of controls) {
      const match = !q || c.spec.label.toLowerCase().includes(q) || c.spec.description.toLowerCase().includes(q);
      c.el.hidden = !match;
      // searching reveals advanced matches too
      if (match && q) (c.el.parentElement as HTMLElement).hidden = false;
      if (match) shown++;
    }
    for (const s of sections) s.hidden = !Array.from(s.querySelectorAll<HTMLElement>('.pm-control')).some((c) => !c.hidden);
    empty.hidden = shown > 0;
  });

  return { el: root, dispose: () => controls.forEach((c) => c.dispose()) };
}
