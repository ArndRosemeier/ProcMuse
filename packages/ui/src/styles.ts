/** The UI stylesheet, installed once per document. Colours are tokens; the accent hue follows the music. */

const CSS = `
.pm-root {
  --pm-hue: 190;
  --pm-opacity: 0.78;
  --pm-scale: 1;
  --pm-accent: hsl(var(--pm-hue) 100% 68%);
  --pm-accent-2: hsl(calc(var(--pm-hue) + 140) 95% 70%);
  --pm-text: #f5f3ff;
  --pm-muted: #c9c4e6;
  --pm-bg: rgb(14 11 28 / var(--pm-opacity));
  --pm-bg-solid: rgb(14 11 28);
  --pm-border: hsl(var(--pm-hue) 80% 70% / 0.45);
  --pm-focus: #ffe066;
  --pm-radius: 14px;
  position: fixed;
  inset: 0;
  pointer-events: none;
  font: calc(15px * var(--pm-scale)) / 1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--pm-text);
  z-index: 10;
}
.pm-root * { box-sizing: border-box; }
/* The ONE hidden rule: component display styles must never un-hide an element. */
.pm-root [hidden] { display: none !important; }
.pm-root.pm-contrast {
  --pm-opacity: 1;
  --pm-text: #ffffff;
  --pm-muted: #ffffff;
  --pm-bg: #000000;
  --pm-accent: #ffe600;
  --pm-accent-2: #00e5ff;
  --pm-border: #ffffff;
}
@media (prefers-reduced-transparency: reduce) {
  .pm-root { --pm-opacity: 0.96 !important; }
}
.pm-layer, .pm-dock, .pm-errors, .pm-dialog { pointer-events: auto; }
.pm-layer { position: absolute; inset: 0; pointer-events: none; }
.pm-sr-only {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* panels */
.pm-panel {
  position: absolute;
  pointer-events: auto;
  width: var(--pm-panel-w, 21em);
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 90px);
  max-height: calc(100dvh - 90px);
  display: flex;
  flex-direction: column;
  background: var(--pm-bg);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 12px 40px rgb(0 0 0 / 0.45), 0 0 28px hsl(var(--pm-hue) 100% 60% / 0.18);
  transition: box-shadow 0.4s, border-color 0.4s;
}
.pm-panel.pm-dragging { box-shadow: 0 0 0 2px var(--pm-accent), 0 20px 60px rgb(0 0 0 / 0.6); }
.pm-panel-header {
  display: flex; align-items: center; gap: 0.35em;
  padding: 0.35em 0.45em 0.35em 0.35em;
  cursor: grab;
  touch-action: none;
  user-select: none;
  border-bottom: 1px solid var(--pm-border);
  background: linear-gradient(90deg, hsl(var(--pm-hue) 90% 55% / 0.22), hsl(calc(var(--pm-hue) + 140) 90% 55% / 0.12));
  border-radius: var(--pm-radius) var(--pm-radius) 0 0;
}
.pm-dragging .pm-panel-header { cursor: grabbing; }
.pm-panel-title {
  flex: 1; margin: 0; font-size: 1em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
}
.pm-panel-body { overflow: auto; padding: 0.6em 0.8em 0.8em; overscroll-behavior: contain; }

/* buttons */
.pm-icon-btn, .pm-btn, .pm-dock-btn, .pm-reset, .pm-disclosure {
  font: inherit; color: var(--pm-text); cursor: pointer;
  touch-action: manipulation;
  background: rgb(255 255 255 / 0.06);
  border: 1px solid var(--pm-border);
  border-radius: 999px;
}
.pm-icon-btn { min-width: 2.2em; min-height: 2.2em; display: inline-grid; place-items: center; padding: 0; }
.pm-btn { padding: 0.5em 1.1em; min-height: 2.6em; font-weight: 600; }
.pm-btn-primary { background: var(--pm-accent); color: #0b0716; border-color: transparent; }
@media (hover: hover) {
  .pm-icon-btn:hover, .pm-btn:hover, .pm-dock-btn:hover, .pm-reset:hover, .pm-disclosure:hover { background: hsl(var(--pm-hue) 90% 60% / 0.28); }
}
.pm-root :focus-visible, .pm-start :focus-visible {
  outline: 3px solid var(--pm-focus);
  outline-offset: 2px;
}
.pm-move { cursor: move; }

/* controls */
.pm-group { margin: 0 0 0.9em; }
.pm-group-title {
  margin: 0.4em 0 0.5em; font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; color: var(--pm-accent);
}
.pm-control { margin: 0 0 0.75em; }
.pm-control-head { display: flex; align-items: baseline; gap: 0.5em; }
.pm-label { flex: 1; font-weight: 600; }
.pm-value { font-variant-numeric: tabular-nums; color: var(--pm-accent); min-width: 4ch; text-align: right; }
.pm-reset {
  border-radius: 50%; width: 1.9em; height: 1.9em; padding: 0; font-size: 0.85em; opacity: 0.75;
}
.pm-help { margin: 0.2em 0 0; font-size: 0.82em; color: var(--pm-muted); }
.pm-compact .pm-help { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pm-range {
  width: 100%; height: 2.2em; margin: 0.1em 0 0; background: transparent; cursor: pointer;
  accent-color: var(--pm-accent);
  -webkit-appearance: none; appearance: none;
}
.pm-range::-webkit-slider-runnable-track {
  height: 0.5em; border-radius: 1em;
  background: linear-gradient(90deg, var(--pm-accent), var(--pm-accent-2));
}
.pm-range::-moz-range-track {
  height: 0.5em; border-radius: 1em;
  background: linear-gradient(90deg, var(--pm-accent), var(--pm-accent-2));
}
.pm-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 1.4em; height: 1.4em; margin-top: -0.45em; border-radius: 50%;
  background: #fff; border: 3px solid var(--pm-bg-solid); box-shadow: 0 0 10px var(--pm-accent);
}
.pm-range::-moz-range-thumb {
  width: 1.2em; height: 1.2em; border-radius: 50%; background: #fff; border: 3px solid var(--pm-bg-solid);
}
.pm-select, .pm-search {
  width: 100%; min-height: 2.4em; margin-top: 0.25em; font: inherit; color: var(--pm-text);
  background: rgb(0 0 0 / 0.35); border: 1px solid var(--pm-border); border-radius: 10px; padding: 0.3em 0.6em;
}
.pm-select option { background: var(--pm-bg-solid); color: var(--pm-text); }
.pm-segmented { display: flex; flex-wrap: wrap; gap: 0.3em; margin-top: 0.3em; }
.pm-segment { position: relative; }
.pm-segment input { position: absolute; opacity: 0; inset: 0; margin: 0; }
.pm-segment label {
  display: inline-block; padding: 0.35em 0.8em; min-height: 2.2em; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pm-border); background: rgb(255 255 255 / 0.05);
}
.pm-segment input:checked + label { background: var(--pm-accent); color: #0b0716; font-weight: 700; border-color: transparent; }
.pm-segment input:focus-visible + label { outline: 3px solid var(--pm-focus); outline-offset: 2px; }
.pm-switch {
  margin-top: 0.3em; width: 3.4em; height: 1.9em; border-radius: 1em; position: relative; cursor: pointer;
  border: 1px solid var(--pm-border); background: rgb(255 255 255 / 0.1);
}
.pm-switch-knob {
  position: absolute; top: 0.2em; left: 0.2em; width: 1.4em; height: 1.4em; border-radius: 50%; background: #fff;
  transition: transform 0.15s;
}
.pm-switch[aria-checked="true"] { background: var(--pm-accent); }
.pm-switch[aria-checked="true"] .pm-switch-knob { transform: translateX(1.5em); background: #0b0716; }
.pm-disclosure { width: 100%; padding: 0.45em 0.8em; text-align: left; border-radius: 10px; }
.pm-disclosure::before { content: "▸ "; }
.pm-disclosure[aria-expanded="true"]::before { content: "▾ "; }
.pm-advanced { margin-top: 0.7em; }
.pm-search-row { margin-bottom: 0.6em; }
.pm-empty { color: var(--pm-muted); }

/* dock */
.pm-dock {
  position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.4em;
  max-width: calc(100vw - 16px);
  padding: 0.4em; border-radius: 999px;
  background: var(--pm-bg); border: 1px solid var(--pm-border);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.pm-dock-actions, .pm-dock-panels { display: flex; flex-wrap: wrap; gap: 0.3em; }
.pm-dock-btn { min-height: 2.4em; padding: 0.3em 0.9em; }
.pm-dock-action { min-width: 2.6em; padding: 0.3em; font-size: 1.05em; }
.pm-dock-btn[aria-pressed="true"] { background: hsl(var(--pm-hue) 90% 60% / 0.32); border-color: var(--pm-accent); }
.pm-hidden-all .pm-layer, .pm-hidden-all .pm-dock-panels, .pm-hidden-all .pm-dock-action:not([data-keep]) { display: none; }
.pm-hidden-all .pm-dock { opacity: 0.35; background: transparent; border-color: transparent; }
.pm-hidden-all .pm-dock:hover, .pm-hidden-all .pm-dock:focus-within { opacity: 1; }

/* sheet layout (small screens): one panel docked above a full-width dock */
.pm-sheet .pm-dock {
  left: 0; right: 0; bottom: 0; transform: none; max-width: none;
  flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 0.3em;
  border-radius: var(--pm-radius) var(--pm-radius) 0 0; border-bottom: 0;
  padding: 0.4em max(0.4em, env(safe-area-inset-right)) max(0.4em, env(safe-area-inset-bottom)) max(0.4em, env(safe-area-inset-left));
}
.pm-sheet .pm-dock-actions { justify-content: center; }
/* the panel row scrolls sideways instead of wrapping into a tall stack */
.pm-sheet .pm-dock-panels { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
.pm-sheet .pm-dock-panels::-webkit-scrollbar { display: none; }
.pm-sheet .pm-dock-panels > .pm-dock-btn { flex: 0 0 auto; }
.pm-sheet .pm-panel {
  position: fixed; top: auto; left: max(0px, env(safe-area-inset-left)); right: max(0px, env(safe-area-inset-right));
  bottom: var(--pm-dock-h, 6.5em);
  width: auto; max-width: none;
  max-height: min(58vh, calc(100vh - var(--pm-dock-h, 6.5em) - 12px));
  max-height: min(58dvh, calc(100dvh - var(--pm-dock-h, 6.5em) - 12px));
  border-bottom: 0; border-radius: var(--pm-radius) var(--pm-radius) 0 0;
}
.pm-sheet .pm-panel-header { cursor: default; }
@media (orientation: landscape) {
  /* short screen: the dock is one row and the sheet a side panel over the right of the visuals */
  .pm-sheet .pm-dock { flex-direction: row; justify-content: flex-start; }
  .pm-sheet .pm-dock-actions { flex-wrap: nowrap; flex: 0 0 auto; }
  .pm-sheet .pm-dock-panels { flex: 1 1 auto; }
  .pm-sheet .pm-panel {
    left: auto; width: min(24em, 55vw);
    max-height: calc(100vh - var(--pm-dock-h, 3.5em) - 12px - env(safe-area-inset-top));
    max-height: calc(100dvh - var(--pm-dock-h, 3.5em) - 12px - env(safe-area-inset-top));
  }
}

/* touch: fingers need bigger targets (44 px), and inputs under 16 px make iOS zoom the page */
@media (pointer: coarse) {
  .pm-icon-btn, .pm-dock-action { min-width: 2.9em; min-height: 2.9em; }
  .pm-dock-btn, .pm-btn, .pm-disclosure { min-height: 2.9em; }
  .pm-reset { width: 3.4em; height: 3.4em; } /* its font is 0.85em */
  .pm-segment label { min-height: 2.9em; padding: 0.6em 0.9em; }
  .pm-range { height: 2.9em; }
  .pm-range::-webkit-slider-thumb { width: 1.8em; height: 1.8em; margin-top: -0.65em; }
  .pm-range::-moz-range-thumb { width: 1.6em; height: 1.6em; }
  .pm-switch { width: 3.8em; height: 2.2em; }
  .pm-switch-knob { width: 1.7em; height: 1.7em; }
  .pm-switch[aria-checked="true"] .pm-switch-knob { transform: translateX(1.6em); }
  .pm-select, .pm-search { min-height: 2.9em; font-size: max(16px, 1em); }
}

/* errors */
.pm-errors { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: min(40em, calc(100vw - 24px)); z-index: 1000; }
.pm-error-list { list-style: none; margin: 0; padding: 0; }
.pm-error {
  display: flex; gap: 0.5em; align-items: center; margin-bottom: 0.4em; padding: 0.6em 0.8em;
  background: #3b0712; border: 2px solid #ff6b81; border-radius: 10px; color: #fff;
}
.pm-error span { flex: 1; }

/* dialogs */
.pm-dialog {
  color: var(--pm-text); background: var(--pm-bg-solid); border: 1px solid var(--pm-border); border-radius: var(--pm-radius);
  max-width: min(36em, calc(100vw - 24px)); padding: 1.2em 1.4em;
  font: calc(15px * var(--pm-scale)) / 1.45 system-ui, sans-serif;
}
.pm-dialog::backdrop { background: rgb(0 0 0 / 0.6); }
.pm-shortcut-table { width: 100%; border-collapse: collapse; margin: 0.6em 0 1em; }
.pm-shortcut-table td, .pm-shortcut-table th { text-align: left; padding: 0.3em 0.4em; border-bottom: 1px solid rgb(255 255 255 / 0.1); }
.pm-root kbd, .pm-dialog kbd {
  font: 0.9em ui-monospace, monospace; padding: 0.1em 0.45em; border-radius: 6px; border: 1px solid var(--pm-border); background: rgb(255 255 255 / 0.08);
}

.pm-still *, .pm-still *::before, .pm-still *::after { transition: none !important; animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  .pm-root *, .pm-root *::before, .pm-root *::after { transition: none !important; animation: none !important; }
}
`;

const MARK = 'data-procmuse-ui';

export function installStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${MARK}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = CSS;
  doc.head.append(style);
}
