/**
 * A light-cycle ride through a Tron-like city: the camera follows a cycle
 * down a lane of a glowing floor grid, between neon-edged towers, while other
 * cycles race alongside and towards it, each dragging a translucent wall of
 * light. The kick rolls a wave down the grid, the bass lights the tower edges,
 * the chords light their windows, the lead and arp drive the light walls and
 * the snare flares the cycles' headlights. The floor mirrors the light walls.
 */
import type { SceneDef } from './types.js';

export const tron: SceneDef = {
  id: 'tron',
  label: 'Light cycles',
  description: 'Riding a light cycle through a neon grid city, racing other cycles and their walls of light.',
  body: `
// towers stand on an 8-unit cell grid; the two cell columns around x = 0 are the open lane
vec3 tronSize(vec2 cell) {
  return vec3(1.2 + 2.0 * hash12(cell + 3.1), 0.6 + 7.0 * pow(hash12(cell + 9.2), 3.0), 1.2 + 2.0 * hash12(cell + 5.7));
}

bool tronEmpty(vec2 cell) {
  return abs(cell.x + 0.5) < 1.0 || hash12(cell + 17.0) < 0.45;
}

float tronMap(vec3 p) {
  // inside the lane no tower is nearer than the lane's edge (towers start at |x| >= 8.8)
  if (abs(p.x) < 8.0) return 8.8 - abs(p.x);
  vec2 cell = floor(p.xz / 8.0);
  vec2 lp = p.xz - (cell + 0.5) * 8.0;
  // never step far past a cell border: the neighbour's tower may be behind it,
  // but at least 0.8 inside its own cell (half-widths stay <= 3.2), so +0.5 is safe
  // and keeps the border itself from ever reading as a hit
  float border = min(4.0 - abs(lp.x), 4.0 - abs(lp.y)) + 0.5;
  if (tronEmpty(cell)) return border;
  vec3 s = tronSize(cell);
  return min(sdBox(vec3(lp.x, p.y - s.y, lp.y), s), border);
}

// lane i: x, direction (+1 with the camera, -1 oncoming), wall height, hue offset
vec4 tronLane(int i) {
  if (i == 0) return vec4(1.8, 1.0, 0.6, 0.0);
  if (i == 1) return vec4(-3.6, 1.0, 0.8, 0.5);
  if (i == 2) return vec4(4.6, -1.0, 0.8, 0.25);
  if (i == 3) return vec4(-6.3, -1.0, 0.8, 0.75);
  return vec4(6.6, 1.0, 0.8, 0.5);
}

// z of lane i's cycle, and (in .y) how visible it is (oncoming cycles fade in far away)
vec2 tronHead(int i, float camZ) {
  float fi = float(i);
  vec4 l = tronLane(i);
  if (l.y > 0.0) {
    float base = i == 0 ? 11.0 : 22.0;
    float amp = i == 0 ? 4.0 : 17.0;
    return vec2(camZ + base + amp * sin(uMotion * (0.23 + 0.05 * fi) + fi * 2.1), 1.0);
  }
  float f = fract(uMotion * 0.07 + fi * 0.31);
  return vec2(camZ + 90.0 - 135.0 * f, smoothstep(0.0, 0.1, f));
}

// additive light of every cycle and its wall along the ray, up to tMax
vec3 tronTrails(vec3 o, vec3 d, float tMax, float camZ) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 l = tronLane(i);
    vec2 head = tronHead(i, camZ);
    vec3 hue = palette(0.5 + l.w + 0.15 * uSeed);
    float t = (l.x - o.x) / d.x;
    if (t > 0.0 && t < tMax) {
      vec3 p = o + d * t;
      float along = (head.x - p.z) * l.y;
      float aa = 0.004 * t + 0.01;
      float inWall = step(0.0, along) * step(along, 36.0) * step(0.0, p.y);
      float body = (1.0 - smoothstep(l.z - aa, l.z + aa, p.y)) * (0.25 + 0.35 * uLead + 0.2 * uArp);
      float top = 1.0 - smoothstep(0.02, aa + 0.05, abs(p.y - l.z));
      c += hue * inWall * (body + top * (2.0 + 1.5 * uHats)) * exp(-along * 0.06) * head.y * exp(-t * 0.012);
    }
    vec3 v = vec3(l.x, 0.35, head.x) - o;
    float tp = dot(v, d);
    if (tp > 0.0 && tp < tMax) {
      float r = length(v - d * tp);
      c += mix(hue, vec3(1.0), 0.4) * 0.05 / (r * r + 0.003 * tp + 0.01) * (0.6 + 0.8 * uSnare) * head.y * exp(-tp * 0.02);
    }
  }
  return c;
}

// distance from fractional coordinates to the nearest grid line, as 0..1 coverage
float tronLines(vec2 g, vec2 w, float thick) {
  vec2 dl = 0.5 - abs(fract(g) - 0.5);
  return max(1.0 - smoothstep(thick, thick + w.x * 1.5, dl.x), 1.0 - smoothstep(thick, thick + w.y * 1.5, dl.y));
}

vec3 tronSky(vec3 d) {
  float y = d.y;
  vec3 c = mix(palette(0.55) * 0.025 + vec3(0.0, 0.004, 0.012), vec3(0.0, 0.0, 0.006), smoothstep(0.0, 0.5, y));
  // a far skyline with neon rims, then the horizon glow under it
  float a = atan(d.x, d.z);
  float sky = 0.025 + 0.06 * noise2(vec2(a * 14.0 + uSeed * 3.0, 0.0)) * step(0.5, noise2(vec2(a * 40.0, 1.0)) + 0.4);
  if (y < sky) c = palette(0.62) * 0.015;
  c += palette(0.0) * exp(-abs(y - sky) * 300.0) * (0.25 + 0.5 * uChords);
  c += palette(0.5) * exp(-abs(y) * 25.0) * (0.3 + 0.5 * uBass);
  return c;
}

vec3 sceneColor(vec2 uv) {
  float camZ = uTravel * 8.0;
  float sway = sin(uMotion * 0.17);
  vec3 o = vec3(0.55 * sway, 1.05 + 0.12 * sin(uMotion * 0.31), camZ);
  vec3 d = normalize(vec3(uv * rot(-0.07 * sway), 1.1 - uPulse * 0.12 - uWarp * 0.6));
  d.yz *= rot(-0.09);
  d.xz *= rot(0.06 * sway);

  // the floor is computed for every pixel: fwidth needs uniform control flow
  float floorT = o.y / max(-d.y, 1e-4);
  vec2 fp = o.xz + d.xz * floorT;
  vec2 fw = fwidth(fp);
  float minor = tronLines(fp * 0.5, fw * 0.5, 0.015) * (1.0 - smoothstep(0.05, 0.4, max(fw.x, fw.y)));
  float major = tronLines(fp * 0.125, fw * 0.125, 0.006);

  float tMax = d.y < 0.0 ? min(floorT, 180.0) : 180.0;
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < MAX_LOOP; i++) {
    if (i >= uSteps) break;
    vec3 p = o + d * t;
    if (p.y > 22.0 && d.y > 0.0) break;
    float h = tronMap(p);
    if (h < 0.001 + 0.001 * t) { hit = true; break; }
    t += h;
    if (t > tMax) break;
  }

  vec3 col;
  float dist;
  if (hit) {
    dist = t;
    vec3 p = o + d * t;
    vec2 cell = floor(p.xz / 8.0);
    vec2 lp = p.xz - (cell + 0.5) * 8.0;
    vec3 s = tronSize(cell);
    vec3 e = s - abs(vec3(lp.x, p.y - s.y, lp.y));
    float lo = min(e.x, min(e.y, e.z));
    float mid = e.x + e.y + e.z - lo - max(e.x, max(e.y, e.z));
    float aa = 0.002 * t + 0.02;
    float edge = 1.0 - smoothstep(aa, aa * 2.5, mid);
    float rimTop = 1.0 - smoothstep(aa, aa * 2.5, e.y);
    float id = hash12(cell + 41.0);
    float row = floor(p.y * 1.4);
    float lit = step(0.72, hash12(vec2(row, id * 97.0 + floor((lp.x + lp.y) * 1.5))));
    float window = lit * step(0.35, fract(p.y * 1.4)) * step(0.3, lo) * step(aa, e.y);
    col = palette(0.62) * 0.02 + vec3(0.004, 0.006, 0.012);
    col += palette(0.5 + 0.12 * id) * window * (0.12 + 0.5 * uChords);
    col += palette(0.0 + 0.2 * id) * edge * (0.9 + 1.4 * uBass) * (1.0 + rimTop);
  } else if (d.y < 0.0 && floorT < 180.0) {
    dist = floorT;
    float beatWave = exp(-abs(fract((fp.y - camZ) * 0.025 - uBeat) - 0.5) * 16.0) * uKick;
    col = vec3(0.002, 0.003, 0.008);
    col += palette(0.5) * minor * 0.28;
    col += palette(0.5 + 0.1 * uMelody) * major * (0.9 + 1.3 * uKick + 2.0 * beatWave);
    // glossy floor: the light walls mirror in it
    col += tronTrails(vec3(fp.x, 0.0, fp.y), reflect(d, vec3(0.0, 1.0, 0.0)), 60.0, camZ) * 0.3;
  } else {
    dist = 180.0;
    col = tronSky(d);
  }
  vec3 fog = palette(0.55) * 0.025 + vec3(0.0, 0.004, 0.012);
  col = mix(fog, col, exp(-dist * 0.013));
  return col + tronTrails(o, d, dist, camZ);
}
`,
};
