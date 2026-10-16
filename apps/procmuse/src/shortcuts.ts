/** The app's keyboard shortcuts. All are listed in the help dialog (press ?). */
import { P, STYLES } from '@procmuse/engine';
import type { Workspace } from '@procmuse/ui';
import type { WebEngine } from '@procmuse/web';
import { togglePlay } from './panels.js';

export function registerShortcuts(ws: Workspace, engine: WebEngine): void {
  const s = ws.shortcuts;
  const nudge = (delta: number) => {
    const v = Math.min(1, Math.max(0, Math.round(((engine.get(P.energy) as number) + delta) * 100) / 100));
    engine.set(P.energy, v);
    ws.announce(`Energy ${Math.round(v * 100)}%`);
  };
  s.register({ key: ' ', keyLabel: 'Space', description: 'Play or pause', run: () => void togglePlay(ws, engine) });
  s.register({ key: 'r', keyLabel: 'R', description: 'New idea: a fresh composition', run: () => engine.command({ type: 'regenerate' }) });
  s.register({ key: 'n', keyLabel: 'N', description: 'Jump to the next section', run: () => engine.command({ type: 'nextSection' }) });
  s.register({ key: 'd', keyLabel: 'D', description: 'Drop now', run: () => engine.command({ type: 'nextSection', kind: 'drop' }) });
  s.register({ key: 'b', keyLabel: 'B', description: 'Breakdown now', run: () => engine.command({ type: 'nextSection', kind: 'break' }) });
  s.register({ key: '+', keyLabel: '+', description: 'More energy', run: () => nudge(0.05) });
  s.register({ key: '-', keyLabel: '−', description: 'Less energy', run: () => nudge(-0.05) });
  const stepStyle = (delta: number) => {
    const i = STYLES.findIndex((x) => x.id === engine.get(P.style));
    engine.set(P.style, (STYLES[(i + delta + STYLES.length) % STYLES.length] as (typeof STYLES)[number]).id);
  };
  s.register({ key: '[', keyLabel: '[', description: 'Previous style', run: () => stepStyle(-1) });
  s.register({ key: ']', keyLabel: ']', description: 'Next style', run: () => stepStyle(1) });
  s.register({ key: 'h', keyLabel: 'H', description: 'Hide or show the interface', run: () => ws.toggleAll() });
  s.register({ key: 'l', keyLabel: 'L', description: 'Reset the panel layout', run: () => ws.resetLayout() });
  s.register({ key: '?', keyLabel: '?', description: 'Show this help', run: () => ws.shortcuts.openHelp() });
}
