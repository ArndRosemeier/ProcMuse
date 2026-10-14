/** Keyboard shortcuts: one registry, one listener, one help dialog listing them all. */
import { h, isTyping } from './dom.js';

export interface Shortcut {
  /** KeyboardEvent.key, case-insensitive for letters (e.g. " ", "n", "?", "ArrowUp") */
  key: string;
  /** human label of the key */
  keyLabel: string;
  description: string;
  run: () => void;
}

export class Shortcuts {
  private list: Shortcut[] = [];
  readonly dialog: HTMLDialogElement;
  private readonly tbody: HTMLElement;

  constructor() {
    this.tbody = h('tbody');
    const close = h('button', { class: 'pm-btn', text: 'Close', attrs: { type: 'button' }, on: { click: () => this.dialog.close() } });
    this.dialog = h(
      'dialog',
      { class: 'pm-dialog', attrs: { 'aria-labelledby': 'pm-shortcuts-title' } },
      h('h2', { text: 'Keyboard shortcuts', attrs: { id: 'pm-shortcuts-title' } }),
      h(
        'p',
        { text: 'Every control is reachable with Tab. Move a panel by focusing its ✥ handle and pressing the arrow keys (hold Shift for bigger steps).' },
      ),
      h('table', { class: 'pm-shortcut-table' }, h('thead', {}, h('tr', {}, h('th', { text: 'Key', attrs: { scope: 'col' } }), h('th', { text: 'Action', attrs: { scope: 'col' } }))), this.tbody),
      close,
    );
  }

  register(s: Shortcut): void {
    if (this.list.some((x) => x.key.toLowerCase() === s.key.toLowerCase())) throw new Error(`shortcut ${s.keyLabel} registered twice`);
    this.list.push(s);
    this.tbody.append(h('tr', {}, h('td', {}, h('kbd', { text: s.keyLabel })), h('td', { text: s.description })));
  }

  get all(): readonly Shortcut[] {
    return this.list;
  }

  openHelp(): void {
    if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
    else this.dialog.setAttribute('open', '');
  }

  /** Handles a keydown; returns true when a shortcut ran. */
  handle(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return false;
    if (this.dialog.open) return false;
    // space and enter on buttons/controls keep their native meaning
    const t = e.target as HTMLElement | null;
    if ((e.key === ' ' || e.key === 'Enter') && t && t.closest?.('button, input, select, a, [role="switch"]')) return false;
    const s = this.list.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (!s) return false;
    e.preventDefault();
    s.run();
    return true;
  }

  attach(target: Document | HTMLElement): () => void {
    const fn = (e: Event) => this.handle(e as KeyboardEvent);
    target.addEventListener('keydown', fn);
    return () => target.removeEventListener('keydown', fn);
  }
}
