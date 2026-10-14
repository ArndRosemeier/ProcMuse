/** A slow volumetric flight through glowing fractal-noise clouds; the snare lights them up. */
import type { SceneDef } from './types.js';

export const nebula: SceneDef = {
  id: 'nebula',
  label: 'Nebula flight',
  description: 'A gentle flight through glowing clouds of cosmic dust that light up with the drums.',
  body: `
float nebulaDensity(vec3 p, int octaves) {
  float f = fbm3(p * 0.32 + vec3(0.0, 0.0, uSeed * 5.0), octaves);
  return smoothstep(0.48 - 0.08 * uEnergy, 0.85, f);
}

vec3 nebulaStars(vec3 rd) {
  vec3 cell = floor(rd * 160.0);
  float s = step(0.996, hash13(cell));
  return vec3(s) * (0.5 + 0.5 * hash13(cell + 3.0));
}

vec3 sceneColor(vec2 uv) {
  vec3 ro = vec3(sin(uMotion * 0.07) * 1.5, cos(uMotion * 0.05) * 1.0, uTravel * 1.6);
  vec3 rd = normalize(vec3(uv * rot(uMotion * 0.04), 1.3 - uPulse * 0.12));
  int steps = clamp(uSteps / 2, 20, 64);
  int octaves = 3 + int(uDetail * 2.0 + 0.5);
  float t = 0.3 + hash12(gl_FragCoord.xy) * 0.35;
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  for (int i = 0; i < MAX_LOOP; i++) {
    if (i >= steps || trans < 0.03) break;
    vec3 p = ro + rd * t;
    float d = nebulaDensity(p, octaves);
    if (d > 0.002) {
      float a = clamp(d * 0.16, 0.0, 1.0);
      vec3 emit = palette(p.z * 0.025 + d * 0.6 + uMotion * 0.02) * (0.35 + 1.4 * uIntensity);
      emit += palette(0.15) * (uSnare * 1.6 + uKick * 0.6) * d;
      acc += trans * a * emit;
      trans *= 1.0 - a;
    }
    t += 0.28 + t * 0.035;
  }
  acc += trans * nebulaStars(rd);
  return acc * 1.5;
}
`,
};
