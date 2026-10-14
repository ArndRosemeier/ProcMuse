/** Screen-reader announcements through one polite live region, rate-limited so music changes never flood. */
import { h } from './dom.js';

export class Announcer {
  readonly el: HTMLElement;
  enabled = true;
  private last = new Map<string, number>();

  constructor() {
    this.el = h('div', { class: 'pm-sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' } });
  }

  /** `channel` groups messages for rate limiting (e.g. "chord" at most every 4 s). */
  say(text: string, channel = 'ui', minIntervalMs = 0, force = false): void {
    if (!this.enabled && !force) return;
    const now = Date.now();
    if (minIntervalMs > 0 && now - (this.last.get(channel) ?? -Infinity) < minIntervalMs) return;
    this.last.set(channel, now);
    // clearing first makes repeated identical messages announce again
    this.el.textContent = '';
    queueMicrotask(() => (this.el.textContent = text));
  }
}
