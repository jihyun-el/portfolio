import * as THREE from "three";

// The engine's light in 3D, shared by the engine's stages (src/components/signal-chain-3d.tsx) and the step pictures
// drawn in the same light (src/components/model-3d.tsx).

/* ---------- Glowing primitives ---------- */
// Additive white sprites and lines on a black stage: overlapping particles brighten like light. The finished frame
// is then coloured by its brightness, so the picture reads as sound being processed. Labels are never coloured.
// Dark stage: a spectrogram ramp, stage → indigo → magenta → orange → amber, as audio tools draw loudness.
// Light stage: the same render with stronger signal drawn darker, on seaborn's "flare" map (apricot → coral →
// magenta → purple, six of its 256 entries); weak signal fades into the paper instead of tinting it.
export const RAMP = {
  // `ground` is the theme's stage colour (src/lib/stage-ground.ts), set with the theme.
  uniforms: { tDiffuse: { value: null }, light: { value: 0 }, ground: { value: new THREE.Vector3(5 / 255, 5 / 255, 5 / 255) } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float light; uniform vec3 ground; varying vec2 vUv;
const float STAGE = 5.0 / 255.0;
const vec3 INDIGO = vec3(0.29, 0.21, 0.71), MAGENTA = vec3(0.76, 0.13, 0.44), ORANGE = vec3(0.94, 0.40, 0.11), AMBER = vec3(1.0, 0.80, 0.29);
vec3 ramp(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  return x < 1.0 ? mix(c0, c1, x) : x < 2.0 ? mix(c1, c2, x - 1.0) : x < 3.0 ? mix(c2, c3, x - 2.0) : mix(c3, c4, x - 3.0);
}
vec3 flare(float t) {
  vec3 f0 = vec3(0.929, 0.689, 0.504), f1 = vec3(0.907, 0.494, 0.390), f2 = vec3(0.838, 0.308, 0.372), f3 = vec3(0.666, 0.227, 0.430), f4 = vec3(0.479, 0.180, 0.437), f5 = vec3(0.294, 0.137, 0.384);
  float y = t * 5.0;
  return y < 1.0 ? mix(f0, f1, y) : y < 2.0 ? mix(f1, f2, y - 1.0) : y < 3.0 ? mix(f2, f3, y - 2.0) : y < 4.0 ? mix(f3, f4, y - 3.0) : mix(f4, f5, y - 4.0);
}
void main() {
  float level = dot(texture2D(tDiffuse, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
  // The cleared stage (rendered at STAGE) maps to the panel's stage colour, so the canvas meets it without an edge.
  float n = clamp((level - STAGE) / (1.0 - STAGE), 0.0, 1.0);
  vec3 onDark = ramp(n * 4.0, ground, INDIGO, MAGENTA, ORANGE, AMBER), onLight = mix(ground, flare(n), smoothstep(0.0, 0.35, n));
  gl_FragColor = vec4(light > 0.5 ? onLight : onDark, 1.0);
}`,
};
export const isDark = () => document.documentElement.classList.contains("dark");
// Bloom on the light stage is kept short-reach so lit points still sparkle without a grey haze around each stage.
export const BLOOM_RADIUS = 0.45, LIGHT_BLOOM = 0.45, LIGHT_RADIUS = 0.08, LIGHT_FALLOFF = 1.4;
const POINT_VERTEX = `
attribute float size; attribute float alpha; varying float vAlpha; uniform float pixelRatio; uniform float zoom;
void main() { vAlpha = pow(alpha, 0.8); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pixelRatio * zoom * (4.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
// Point sizes were tuned for a card camera about 4.8 units away; the panorama camera stands farther back, so every
// cloud shares this factor to keep its points as large on screen as the stage around them.
export const ZOOM = { value: 1 };
// A point's soft edge reads as glow on the dark stage and as a smudge on the light one; the light theme raises
// the falloff to this power so points keep their core and lose the haze.
export const FALLOFF = { value: 1 };
const POINT_FRAGMENT = `
uniform sampler2D map; uniform float falloff; varying float vAlpha;
void main() { float a = pow(texture2D(map, gl_PointCoord).a, falloff) * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vec3(1.0), a); }`;

export function glowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!, gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)"); gradient.addColorStop(0.22, "rgba(255,255,255,.65)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// A figure with its own camera passes its own zoom and falloff, so it never moves the engine's.
export function cloud(count: number, map: THREE.Texture, pixelRatio: number, own: { zoom: { value: number }; falloff: { value: number } } = { zoom: ZOOM, falloff: FALLOFF }) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 3), size = new Float32Array(count), alpha = new Float32Array(count);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const material = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, pixelRatio: { value: pixelRatio }, zoom: own.zoom, falloff: own.falloff }, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;
  const set = (i: number, x: number, y: number, z: number, s: number, a: number) => { position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z; size[i] = s; alpha[i] = a; };
  const commit = () => { for (const name of ["position", "size", "alpha"]) geometry.getAttribute(name).needsUpdate = true; };
  const hide = (from: number) => { size.fill(0, from); alpha.fill(0, from); };
  return { object: points, set, hide, commit, dispose: () => { geometry.dispose(); material.dispose(); } };
}

// The stage renders in linear output so faint bloom stays dark; line levels are pre-encoded to keep their old brightness.
const encode = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
// Seen from the panorama's farther camera, thin guide lines read too dark; faint levels are lifted, full ones kept.
const lift = (c: number) => c ** 0.72;
export function segments(count: number) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 6), color = new Float32Array(count * 6);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geometry, material); lines.frustumCulled = false;
  const set = (i: number, a: number[], b: number[], ca: number, cb = ca) => {
    position.set(a, i * 6); position.set(b, i * 6 + 3);
    color.fill(encode(lift(ca)), i * 6, i * 6 + 3); color.fill(encode(lift(cb)), i * 6 + 3, i * 6 + 6);
  };
  const commit = () => { geometry.getAttribute("position").needsUpdate = true; geometry.getAttribute("color").needsUpdate = true; };
  const clear = (from: number) => { position.fill(0, from * 6); color.fill(0, from * 6); };
  return { object: lines, set, clear, commit, dispose: () => { geometry.dispose(); material.dispose(); } };
}
// A faint wall from a floor up to a curve, so a curve reads as part of its lane when several stand in depth.
// Fill levels are linear, not encoded like the lines: they stay dark under the bloom threshold.
export function ribbon(count: number) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 6), color = new Float32Array(count * 6), index: number[] = [];
  for (let i = 0; i < count - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  const set = (i: number, x: number, top: number, floor: number, z: number, c: number) => {
    position.set([x, top, z, x, floor, z], i * 6); color.fill(c, i * 6, i * 6 + 3); color.fill(0, i * 6 + 3, i * 6 + 6);
  };
  const commit = () => { geometry.getAttribute("position").needsUpdate = true; geometry.getAttribute("color").needsUpdate = true; };
  return { object: mesh, set, commit, dispose: () => { geometry.dispose(); material.dispose(); } };
}
