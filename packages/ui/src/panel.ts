/**
 * FloatingPanel: a translucent window over the visuals. Movable by pointer
 * (drag the header) AND by keyboard (focus the move handle, use the arrow
 * keys), collapsible, hideable, and remembered between sessions.
 */
import { h, uid } from './dom.js';

export interface PanelGeometry {
  x: number;
  y: number;
  collapsed: boolean;
  hidden: boolean;
}

export interface PanelOptions {
  id: string;
  title: string;
  content: HTMLElement;
  /** default position (px from top-left) */
  x: number;
  y: number;
  /** css width, e.g. "20rem" */
  width?: string;
  hidden?: boolean;
}

export interface PanelHost {
  bringToFront(panel: FloatingPanel): void;
  saveGeometry(panel: FloatingPanel): void;
  loadGeometry(id: string): PanelGeometry | null;
  announce(text: string): void;
  onVisibilityChange(panel: FloatingPanel): void;
}

const STEP = 16;
const BIG_STEP = 64;

export class FloatingPanel {
  readonly id: string;
  readonly title: string;
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly collapseBtn: HTMLButtonElement;
  private readonly moveBtn: HTMLButtonElement;
  private readonly host: PanelHost;
  private readonly defaults: PanelGeometry;
  geometry: PanelGeometry;

  constructor(host: PanelHost, options: PanelOptions) {
    this.host = host;
    this.id = options.id;
    this.title = options.title;
    this.defaults = { x: options.x, y: options.y, collapsed: false, hidden: options.hidden ?? false };
    this.geometry = { ...this.defaults, ...(host.loadGeometry(options.id) ?? {}) };
    const titleId = uid('title');
    const bodyId = uid('body');

    this.moveBtn = h('button', {
      class: 'pm-icon-btn pm-move',
      text: '✥',
      attrs: { type: 'button', 'aria-label': `Move ${options.title} panel with arrow keys`, title: 'Drag, or focus and use arrow keys' },
    });
    this.collapseBtn = h('button', {
      class: 'pm-icon-btn',
      text: '▾',
      attrs: { type: 'button', 'aria-expanded': 'true', 'aria-controls': bodyId, 'aria-label': `Collapse ${options.title}` },
    });
    const closeBtn = h('button', {
      class: 'pm-icon-btn',
      text: '✕',
      attrs: { type: 'button', 'aria-label': `Hide ${options.title} panel` },
      on: { click: () => this.setHidden(true) },
    });
    const header = h(
      'div',
      { class: 'pm-panel-header' },
      this.moveBtn,
      h('h2', { class: 'pm-panel-title', text: options.title, attrs: { id: titleId } }),
      this.collapseBtn,
      closeBtn,
    );
    this.body = h('div', { class: 'pm-panel-body', attrs: { id: bodyId } }, options.content);
    this.el = h('section', {
      class: 'pm-panel',
      attrs: { 'aria-labelledby': titleId, 'data-panel': options.id },
      style: options.width ? { width: options.width } : {},
    }, header, this.body);

    this.collapseBtn.addEventListener('click', () => this.setCollapsed(!this.geometry.collapsed));
    this.moveBtn.addEventListener('keydown', (e) => this.onMoveKey(e));
    header.addEventListener('pointerdown', (e) => this.onPointerDown(e, header));
    this.el.addEventListener('pointerdown', () => host.bringToFront(this));
    this.el.addEventListener('focusin', () => host.bringToFront(this));
    this.apply();
  }

  private apply(): void {
    const g = this.geometry;
    this.el.style.left = `${g.x}px`;
    this.el.style.top = `${g.y}px`;
    this.el.hidden = g.hidden;
    this.body.hidden = g.collapsed;
    this.collapseBtn.setAttribute('aria-expanded', String(!g.collapsed));
    this.collapseBtn.setAttribute('aria-label', `${g.collapsed ? 'Expand' : 'Collapse'} ${this.title}`);
    this.collapseBtn.textContent = g.collapsed ? '▸' : '▾';
  }

  /** Keeps at least the header on screen. */
  clamp(viewW: number, viewH: number): void {
    const w = this.el.offsetWidth || 240;
    this.geometry.x = Math.round(Math.min(Math.max(this.geometry.x, -w + 80), Math.max(0, viewW - 80)));
    this.geometry.y = Math.round(Math.min(Math.max(this.geometry.y, 0), Math.max(0, viewH - 40)));
    this.apply();
  }

  moveTo(x: number, y: number): void {
    this.geometry.x = x;
    this.geometry.y = y;
    this.clamp(window.innerWidth, window.innerHeight);
    this.host.saveGeometry(this);
  }

  setCollapsed(collapsed: boolean): void {
    this.geometry.collapsed = collapsed;
    this.apply();
    this.host.saveGeometry(this);
  }

  setHidden(hidden: boolean): void {
    this.geometry.hidden = hidden;
    this.apply();
    this.host.saveGeometry(this);
    this.host.onVisibilityChange(this);
    this.host.announce(`${this.title} panel ${hidden ? 'hidden' : 'shown'}`);
    if (!hidden) this.moveBtn.focus();
  }

  get hidden(): boolean {
    return this.geometry.hidden;
  }

  reset(): void {
    this.geometry = { ...this.defaults };
    this.apply();
    this.host.saveGeometry(this);
  }

  focus(): void {
    this.moveBtn.focus();
  }

  private onMoveKey(e: KeyboardEvent): void {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    this.moveTo(this.geometry.x + delta[0], this.geometry.y + delta[1]);
    this.host.announce(`${this.title} moved to ${this.geometry.x}, ${this.geometry.y}`);
  }

  private onPointerDown(e: PointerEvent, header: HTMLElement): void {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || (target.closest('button') && !target.closest('.pm-move'))) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = this.geometry.x;
    const oy = this.geometry.y;
    header.setPointerCapture?.(e.pointerId);
    this.el.classList.add('pm-dragging');
    const move = (ev: PointerEvent) => {
      this.geometry.x = ox + ev.clientX - startX;
      this.geometry.y = oy + ev.clientY - startY;
      this.clamp(window.innerWidth, window.innerHeight);
    };
    const up = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
      header.removeEventListener('pointercancel', up);
      this.el.classList.remove('pm-dragging');
      this.host.saveGeometry(this);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
  }
}
