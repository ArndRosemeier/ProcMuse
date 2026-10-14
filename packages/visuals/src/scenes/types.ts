/** A scene is metadata plus a GLSL body that defines `vec3 sceneColor(vec2 uv)` (HDR, before uGain and tonemap). */
export interface SceneDef {
  id: string;
  label: string;
  /** One sentence for the scene picker and screen readers. */
  description: string;
  /**
   * GLSL body. It may use everything in the prelude, must define
   * `vec3 sceneColor(vec2 uv)`, and must prefix its own helpers with the
   * scene id so no name is defined twice across sources.
   */
  body: string;
}
