/** The one DOM-building helper used by every UI module. */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  /** attributes; `true` sets an empty attribute, `false`/undefined skips it */
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  style?: Partial<Record<string, string>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn as EventListener);
  for (const [k, v] of Object.entries(props.style ?? {})) if (v !== undefined) el.style.setProperty(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

let counter = 0;
/** Unique DOM id for label/description wiring. */
export function uid(prefix: string): string {
  counter += 1;
  return `pm-${prefix}-${counter}`;
}

/** Is the keyboard event aimed at a text-entry control (where shortcuts must not fire)? */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }
  return false;
}
