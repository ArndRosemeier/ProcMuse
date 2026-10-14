/**
 * The composite pass: crossfades the two scene textures, adds the (already
 * rate-limited) flash, vignette and grain, and writes to the canvas.
 */
import { PRELUDE } from './prelude.js';

export const COMPOSITE_BODY = `
void main() {
  vec2 st = gl_FragCoord.xy / uResolution;
  vec3 a = texture(uSceneA, st).rgb;
  vec3 b = texture(uSceneB, st).rgb;
  vec3 c = mix(a, b, smoothstep(0.0, 1.0, uFade));
  c += uFlash * (1.0 - c);
  vec2 u = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  c *= 1.0 - 0.45 * dot(u, u);
  c += grain(gl_FragCoord.xy) * uGrain;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const COMPOSITE_SOURCE = PRELUDE + COMPOSITE_BODY;
