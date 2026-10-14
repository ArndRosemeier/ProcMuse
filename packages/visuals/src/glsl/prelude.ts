/**
 * THE shared GLSL. Every fragment program (each scene and the composite pass)
 * is `PRELUDE + body`; helpers live here exactly once and scenes never define
 * their own copies (pinned by test/glsl.test.ts).
 */
import { uniformDeclarations } from '../uniforms.js';

/** Upper bound for every shader loop; real counts come from uniforms (uSteps, uDetail). */
export const MAX_LOOP = 128;

export const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
// ---- @procmuse/visuals prelude ----
${uniformDeclarations()}
out vec4 fragColor;
#define MAX_LOOP ${MAX_LOOP}
#define TAU 6.28318530718

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// cosine palette, coefficients from palettes.ts
vec3 palette(float x) { return uPalA + uPalB * cos(TAU * (uPalC * x + uPalD)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise, 0..1
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// fractal noise, roughly 0..1; octaves clamped to 1..8
float fbm3(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * noise3(p);
    norm += amp;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// centred film grain in -0.5..0.5, refreshed 24 times per second
float grain(vec2 fragCoord) {
  return hash12(fragCoord + fract(floor(uTime * 24.0) * 0.618034) * 1000.0) - 0.5;
}

// the 4k tonemap: Reinhard plus a gentle gamma lift
vec3 tonemap(vec3 c) { c = max(c, 0.0); return pow(c / (1.0 + c), vec3(0.75)); }
// ---- end prelude ----
`;

/** Appended to every scene body: the scene's entry point is `vec3 sceneColor(vec2 uv)`. */
export const SCENE_MAIN = `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y + uShake;
  fragColor = vec4(tonemap(sceneColor(uv) * uGain), 1.0);
}
`;

/** Fullscreen triangle from gl_VertexID; needs no vertex buffers. */
export const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
