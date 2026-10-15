/** THE scene list, and the one function that assembles a scene's fragment source. */
import { PRELUDE, SCENE_MAIN } from '../glsl/prelude.js';
import { grid } from './grid.js';
import { kaleido } from './kaleido.js';
import { nebula } from './nebula.js';
import { tron } from './tron.js';
import { tunnel } from './tunnel.js';
import type { SceneDef } from './types.js';

export const SCENES = [tunnel, grid, nebula, kaleido, tron] as const satisfies readonly SceneDef[];
export type SceneId = (typeof SCENES)[number]['id'];
export const SCENE_IDS: readonly SceneId[] = SCENES.map((s) => s.id);

/** Public metadata (no GLSL) for pickers and docs. */
export interface SceneInfo {
  id: SceneId;
  label: string;
  description: string;
}
export const SCENE_INFO: readonly SceneInfo[] = SCENES.map(({ id, label, description }) => ({ id, label, description }));

export function sceneSource(scene: SceneDef): string {
  return PRELUDE + scene.body + SCENE_MAIN;
}
