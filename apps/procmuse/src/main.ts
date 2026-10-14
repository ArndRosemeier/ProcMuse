/**
 * ProcMuse app: a start screen, then the engine in an AudioWorklet, the
 * visuals on the canvas, and the floating control workspace on top.
 */
import { P, getStyle, type EngineEvent } from '@procmuse/engine';
import { Workspace, browserStore, captureGlobalErrors, h } from '@procmuse/ui';
import { WebEngine } from '@procmuse/web';
import processorUrl from '@procmuse/web/processor?worker&url';
import { buildPanels } from './panels.js';
import { decodePreset, applyPreset, type PresetTarget } from './presets.js';
import { registerShortcuts } from './shortcuts.js';
import { sectionLabel } from './nowPlaying.js';
import { createVisualLayer, type VisualLayer } from './visualsLayer.js';

const host = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const store = browserStore();

function startScreen(onStart: () => Promise<void>): void {
  const status = h('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const button = h('button', { class: 'pm-start-button', text: 'Start the music', attrs: { type: 'button' } });
  const screen = h(
    'section',
    { class: 'pm-start', attrs: { 'aria-labelledby': 'pm-start-title' } },
    h(
      'div',
      { class: 'pm-start-card' },
      h('h1', { text: 'ProcMuse', attrs: { id: 'pm-start-title' } }),
      h('p', { text: 'Endless music, composed live, with a light show that dances to it. Shape the mood, the band and the visuals as it plays.' }),
      button,
      status,
      h('small', { text: 'Headphones recommended. Everything works by keyboard: press ? at any time for shortcuts.' }),
    ),
  );
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Starting…';
    try {
      await onStart();
      screen.remove();
    } catch (err) {
      button.disabled = false;
      status.className = 'pm-start-error';
      status.textContent = `Could not start: ${(err as Error).message}`;
      console.error(err);
    }
  });
  document.body.append(screen);
  button.focus();
}

async function start(): Promise<void> {
  const engine = await WebEngine.create({ processorUrl });
  const ws = new Workspace(host, { store, label: 'ProcMuse controls' });
  captureGlobalErrors(ws.errors);
  engine.on('error', (err) => ws.errors.show(err, 'Audio engine'));

  let visuals: VisualLayer | null = null;
  try {
    visuals = await createVisualLayer(canvas);
  } catch (err) {
    ws.errors.show(err, 'Visuals are unavailable, the music plays on');
  }

  const targets: PresetTarget[] = [{ name: 'music', source: engine }];
  if (visuals?.source) targets.push({ name: 'visuals', source: visuals.source });

  // a shared link (#p=...) restores someone's settings
  const shared = new URLSearchParams(location.hash.slice(1)).get('p');
  if (shared) {
    try {
      applyPreset(targets, decodePreset(shared));
    } catch (err) {
      ws.errors.show(err, 'Shared settings could not be applied');
    }
  }

  const ui = buildPanels({ ws, engine, visuals, targets, store });
  registerShortcuts(ws, engine);

  engine.on('event', (e: EngineEvent) => {
    if (e.type === 'section') ws.announcer.say(`${sectionLabel(e.kind)}`, 'section', 6000);
  });
  engine.on('param', ({ id, value }) => {
    if (id === P.style) ws.announcer.say(`Style: ${getStyle(String(value)).name}`, 'style', 0);
  });

  let hue = 0.5;
  const frame = (t: number) => {
    const state = engine.musicState();
    // accent colour follows the harmony, smoothed so it glides between chords
    const target = state.chord.hue;
    let d = target - hue;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    hue = (hue + d * 0.03 + 1) % 1;
    ws.setAccentHue(hue);
    ui.nowPlaying.update(state, getStyle(String(engine.get(P.style))).name);
    if (visuals) {
      try {
        visuals.frame(state, t / 1000);
      } catch (err) {
        ws.errors.show(err, 'Visuals stopped');
        visuals = null;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => visuals?.resize());

  await engine.play();
  ws.refreshActions();
}

startScreen(start);
