/** UI preferences, declared as parameters so the settings panel is generated like every other panel. */
import { ParamStore, type ParamSpec } from '@procmuse/engine';

export const UI = {
  opacity: 'ui.opacity',
  scale: 'ui.scale',
  contrast: 'ui.contrast',
  compact: 'ui.compact',
  announce: 'ui.announce',
  motion: 'ui.motion',
} as const;

export function uiSettingSpecs(prefersContrast: boolean, prefersLessMotion: boolean): ParamSpec[] {
  return [
    {
      kind: 'number',
      id: UI.opacity,
      label: 'Panel opacity',
      description: 'How solid the panels are. Higher values make text easier to read over the animation.',
      group: 'Interface',
      min: 0.5,
      max: 1,
      step: 0.01,
      default: 0.78,
    },
    {
      kind: 'number',
      id: UI.scale,
      label: 'Text size',
      description: 'Scales all panel text and controls.',
      group: 'Interface',
      min: 0.8,
      max: 1.8,
      step: 0.05,
      default: 1,
      unit: '×',
    },
    {
      kind: 'bool',
      id: UI.contrast,
      label: 'High contrast',
      description: 'Solid black panels, white text and strong outlines.',
      group: 'Interface',
      default: prefersContrast,
    },
    {
      kind: 'bool',
      id: UI.compact,
      label: 'Compact',
      description: 'Hides the help text under each control (screen readers still hear it).',
      group: 'Interface',
      default: false,
    },
    {
      kind: 'bool',
      id: UI.announce,
      label: 'Announce music changes',
      description: 'Screen readers announce new sections and keys as the music evolves.',
      group: 'Interface',
      default: true,
    },
    {
      kind: 'bool',
      id: UI.motion,
      label: 'Interface animation',
      description: 'Glows and transitions in the panels themselves.',
      group: 'Interface',
      default: !prefersLessMotion,
    },
  ];
}

export function createUiSettings(prefersContrast = false, prefersLessMotion = false): ParamStore {
  return new ParamStore(uiSettingSpecs(prefersContrast, prefersLessMotion));
}
