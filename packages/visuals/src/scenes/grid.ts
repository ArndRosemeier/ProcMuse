/** Synthwave: a neon grid racing towards a striped sun behind a mountain ridge. */
import type { SceneDef } from './types.js';

export const grid: SceneDef = {
  id: 'grid',
  label: 'Neon grid',
  description: 'Synthwave: a glowing grid racing towards a striped sun and a mountain ridge.',
  body: `
float gridRidge(float x) {
  float h = 0.0, amp = 0.09, f = 2.2;
  int octaves = 2 + int(uDetail * 3.0 + 0.5);
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    h += amp * noise2(vec2(x * f + uSeed * 7.31, float(i) * 3.7));
    amp *= 0.5;
    f *= 2.1;
  }
  return h * (0.4 + smoothstep(0.1, 0.9, abs(x)));
}

vec3 sceneColor(vec2 uv) {
  float horizon = -0.05;
  // floor coordinates are computed for every pixel: fwidth needs uniform control flow
  float fh = max(horizon - uv.y, 1e-3);
  float fz = 0.32 / fh;
  vec2 g = vec2(uv.x * fz * 1.6, fz + uTravel * 4.0);
  vec2 w = fwidth(g) * 1.3;
  vec3 col;
  if (uv.y > horizon) {
    float h = uv.y - horizon;
    col = mix(palette(0.0) * 0.55, palette(0.62) * 0.04, smoothstep(0.0, 0.55, h));
    // stars
    vec2 cell = floor(uv * 90.0);
    float star = step(0.985, hash12(cell)) * smoothstep(0.1, 0.5, h);
    col += vec3(star) * (0.4 + 0.6 * hash12(cell + 7.0)) * (0.7 + 0.3 * sin(uMotion * 2.0 + hash12(cell) * 50.0));
    // sun with scrolling stripes in its lower half
    vec2 sp = uv - vec2(0.0, horizon + 0.24);
    float r = length(sp);
    float sunR = 0.22 + 0.012 * uKick;
    float sun = smoothstep(sunR, sunR - 0.004, r);
    if (sp.y < 0.0) {
      float gap = clamp(-sp.y / sunR, 0.0, 1.0) * 0.55;
      sun *= step(gap, fract(sp.y * 22.0 - uMotion * 0.4));
    }
    vec3 sunCol = mix(palette(0.08) * 1.8, palette(0.35) * 2.4 + 0.3, smoothstep(-sunR, sunR, sp.y));
    col = mix(col, sunCol, sun);
    col += palette(0.1) * exp(-max(r - sunR, 0.0) * 7.0) * (0.25 + 0.35 * uBass);
    // mountain ridge with a neon rim
    float ridge = horizon + gridRidge(uv.x);
    if (uv.y < ridge) col = palette(0.7) * 0.02 + vec3(0.01, 0.0, 0.02);
    col += palette(0.55) * exp(-abs(uv.y - ridge) * 260.0) * (0.6 + 0.8 * uChords);
  } else {
    float h = fh;
    float z = fz;
    vec2 dl = 0.5 - abs(fract(g) - 0.5);
    float line = max(1.0 - smoothstep(0.0, w.x + 0.02, dl.x), 1.0 - smoothstep(0.0, w.y + 0.02, dl.y));
    float fade = exp(-z * 0.045);
    float beatWave = exp(-abs(fract(g.y * 0.125 - uBeat) - 0.5) * 18.0) * uKick;
    col = vec3(0.01, 0.0, 0.025);
    col += palette(0.55 + 0.1 * uMelody) * line * (1.2 + 1.5 * uKick + 1.5 * beatWave) * fade;
    col += palette(0.1) * exp(-abs(uv.x) * 3.0) * exp(-h * 9.0) * 0.35;
  }
  col += palette(0.02) * exp(-abs(uv.y - horizon) * 40.0) * (0.5 + 0.5 * uIntensity);
  return col;
}
`,
};
