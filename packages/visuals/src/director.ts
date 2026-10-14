/**
 * Which scene plays, and the crossfade between scenes. Pure: the renderer asks
 * `stepDirector` each frame and draws `from` (and `to`, blended by `fade`).
 */
import type { MusicState } from '@procmuse/engine';
import type { SceneChoice } from './params.js';
import { SCENES, type SceneId } from './scenes/registry.js';

const FLAGSHIP: SceneId = 'tunnel';
const ROTATION: readonly SceneId[] = SCENES.map((s) => s.id).filter((id) => id !== FLAGSHIP);

/** The scene a choice resolves to for the current section. `auto`: tunnel for the first section and every drop, otherwise a rotation by section index. */
export function resolveScene(choice: SceneChoice, section: Pick<MusicState['section'], 'kind' | 'index'>): SceneId {
  if (choice !== 'auto') return choice;
  if (section.index === 0 || section.kind === 'drop') return FLAGSHIP;
  return ROTATION[(section.index - 1) % ROTATION.length] as SceneId;
}

export interface DirectorState {
  from: SceneId;
  to: SceneId | null;
  /** 0..1 progress of the fade from `from` to `to` */
  fade: number;
}

export const initialDirector = (scene: SceneId): DirectorState => ({ from: scene, to: null, fade: 0 });

/**
 * Advances the crossfade. A new desired scene starts a fade only when no fade
 * is running; a change requested mid-fade waits for it to finish, so the
 * picture never cuts.
 */
export function stepDirector(prev: DirectorState, desired: SceneId, dt: number, fadeSeconds: number): DirectorState {
  if (prev.to === null) return desired === prev.from ? prev : { from: prev.from, to: desired, fade: 0 };
  const fade = prev.fade + Math.max(0, dt) / Math.max(1e-3, fadeSeconds);
  if (fade >= 1) return { from: prev.to, to: null, fade: 0 };
  return { from: prev.from, to: prev.to, fade };
}
