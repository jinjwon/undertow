// The water under everything: posterised depth, a slow surface, a few drifting shards, one glass glint.
// It is drawn only where the terminal shows its plain background (BG, the same #0B1648 as COLOR.NAVY), so text and panels stay as drawn.
const vec3 BG = vec3(11.0, 22.0, 72.0) / 255.0;
const vec3 DEEP = vec3(0.028, 0.055, 0.20);
const vec3 OCEAN = vec3(0.055, 0.20, 0.78);
const vec3 SURFACE = vec3(0.17, 0.44, 0.92);
const vec3 CYAN = vec3(0.37, 0.89, 1.0);
const vec3 PINK = vec3(1.0, 0.18, 0.53);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// A small triangle rising through its cell of a coarse lattice; most cells stay empty.
float shard(vec2 p, float t, out float kind) {
  vec2 cell = floor(p), f = fract(p) - 0.5;
  float h = hash(cell);
  kind = hash(cell + 7.0);
  if (h > 0.16) return 0.0;
  float a = t * (0.5 + h * 3.0) + h * 40.0, c = cos(a), s = sin(a);
  f -= vec2(sin(t * 0.7 + h * 50.0) * 0.14, cos(t * 0.5 + h * 30.0) * 0.14);
  f = mat2(c, -s, s, c) * f;
  float size = 0.03 + h * 0.13;
  return step(max(abs(f.x) * 0.866 + f.y * 0.5, -f.y), size * 0.5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 term = texture(iChannel0, uv);
  float t = iTime * 0.12;
  float depth = uv.y; // In this build y runs top-down: 0 is the top of the window.
  float aspect = iResolution.x / iResolution.y;

  // Light falls in from the top right, over the menu; the transcript side stays dark and quiet for reading.
  float drift = 0.05 * noise(vec2(uv.x * aspect * 2.2 + t * 0.5, depth * 5.0 - t * 0.3));
  float light = smoothstep(0.42, 0.78, uv.x + drift) * (1.0 - smoothstep(0.10, 0.60, depth + drift));
  vec3 water = mix(BG, DEEP, smoothstep(0.15, 0.95, depth));
  water = mix(water, mix(BG, OCEAN, 0.55), step(0.22, light));
  water = mix(water, mix(BG, OCEAN, 0.80), step(0.48, light));
  water = mix(water, OCEAN, step(0.74, light));

  // The surface: hard-edged patches near the top, brightest where the light is.
  vec2 p = vec2(uv.x * aspect * 3.2, depth * 11.0);
  float n = 0.6 * noise(p + vec2(t, t * 0.4)) + 0.4 * noise(p * 2.1 - vec2(t * 0.7, 0.0));
  float fade = 1.0 - smoothstep(0.03, 0.30, depth);
  vec3 lift = mix(vec3(0.055, 0.11, 0.345), SURFACE, smoothstep(0.1, 0.9, light));
  water = mix(water, mix(water, lift, 0.55), step(0.52, n) * fade);
  water = mix(water, lift, step(0.66, n) * fade);

  // One glint of glass crossing slowly; it stays faint enough to read through.
  float glint = uv.x * aspect * 0.34 + depth * 0.5 - fract(iTime * 0.012) * 2.2;
  water += vec3(0.03, 0.05, 0.09) * step(abs(glint), 0.0035) * (1.0 - depth);

  // Shards rise on two lattices, thin on the transcript's side.
  float kind, other;
  vec2 q = vec2(uv.x * aspect, depth) * 9.0;
  float a = shard(q + vec2(0.0, iTime * 0.05), iTime * 0.2, kind);
  float b = shard(q * 0.62 + vec2(4.0, iTime * 0.032), iTime * 0.13, other);
  float side = mix(0.13, 0.5, smoothstep(0.35, 0.8, uv.x));
  water = mix(water, mix(CYAN, PINK, step(0.62, kind)), a * side);
  water = mix(water, mix(CYAN, PINK, step(0.62, other)), b * side * 0.7);

  // What is near the background keeps its difference from it, so low-contrast art rides on the water; the rest stays as drawn.
  float k = smoothstep(0.05, 0.30, distance(term.rgb, BG));
  fragColor = vec4(mix(water + term.rgb - BG, term.rgb, k), 1.0);
}
