/**
 * Workspace: the layer over the visuals. Owns the panels, the dock that
 * toggles them, UI preferences, shortcuts, announcements and the error
 * surface, and persists layout and preferences.
 *
 * Layout: on large screens panels float where the user puts them; on small
 * screens (SHEET_QUERY: phones, portrait or landscape) they become ONE sheet
 * above a full-width dock, and the dock buttons switch between them. Both
 * layouts are remembered separately, so rotating a tablet keeps each intact.
 */
import type { ParamStore, ParamValue } from '@procmuse/engine';
import { Announcer } from './announcer.js';
import { h } from './dom.js';
import { ErrorSurface } from './errors.js';
import { FloatingPanel, type LayoutMode, type PanelGeometry, type PanelHost, type PanelOptions } from './panel.js';
import { createUiSettings, UI } from './settings.js';
import { Shortcuts } from './shortcuts.js';
import { browserStore, type KeyValueStore } from './storage.js';
import { installStyles } from './styles.js';

/** Screens this small use the sheet layout. Landscape phones are short rather than narrow. */
export const SHEET_QUERY = '(max-width: 640px), (max-height: 500px)';

export interface WorkspaceOptions {
  store?: KeyValueStore;
  /** label for the main landmark */
  label?: string;
  /** `auto` (default) follows SHEET_QUERY as the screen changes; a fixed mode pins it. */
  layout?: LayoutMode | 'auto';
}

export interface DockAction {
  id: string;
  label: string;
  icon: string;
  run: () => void;
  /** current pressed state for toggle actions */
  pressed?: () => boolean;
  /** stays visible when the interface is hidden (e.g. the "show interface" toggle) */
  keep?: boolean;
}

export class Workspace implements PanelHost {
  readonly root: HTMLElement;
  readonly layer: HTMLElement;
  readonly dock: HTMLElement;
  readonly settings: ParamStore;
  readonly shortcuts = new Shortcuts();
  readonly announcer = new Announcer();
  readonly errors = new ErrorSurface();
  readonly panels: FloatingPanel[] = [];
  private readonly store: KeyValueStore;
  private readonly panelButtons = new Map<string, HTMLButtonElement>();
  private readonly actionsEl: HTMLElement;
  private readonly actions: { action: DockAction; btn: HTMLButtonElement }[] = [];
  private z = 10;
  private hiddenAll = false;
  private mode: LayoutMode = 'float';
  /** the open sheet's panel id; '' = none open; null = never chosen (the first panel shown by default opens) */
  private sheetId: string | null;

  constructor(host: HTMLElement, options: WorkspaceOptions = {}) {
    installStyles(host.ownerDocument);
    this.store = options.store ?? browserStore();
    const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
    this.settings = createUiSettings(mq('(prefers-contrast: more)'), mq('(prefers-reduced-motion: reduce)'));
    const saved = this.store.get('ui-settings');
    if (saved) {
      try {
        const values = JSON.parse(saved) as Record<string, unknown>;
        for (const [k, v] of Object.entries(values)) if (this.settings.has(k)) this.settings.set(k, v);
      } catch (err) {
        this.errors.show(err, 'Saved interface settings were unreadable and were reset');
      }
    }
    this.layer = h('div', { class: 'pm-layer' });
    this.actionsEl = h('div', { class: 'pm-dock-actions' });
    this.dock = h('nav', { class: 'pm-dock', attrs: { 'aria-label': 'Panels and actions' } }, this.actionsEl, h('div', { class: 'pm-dock-panels' }));
    this.root = h(
      'div',
      { class: 'pm-root', attrs: { role: 'main', 'aria-label': options.label ?? 'Controls' } },
      this.errors.el,
      this.layer,
      this.dock,
      this.announcer.el,
      this.shortcuts.dialog,
    );
    host.append(this.root);
    this.sheetId = this.store.get('sheet-panel');
    this.followLayout(options.layout ?? 'auto');
    // the sheet sits on top of the dock, whose height depends on how its buttons wrap
    new ResizeObserver(() => this.root.style.setProperty('--pm-dock-h', `${Math.ceil(this.dock.getBoundingClientRect().height)}px`)).observe(this.dock);
    this.settings.onParam((id, v) => this.applySetting(id, v));
    for (const s of this.settings.specs) this.applySetting(s.id, this.settings.get(s.id));
    this.shortcuts.attach(host.ownerDocument);
    window.addEventListener('resize', () => this.panels.forEach((p) => p.clamp(window.innerWidth, window.innerHeight)));
  }

  private applySetting(id: string, v: ParamValue): void {
    const r = this.root;
    switch (id) {
      case UI.opacity:
        r.style.setProperty('--pm-opacity', String(v));
        break;
      case UI.scale:
        r.style.setProperty('--pm-scale', String(v));
        break;
      case UI.contrast:
        r.classList.toggle('pm-contrast', v === true);
        break;
      case UI.compact:
        r.classList.toggle('pm-compact', v === true);
        break;
      case UI.announce:
        this.announcer.enabled = v === true;
        break;
      case UI.motion:
        r.classList.toggle('pm-still', v === false);
        break;
    }
    this.store.set('ui-settings', JSON.stringify(this.settings.snapshot()));
  }

