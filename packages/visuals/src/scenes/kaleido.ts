/** A kaleidoscope folded over an orbit-trapped Kali fractal; the lead melody lights the rings. */
import type { SceneDef } from './types.js';

export const kaleido: SceneDef = {
  id: 'kaleido',
  label: 'Kaleidoscope',
  description: 'A mirrored kaleidoscope of fractal rings that breathe with the bass and glow with the melody.',
  body: `
vec2 kaleidoFold(vec2 p, float segments) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float seg = TAU / segments;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  return vec2(cos(a), sin(a)) * r;
}

vec3 sceneColor(vec2 uv) {
  float r = length(uv);
  float segments = 8.0;
  vec2 q = kaleidoFold(uv * rot(uMotion * 0.06), segments);
  q *= 1.1 + 0.35 * sin(uTravel * 0.11) + 0.08 * uBass;
  q += vec2(0.25 * sin(uTravel * 0.07), 0.2 * cos(uTravel * 0.05));
  vec2 c = vec2(-0.55, -0.67) + 0.07 * vec2(sin(uMotion * 0.13 + uSeed), cos(uMotion * 0.11));
  int iters = 6 + int(uDetail * 6.0 + 0.5);
  float trap = 1e3;
  float ring = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= iters) break;
    q = abs(q) / clamp(dot(q, q), 0.05, 1e3) + c;
    trap = min(trap, abs(length(q) - 0.5));
    ring += exp(-25.0 * abs(q.y));
  }
  vec3 col = palette(ring * 0.08 + r * 0.4 - uMotion * 0.04) * ring * 0.11 * (0.6 + uIntensity);
  col += palette(0.5 + uMelody * 0.3) * exp(-trap * 18.0) * (0.5 + 1.2 * uLead + 0.6 * uArp);
  col += palette(0.1) * exp(-r * 5.0) * uKick * 0.6;
  return col;
}
`,
};
