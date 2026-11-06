// Flat poster water behind the terminal text: hard tones, never a soft glow.
const vec3 BG = vec3(10.0, 30.0, 140.0) / 255.0;

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
  float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
  float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 term = texture(iChannel0, uv);
  float t = iTime * 0.12;
  float depth = uv.y; // In this build y runs top-down: 0 is the top of the window.

  vec3 water = mix(vec3(0.02, 0.14, 0.58), vec3(0.02, 0.06, 0.36), smoothstep(0.0, 0.6, depth));

  vec2 p = vec2(uv.x * iResolution.x / iResolution.y * 3.2, depth * 11.0);
  float n = 0.6 * noise(p + vec2(t, t * 0.4)) + 0.4 * noise(p * 2.1 - vec2(t * 0.7, 0.0));
  float fade = 1.0 - smoothstep(0.05, 0.28, depth);
  water = mix(water, vec3(0.03, 0.20, 0.68), step(0.50, n) * fade);
  water = mix(water, vec3(0.04, 0.26, 0.76), step(0.64, n) * fade);

  // Text and panels stay as drawn; only the plain background becomes water.
  float k = smoothstep(0.015, 0.12, distance(term.rgb, BG));
  fragColor = vec4(mix(water, term.rgb, k), 1.0);
}