  private followLayout(layout: LayoutMode | 'auto'): void {
    if (layout !== 'auto') {
      this.setLayout(layout);
      return;
    }
    const mq = matchMedia(SHEET_QUERY);
    this.setLayout(mq.matches ? 'sheet' : 'float');
    mq.addEventListener('change', (e) => this.setLayout(e.matches ? 'sheet' : 'float'));
  }

  /** The current layout: floating windows, or one sheet at a time. */
  get layout(): LayoutMode {
    return this.mode;
  }

  setLayout(mode: LayoutMode): void {
    this.mode = mode;
    this.root.classList.toggle('pm-sheet', mode === 'sheet');
    this.applyLayout();
  }

  private openSheetId(): string {
    return this.sheetId ?? this.panels.find((p) => p.shownByDefault)?.id ?? '';
  }

  private applyLayout(): void {
    const open = this.openSheetId();
    for (const p of this.panels) {
      p.setLayout(this.mode, this.mode === 'sheet' && p.id === open);
      this.onVisibilityChange(p);
    }
    if (this.mode === 'float') this.panels.forEach((p) => p.clamp(window.innerWidth, window.innerHeight));
  }

  setSheet(panel: FloatingPanel, open: boolean): void {
    this.sheetId = open ? panel.id : '';
    this.store.set('sheet-panel', this.sheetId);
    this.applyLayout();
  }

  addPanel(options: PanelOptions): FloatingPanel {
    const panel = new FloatingPanel(this, options);
    this.panels.push(panel);
    this.layer.append(panel.el);
    const btn = h('button', {
      class: 'pm-dock-btn',
      text: options.title,
      attrs: { type: 'button', 'aria-pressed': String(!panel.hidden) },
      on: { click: () => panel.setHidden(!panel.hidden) },
    });
    this.panelButtons.set(panel.id, btn);
    this.dock.querySelector('.pm-dock-panels')?.append(btn);
    this.applyLayout();
    queueMicrotask(() => panel.clamp(window.innerWidth, window.innerHeight));
    return panel;
  }

  addAction(action: DockAction): HTMLButtonElement {
    const btn = h(
      'button',
      {
        class: 'pm-dock-btn pm-dock-action',
        attrs: {
          type: 'button',
          'aria-label': action.label,
          title: action.label,
          'aria-pressed': action.pressed ? String(action.pressed()) : undefined,
          'data-keep': action.keep,
        },
        on: { click: () => action.run() },
      },
      h('span', { text: action.icon, attrs: { 'aria-hidden': 'true' } }),
    );
    this.actions.push({ action, btn });
    this.actionsEl.append(btn);
    return btn;
  }

  /** Re-reads every toggle action's pressed state. */
  refreshActions(): void {
    for (const { action, btn } of this.actions) if (action.pressed) btn.setAttribute('aria-pressed', String(action.pressed()));
  }

  bringToFront(panel: FloatingPanel): void {
    panel.el.style.zIndex = String(++this.z);
  }

  saveGeometry(panel: FloatingPanel): void {
    this.store.set(`panel:${panel.id}`, JSON.stringify(panel.geometry));
  }

  loadGeometry(id: string): PanelGeometry | null {
    const raw = this.store.get(`panel:${id}`);
    if (!raw) return null;
    try {
      const g = JSON.parse(raw) as PanelGeometry;
      if (typeof g.x !== 'number' || typeof g.y !== 'number') throw new Error('bad geometry');
      return g;
    } catch (err) {
      this.errors.show(err, `Saved position of the ${id} panel was unreadable and was reset`);
      return null;
    }
  }

  announce(text: string): void {
    this.announcer.say(text, 'ui', 0, true);
  }

  onVisibilityChange(panel: FloatingPanel): void {
    this.panelButtons.get(panel.id)?.setAttribute('aria-pressed', String(!panel.hidden));
  }

  /** Hides or shows the whole interface (the visuals stay). */
  toggleAll(): void {
    this.hiddenAll = !this.hiddenAll;
    this.root.classList.toggle('pm-hidden-all', this.hiddenAll);
    this.announce(this.hiddenAll ? 'Interface hidden. Press H to show it again.' : 'Interface shown');
    this.refreshActions();
  }

  get allHidden(): boolean {
    return this.hiddenAll;
  }

  resetLayout(): void {
    for (const p of this.panels) p.reset();
    this.sheetId = null;
    this.sheetId = this.openSheetId();
    this.store.set('sheet-panel', this.sheetId);
    this.applyLayout();
    this.announce('Panel layout reset');
  }

  /** Sets the accent hue (0..1) — the app ties it to the music's harmony. */
  setAccentHue(hue: number): void {
    this.root.style.setProperty('--pm-hue', String(Math.round(hue * 360)));
  }
}
