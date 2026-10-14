/** @procmuse/ui — accessible, translucent, movable control panels generated from parameter specs. */
export { Workspace, type WorkspaceOptions, type DockAction } from './workspace.js';
export { FloatingPanel, type PanelOptions, type PanelGeometry } from './panel.js';
export { createControl, type Control } from './controls.js';
export { createParamView, type ParamView, type ParamViewOptions } from './paramView.js';
export { Announcer } from './announcer.js';
export { ErrorSurface, captureGlobalErrors } from './errors.js';
export { Shortcuts, type Shortcut } from './shortcuts.js';
export { UI, createUiSettings, uiSettingSpecs } from './settings.js';
export { browserStore, memoryStore, type KeyValueStore } from './storage.js';
export { installStyles } from './styles.js';
export { h, uid, isTyping } from './dom.js';
export { formatNumber, nextSliderValue, sliderToValue, valueToSlider } from './format.js';
