/**
 * A low, fast motorbike ride down a glossy road at dusk: faceted wireframe
 * mountains on both sides, wireframe palm trees whipping past, glowing lane
 * dashes streaking under the camera and a hot glow on the horizon. The road
 * meanders and the camera leans into its bends. The road is a mirror: the
 * ray bounces off it once inside the same march, so mountains, palms and the
 * horizon glow all reflect. The kick brightens the dashes and rolls a wave
 * along the mountain wires, the bass lights the wires, the chords light the
 * palms, the hats the road's edge lines, the pad and the snare the horizon.
 * The scene adds no white flashes; those stay the composite's.
 */
import type { SceneDef } from './types.js';

export const ride: SceneDef = {
  id: 'ride',
  label: 'Dusk ride',
  description: 'Racing a motorbike down a mirror-smooth road at dusk, between wireframe mountains and palm trees.',
  body: `
// terrain grid cell (road-relative x, z); the road is flat between the vertices at |x| = 5
const vec2 RIDE_CELL = vec2(2.5, 3.0);
const float RIDE_FLAT = 5.0;
const float RIDE_HMAX = 30.0;
const float RIDE_FAR = 260.0;
const float RIDE_PALM_GAP = 16.0;

// x of the road's centre at depth z: it meanders
float rideRoadX(float z) { return 16.0 * sin(z * 0.009) + 7.0 * sin(z * 0.021 + 1.3); }

// height at one terrain vertex: zero on the road, low lumps on the shoulders, then mountains
float rideVertex(vec2 v) {
  vec2 w = v * RIDE_CELL;
  float ax = abs(w.x);
  float lump = smoothstep(6.5, 8.5, ax) * 1.6 * hash12(v + 7.0);
  float big = noise2(w * 0.03 + vec2(5.0, 0.0));
  float mount = smoothstep(13.0, 36.0, ax) * (5.0 + 22.0 * big * big) * (0.85 + 0.3 * hash12(v + 3.0));
  return lump + mount;
}

// the faceted terrain at q = (road-relative x, z): height and its slope along x and z
vec3 rideTerrain(vec2 q) {
  vec2 g = q / RIDE_CELL;
  vec2 i = floor(g), f = fract(g);
  float a = rideVertex(i), d = rideVertex(i + 1.0);
  if (f.x > f.y) {
    float b = rideVertex(i + vec2(1.0, 0.0));
    return vec3(a + (b - a) * f.x + (d - b) * f.y, (b - a) / RIDE_CELL.x, (d - b) / RIDE_CELL.y);
  }
  float c = rideVertex(i + vec2(0.0, 1.0));
  return vec3(a + (d - c) * f.x + (c - a) * f.y, (d - c) / RIDE_CELL.x, (c - a) / RIDE_CELL.y);
}

// box-filtered coverage of dashes [0, len) repeating every period, over a footprint w around z
float rideDash(float z, float w, float period, float len) {
  float lo = z - 0.5 * w, hi = z + 0.5 * w;
  float a = floor(lo / period) * len + min(fract(lo / period) * period, len);
  float b = floor(hi / period) * len + min(fract(hi / period) * period, len);
  return (b - a) / w;
}

float rideSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// distance to a wireframe palm: q from its foot, lean in x, height hgt, phase for the wind
float ridePalm(vec2 q, float lean, float hgt, float phase) {
  if (abs(q.x - 0.5 * lean) > 4.5 || q.y < -0.2 || q.y > hgt + 2.5) return 1e3;
  float u = clamp(q.y / hgt, 0.0, 1.0);
  float r = 0.24 - 0.1 * u;
  float dx = abs(q.x - lean * u * u);
  float inY = step(0.0, q.y) * step(q.y, hgt);
  // the trunk: two outlines and rings between them
  float dm = mix(1e3, abs(dx - r), inY);
  float ring = abs(fract(q.y * 2.4) - 0.5) / 2.4;
  dm = min(dm, mix(1e3, ring + 0.01, inY * step(dx, r)));
  // nine drooping fronds from the crown, swaying with the wind and the lead
  vec2 top = vec2(lean, hgt);
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float ang = mix(-0.35, 3.49, fk / 8.0) + 0.08 * sin(uMotion * 2.3 + phase + fk) * (1.0 + uLead);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 prev = top;
    for (int j = 1; j <= 4; j++) {
      float s = float(j) * 0.25;
      vec2 next = top + 2.5 * (dir * s + vec2(0.0, -0.55 * s * s));
      dm = min(dm, rideSeg(q, prev, next) - 0.035 * (1.0 - s));
      prev = next;
    }
  }
  return dm;
}

// light of the palms along a ray up to tMax; px is one pixel's size at unit distance
vec3 ridePalms(vec3 ro, vec3 rd, float tMax, float px) {
  vec3 c = vec3(0.0);
  if (rd.z <= 1e-3) return c;
  float k0 = ceil(ro.z / RIDE_PALM_GAP);
  for (int k = 0; k < 10; k++) {
    float zk = (k0 + float(k)) * RIDE_PALM_GAP;
    float t = (zk - ro.z) / rd.z;
    if (t > tMax) break;
    vec3 p = ro + rd * t;
    float rx = rideRoadX(zk);
    float aa = t * px * 1.5 + 0.004;
    for (int s = 0; s < 2; s++) {
      float side = float(s) * 2.0 - 1.0;
      vec2 id = vec2(zk, side * 7.0);
      if (hash12(id) < 0.3) continue;
      float x0 = rx + side * (6.0 + 3.0 * hash12(id + 1.0));
      float hgt = 5.0 + 3.0 * hash12(id + 2.0);
      float lean = side * (0.4 + 1.0 * hash12(id + 3.0));
      float dm = ridePalm(vec2(p.x - x0, p.y), lean, hgt, hash12(id + 4.0) * TAU);
      float line = 1.0 - smoothstep(0.0, aa, dm);
      float halo = exp(-max(dm, 0.0) / (aa * 3.0 + 0.04)) * 0.25;
      c += palette(0.6 + 0.08 * side) * (line + halo) * (1.1 + 1.4 * uChords) * exp(-t * 0.01);
    }
  }
  return c;
}

// the dusk sky; heading is the yaw of the road ahead, where the glow sits
vec3 rideSky(vec3 d, float heading) {
  float y = d.y;
  float a = atan(d.x, d.z) - heading;
  vec3 top = palette(0.6) * 0.08 + vec3(0.0, 0.005, 0.03);
  vec3 hor = palette(0.55) * 0.42 + vec3(0.008, 0.016, 0.06);
  vec3 c = mix(hor, top, smoothstep(0.0, 0.6, y));
  float glow = exp(-abs(y) * 16.0) * exp(-a * a * 5.0) * (0.6 + 0.4 * uPad + 0.3 * uSnare);
  c += mix(palette(0.0), palette(0.12), 0.4) * glow;
  c += palette(0.05) * exp(-abs(y) * 70.0) * exp(-a * a * 25.0) * (1.0 + 0.6 * uEnergy);
  return c;
}

// the road surface (before its reflection) at p, seen along rd from distance t
vec3 rideRoad(vec3 p, vec3 rd, float t, float px) {
  float xl = p.x - rideRoadX(p.z);
  float aax = t * px * 1.5 + 0.004;
  float aaz = aax / max(-rd.y, 0.01);
  vec3 c = palette(0.55) * 0.02 + vec3(0.0, 0.002, 0.008);
  // two dashed lane lines, box-filtered so they streak instead of shimmering
  float lane = abs(abs(xl) - 1.6);
  float across = clamp((0.09 + 0.5 * aax - lane) / aax, 0.0, 1.0);
  float dash = rideDash(p.z, aaz, 9.0, 3.2);
  vec3 dashCol = mix(palette(0.5), vec3(1.0), 0.65);
  c += dashCol * across * dash * (3.0 + 2.0 * uKick);
  c += dashCol * exp(-lane * 4.0) * dash * 0.15;
  // solid edge lines
  float edge = abs(abs(xl) - 4.6);
  c += palette(0.5) * clamp((0.06 + 0.5 * aax - edge) / aax, 0.0, 1.0) * (0.8 + 1.2 * uHats);
  return c;
}

vec3 sceneColor(vec2 uv) {
  float camZ = uTravel * 24.0;
  float rx = rideRoadX(camZ);
  float heading = atan(rideRoadX(camZ + 30.0) - rx, 30.0);
  // lean into the bend: the road's curvature from a second difference
  float curv = (rideRoadX(camZ + 12.0) - 2.0 * rx + rideRoadX(camZ - 12.0)) / 144.0;
  float roll = clamp(curv * 40.0, -0.22, 0.22) + 0.02 * sin(uMotion * 0.9);
  vec3 o = vec3(rx + 0.7 * sin(uMotion * 0.23), 0.55 + 0.03 * sin(uMotion * 5.0) + 0.04 * uKick, camZ);
  float focal = 1.1 - uPulse * 0.1 - uWarp * 0.6;
  // a portrait phone still sees both roadsides: widen the view on narrow screens
  float zoom = clamp(0.9 * uResolution.y / uResolution.x, 1.0, 1.8);
  vec3 d = normalize(vec3(uv * zoom * rot(roll), focal));
  d.yz *= rot(-0.03);
  d.xz *= rot(heading);
  float px = zoom / (focal * uResolution.y);

  vec3 ro = o, rd = d;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  float travelled = 0.0;
  bool hit = false;
  float tPlane = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float t = 0.02;
  float tPrev = t;
  for (int i = 0; i < MAX_LOOP; i++) {
    if (i >= uSteps) break;
    if (t >= tPlane) t = tPlane;
    vec3 p = ro + rd * t;
    float xl = p.x - rideRoadX(p.z);
    float hgt = rideTerrain(vec2(xl, p.z)).x;
    float f = p.y - hgt;
    if (t == tPlane && f > -1e-3) {
      // the glossy road (and every flat stretch at its level): shade it, then carry on along the mirrored ray
      float total = travelled + tPlane;
      float fresnel = 0.3 + 0.6 * pow(1.0 - abs(rd.y), 6.0);
      float fog = exp(-total * 0.009);
      acc += w * (ridePalms(ro, rd, tPlane, px) * fog + (1.0 - fresnel) * mix(rideSky(vec3(rd.x, 0.0, rd.z), heading), rideRoad(p, rd, total, px), fog));
      w *= fresnel;
      vec3 n = normalize(vec3(0.02 * (noise2(p.xz * vec2(2.0, 0.25)) - 0.5), 1.0, 0.0));
      ro = p + vec3(0.0, 1e-3, 0.0);
      rd = reflect(rd, n);
      rd.y = abs(rd.y);
      travelled = total;
      tPlane = 1e9;
      t = 0.02;
      tPrev = t;
      continue;
    }
    if (p.y > RIDE_HMAX && rd.y >= 0.0) break;
    // flat ground is the plane's job: only raised terrain counts as a hit
    if (f < 0.002 * t && hgt > 1e-3) {
      // the steps may overshoot a steep facet: bisect back to the surface
      for (int j = 0; j < 5; j++) {
        float tm = 0.5 * (tPrev + t);
        vec3 pm = ro + rd * tm;
        if (pm.y - rideTerrain(vec2(pm.x - rideRoadX(pm.z), pm.z)).x < 0.0) t = tm; else tPrev = tm;
      }
      hit = true;
      break;
    }
    tPrev = t;
    t += max(max(0.85 * (RIDE_FLAT - abs(xl)), p.y - RIDE_HMAX), max(0.35 * f, 0.012 * t));
    if (travelled + t > RIDE_FAR) break;
  }

  float tEnd = hit ? t : RIDE_FAR - travelled;
  float total = travelled + tEnd;
  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec2 q = vec2(p.x - rideRoadX(p.z), p.z);
    vec3 h = rideTerrain(q);
    vec3 n = normalize(vec3(-h.y, 1.0, -h.z));
    // flat-shaded facets, lit from behind the rider
    vec3 base = palette(0.55) * 0.12 + vec3(0.0, 0.008, 0.035);
    col = base * (0.25 + 1.1 * max(dot(n, normalize(vec3(0.3, 0.8, -0.5))), 0.0));
    // the wireframe: distance to the cell edges and the diagonal that splits each cell
    vec2 f = fract(q / RIDE_CELL);
    float e = min(min(min(f.x, 1.0 - f.x) * RIDE_CELL.x, min(f.y, 1.0 - f.y) * RIDE_CELL.y),
                  abs(f.x - f.y) * RIDE_CELL.x * RIDE_CELL.y / length(RIDE_CELL));
    float aa = total * px * 1.5 / max(abs(dot(n, rd)), 0.35) + 0.005;
    float wire = (1.0 - smoothstep(0.018, 0.018 + aa, e)) * mix(1.0, 0.35, smoothstep(0.3, 1.2, aa));
    float wave = exp(-abs(fract((p.z - o.z) * 0.02 - uBeat) - 0.5) * 16.0) * uKick;
    col += palette(0.52) * wire * (0.7 + 1.2 * uBass + 1.5 * wave);
  } else {
    col = rideSky(rd, heading);
  }
  // distant facets fade into the sky behind them; the sky itself needs no fog
  if (hit) col = mix(rideSky(normalize(vec3(rd.x, max(rd.y, 0.0), rd.z)), heading), col, exp(-total * 0.009));
  col += ridePalms(ro, rd, tEnd, px) * exp(-total * 0.004);
  return acc + w * col;
}
`,
};
