/**
 * The flagship: a port of the 4k intro's raymarched KIFS fractal tunnel with
 * neon tubes, glow accumulation and one reflection bounce. Where 4k read a
 * clock, this reads the music: travel and motion are CPU-integrated, the kick
 * pulses the glow and the field of view, the section index morphs the fractal,
 * and the end of a section warps forward.
 */
import type { SceneDef } from './types.js';

export const tunnel: SceneDef = {
  id: 'tunnel',
  label: 'Fractal tunnel',
  description: 'The 4k flagship: flying through a neon fractal tunnel that pulses with the kick.',
  body: `
float tunnelS, tunnelK, tunnelL, tunnelW;
vec3 tunnelG, tunnelP;

float tunnelMap(vec3 p) {
  vec3 q = p;
  p.xy *= rot(p.z * 0.05 + tunnelS);
  p.z = mod(p.z, 8.0) - 4.0;
  float s = 1.0;
  for (int i = 0; i < 4; i++) {
    p = abs(p) - vec3(1.6, 1.3, 1.0) - 0.3 * sin(tunnelS * 1.7);
    p.xy *= rot(0.4 + tunnelS * 0.6);
    p.xz *= rot(0.2 + tunnelS * 0.3);
    p *= 1.3;
    s *= 1.3;
  }
  tunnelL = (length(p.xy + 0.5) - 0.03) / s;
  float d = min(sdBox(p, vec3(0.4, 0.4, 3.0)), length(p.xz) - 0.2) / s;
  d = max(d, 2.2 + 0.4 * sin(q.z * 0.2) - length(q.xy));
  tunnelL = max(tunnelL, 0.6 - length(q.xy));
  return min(d, tunnelL);
}

float tunnelMarch(vec3 o, vec3 d, int steps) {
  float z = 0.0;
  for (int i = 0; i < MAX_LOOP; i++) {
    if (i >= steps) break;
    tunnelP = o + d * z;
    float h = tunnelMap(tunnelP);
    float wave = pow(max(0.5 + 0.5 * sin(tunnelP.z * 0.4 - uMotion * 9.0), 0.0), 12.0);
    tunnelG += tunnelW * palette(tunnelP.z * 0.02 + uMotion * 0.05 + tunnelS)
      * (0.1 + tunnelK + wave) * 0.0004 / (0.0004 + tunnelL * tunnelL) * exp(-z * 0.09);
    if (h < 0.001 || z > 60.0) break;
    z += h * 0.8;
  }
  return z;
}

vec3 sceneColor(vec2 u) {
  tunnelG = vec3(0.0);
  tunnelW = 1.0;
  tunnelK = uKick;
  tunnelS = uSeed * 1.3 + sin(uMotion * 0.25) * 0.15;
  vec3 o = vec3(0.0, 0.0, uTravel * 3.0);
  vec3 d = normalize(vec3(u * rot(uMotion * 0.1), 1.0 - uPulse * 0.25 - uWarp * 0.7 + 0.3 * length(u)));
  d.xz *= rot(sin(uMotion * 0.3) * 0.3);
  float z = tunnelMarch(o, d, uSteps);
  vec3 c = vec3(0.0);
  if (z < 60.0) {
    vec3 p = tunnelP;
    vec2 e = vec2(0.003, 0.0);
    vec3 n = normalize(tunnelMap(p) - vec3(tunnelMap(p - e.xyy), tunnelMap(p - e.yxy), tunnelMap(p - e.yyx)));
    vec3 l = normalize(vec3(0.5, 0.8, -0.6));
    c = (palette(tunnelS + 0.6) * 0.05 + vec3(0.04, 0.05, 0.07)) * (0.2 + max(dot(n, l), 0.0))
      + pow(max(dot(reflect(d, n), l), 0.0), 20.0) * 0.5
      + pow(max(1.0 + dot(n, d), 0.0), 5.0) * palette(p.z * 0.02 + tunnelS) * 0.6;
    tunnelW = 0.5 * exp(-z * 0.06);
    c *= tunnelW + tunnelW;
    tunnelMarch(p + n * 0.01, reflect(d, n), uSteps / 2);
  }
  return c + tunnelG * 0.08;
}
`,
};
