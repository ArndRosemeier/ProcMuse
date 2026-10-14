/** The app's ONE error surface: a visible, dismissible alert list. Every caught error goes here. */
import { h } from './dom.js';

export class ErrorSurface {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.list = h('ul', { class: 'pm-error-list' });
    this.el = h('div', { class: 'pm-errors', attrs: { role: 'alert', hidden: true } }, this.list);
  }

  show(error: unknown, context?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const item = h('li', { class: 'pm-error' });
    const dismiss = h('button', {
      class: 'pm-icon-btn',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Dismiss error' },
      on: {
        click: () => {
          item.remove();
          this.el.hidden = this.list.childElementCount === 0;
        },
      },
    });
    item.append(h('strong', { text: context ? `${context}: ` : 'Error: ' }), h('span', { text: message }), dismiss);
    this.list.append(item);
    this.el.hidden = false;
    console.error(context ?? 'ProcMuse error', error);
  }

  get count(): number {
    return this.list.childElementCount;
  }
}

/** Routes uncaught errors and rejections to the surface. */
export function captureGlobalErrors(surface: ErrorSurface, target: Window = window): void {
  target.addEventListener('error', (e) => surface.show(e.error ?? e.message, 'Unexpected error'));
  target.addEventListener('unhandledrejection', (e) => surface.show(e.reason, 'Unexpected error'));
}
