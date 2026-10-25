"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { LIGHT_RADIUS, isDark } from "@/lib/glow-3d";
import { pointerLean } from "@/lib/pointer-lean";
import { stageGround } from "@/lib/stage-ground";

// VQA's 사진 확대 step drawn as the model in one structure of light (chosen 2026-10-25 from two trials): the sign's
// 16-pixel patches stand as tiles in their real colours and stream through the vision encoder's rings into the image
// tokens, the tokens through the language model's rings into the letters' chances, columns of tiles. One picture turns
// from 512² to 768² in place: every patch splits into the finer ones inside it, the ones round the answer first, the
// token sheet with them, and the chances follow. The step lights only what it changed: the patches and the tokens, which
// carry the photo's colour; the rest, the question's path and the chances are ink.
// The grids are the whole photo's at each size as Qwen3-VL cuts it: 720 × 960 resized to 416 × 576 at 512² (26 × 36
// patches, 2 × 2 into one token: 13 × 18 = 234) and to 640 × 864 at 768² (40 × 54, 20 × 27 = 540). The chances are the
// 4B model's on the sign (train_3696, exp/manu: c0_tune and V1_tune), as on the step's other figures.

export type V3 = [number, number, number];
export type Rgb = readonly number[];
// `glow`: on the light stage, how far colour spreads round what shines (`Pen.shine`); none where it is unset.
export type Shot = { target: V3; yaw: number; tilt: number; bounds: V3[]; fov?: number; glow?: number };
const SHIFT = { start: "translate(6px, -50%)", end: "translate(calc(-100% - 6px), -50%)", center: "translate(-50%, -50%)", above: "translate(-50%, calc(-100% - 4px))", below: "translate(-50%, 4px)", left: "translate(0, -50%)" };
// `leader`: the point of the thing the words name, drawn to them as a leader (start / end words only).
export type Tag = { text: ReactNode; at: (s: number) => V3 | null; fade?: (s: number) => number; align?: keyof typeof SHIFT; dim?: boolean; cls?: string; leader?: (s: number) => V3 | null };
// A line of the picture by points in the scene: data (what the model passes on: stronger, light running along it when
// `speed` is set) or a leader (from a thing to words: a hairline on a halo of the stage, a dot on the thing).
export type RouteOpts = { a?: number; speed?: number; offset?: number; lights?: number; bend?: number | number[]; land?: "v" };
type Route = { pts: readonly (readonly number[])[]; kind: "data" | "leader"; o: RouteOpts };
export type Pen = {
  dot: (x: number, y: number, z: number, size: number, c: Rgb, a: number, soft?: number) => void;
  lit: (x: number, y: number, z: number, size: number, c: Rgb, a: number) => void;
  line: (a: readonly number[], b: readonly number[], c: Rgb, alpha: number, alphaB?: number) => void;
  // A line that shines: on the dark stage a line in the bloom like the rest; on the light one, where the shot sets `glow`,
  // `glow` (its own colour where unset) also spreads round it, the stage's colour not at all.
  shine: (a: readonly number[], b: readonly number[], c: Rgb, alpha: number, glow?: Rgb) => void;
  // A solid face: four corners, each with its own opacity; it hides the dots and lines behind it. `ground` is the stage,
  // to mix solid shades from.
  quad: (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], col: Rgb, alphas: readonly number[]) => void;
  route: (pts: readonly (readonly number[])[], kind: "data" | "leader", o?: RouteOpts) => void;
  ink: Rgb; ground: Rgb; dark: boolean;
  shade: (cols: number, rows: number) => Float32Array | null;
};

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const ease = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixV = (a: readonly number[], b: readonly number[], t: number) => a.map((v, k) => mix(v, b[k], t));
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Dots sized in world units, each with its own colour and opacity: a crisp disc (soft 0), a glow fading from its middle
// (soft 1) or a tile, a square with rounded corners (soft 2). On the dark stage they add up like light; on the light one
// they are laid like ink.
const DOT_VERTEX = `attribute float size; attribute vec4 tint; attribute float soft; varying vec4 vTint; varying float vSoft;
uniform float unit; uniform float fogNear; uniform float fogFar; uniform float fogAmount;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vSoft = soft;
  vTint = vec4(tint.rgb, tint.a * (1.0 - fogAmount * smoothstep(fogNear, fogFar, -mv.z)));
  gl_PointSize = max(1.0, size * unit / -mv.z); gl_Position = projectionMatrix * mv; }`;
const DOT_FRAGMENT = `varying vec4 vTint; varying float vSoft;
void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float a;
  if (vSoft > 1.5) { vec2 q = abs(p); a = smoothstep(1.0, 0.9, pow(pow(q.x, 6.0) + pow(q.y, 6.0), 1.0 / 6.0)); }
  else { float d = dot(p, p); if (d > 1.0) discard; a = mix(smoothstep(1.0, 0.64, d), pow(1.0 - sqrt(d), 2.0), vSoft); }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vTint.rgb, vTint.a * a); }`;

function dotsOf(max: number) {
  const geometry = new THREE.BufferGeometry(), pos = new Float32Array(max * 3), tint = new Float32Array(max * 4), size = new Float32Array(max), soft = new Float32Array(max);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geometry.setAttribute("tint", new THREE.BufferAttribute(tint, 4));
  geometry.setAttribute("size", new THREE.BufferAttribute(size, 1)); geometry.setAttribute("soft", new THREE.BufferAttribute(soft, 1));
  const uniforms = { unit: { value: 1 }, fogNear: { value: 0 }, fogFar: { value: 1 }, fogAmount: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: DOT_VERTEX, fragmentShader: DOT_FRAGMENT, transparent: true, depthWrite: false, depthTest: true });
  const object = new THREE.Points(geometry, material); object.frustumCulled = false;
  let n = 0;
  return {
    object, material, uniforms,
    begin() { n = 0; },
    add(x: number, y: number, z: number, s: number, c: Rgb, a: number, sf: number) {
      if (n >= max || a < 0.004 || s <= 0) return;
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; size[n] = s; soft[n] = sf;
      tint[n * 4] = c[0]; tint[n * 4 + 1] = c[1]; tint[n * 4 + 2] = c[2]; tint[n * 4 + 3] = Math.min(1, a); n++;
    },
    end() { geometry.setDrawRange(0, n); for (const name of ["position", "tint", "size", "soft"]) geometry.getAttribute(name).needsUpdate = true; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
// Hairlines, each end with its own colour and opacity.
function linesOf(max: number) {
  const geometry = new THREE.BufferGeometry(), pos = new Float32Array(max * 6), col = new Float32Array(max * 8);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: true });
  const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; object.renderOrder = -1;
  let n = 0;
  return {
    object, material,
    begin() { n = 0; },
    add(a: readonly number[], b: readonly number[], c: Rgb, aa: number, ab: number) {
      if (n >= max || (aa < 0.004 && ab < 0.004)) return;
      pos.set([a[0], a[1], a[2], b[0], b[1], b[2]], n * 6); col.set([c[0], c[1], c[2], Math.min(1, aa), c[0], c[1], c[2], Math.min(1, ab)], n * 8); n++;
    },
    end() { geometry.setDrawRange(0, n * 2); geometry.getAttribute("position").needsUpdate = true; geometry.getAttribute("color").needsUpdate = true; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
// Faces in two triangles, each corner with its own colour and opacity, drawn first and solid: they write depth, and the
// dots and lines (which test it but write none) hide behind them. A picture with no faces draws as before.
function facesOf(max: number) {
  const geometry = new THREE.BufferGeometry(), pos = new Float32Array(max * 18), col = new Float32Array(max * 24);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide });
  const object = new THREE.Mesh(geometry, material); object.frustumCulled = false; object.renderOrder = -2;
  let n = 0;
  const corner = (k: number, q: readonly number[], c: Rgb, a: number) => { pos.set([q[0], q[1], q[2]], k * 3); col.set([c[0], c[1], c[2], Math.min(1, a)], k * 4); };
  return {
    object, material,
    begin() { n = 0; },
    add(q: readonly (readonly number[])[], c: Rgb, a: readonly number[]) {
      if (n >= max || Math.max(...a) < 0.004) return;
      [0, 1, 2, 0, 2, 3].forEach((v, k) => corner(n * 6 + k, q[v], c, a[v]));
      n++;
    },
    end() { geometry.setDrawRange(0, n * 6); geometry.getAttribute("position").needsUpdate = true; geometry.getAttribute("color").needsUpdate = true; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

/* ---------- One grammar for every line ---------- */
// Every line of the pictures, data or leader, is drawn on the screen in runs that are level, at 45° or upright, joined by
// bends of one radius: no corner and no free curve. Data and leaders differ only in how they are drawn (.vl-lines in
// globals.css), so neither reads as a mess of shapes. Drawn on the screen, not in the scene, so a line stays on its words
// as the camera sways and its angles stay true.
type P2 = [number, number];
// From point to point: level, one 45° run, level again (upright, 45°, upright where the step is steeper than it is long);
// `bend` (one, or one per hop) is where along the level (or upright) part the 45° run falls. `land: "v"` ends the last run upright, into the
// top of what it reaches.
function octo(pts: P2[], bends: number | number[] = 0.5, land?: "v"): P2[] {
  const out: P2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const bend = typeof bends === "number" ? bends : bends[Math.min(i - 1, bends.length - 1)];
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1, adx = Math.abs(dx), ady = Math.abs(dy);
    // A step too small to read as a step (perspective puts a few pixels between the ends of a line upright in the
    // scene) is no step: the run goes straight, level or upright.
    if (Math.min(adx, ady) < Math.max(6, 0.1 * Math.max(adx, ady))) { out.push(adx >= ady ? [bx, ay] : [ax, by]); continue; }
    if (land === "v" && i === pts.length - 1) { const l = Math.min(adx, ady) * 0.7; out.push([bx - sx * l, ay], [bx, ay + sy * l], [bx, by]); }
    else if (adx >= ady) { const h = adx - ady; out.push([ax + sx * h * bend, ay], [ax + sx * (h * bend + ady), by], [bx, by]); }
    else { const v = ady - adx; out.push([ax, ay + sy * v * bend], [bx, ay + sy * (v * bend + adx)], [bx, by]); }
  }
  return out.filter((q, i) => !i || Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]) > 0.5);
}
// A leader: from the thing at 45°, then level into its words (the "do" leader readers found the most pleasing, with one
// flat bend: Barth et al., On the Readability of Boundary Labeling, 2015); upright first where the words stand steeper.
function leaderPts(from: P2, to: P2, landing = 12): P2[] {
  const dx = to[0] - from[0], dy = to[1] - from[1], sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1, run = Math.max(0, Math.abs(dx) - landing);
  if (Math.abs(dy) < 0.75) return [from, to];
  if (run >= Math.abs(dy)) return [from, [from[0] + sx * Math.abs(dy), to[1]], to];
  return [from, [from[0], to[1] - sy * run], [from[0] + sx * run, to[1]], to];
}
const fmt = (q: readonly number[]) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`;
// The runs as one SVG path, every bend rounded to radius r (less where a run is short).
function filleted(pts: P2[], r: number) {
  if (pts.length < 2) return "";
  let d = `M${fmt(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], q = pts[i], b = pts[i + 1], la = Math.hypot(q[0] - a[0], q[1] - a[1]), lb = Math.hypot(b[0] - q[0], b[1] - q[1]);
    if (la < 1e-3 || lb < 1e-3) continue;
    const k = Math.min(r, la / 2, lb / 2);
    d += ` L${fmt([q[0] - (q[0] - a[0]) / la * k, q[1] - (q[1] - a[1]) / la * k])} Q${fmt(q)} ${fmt([q[0] + (b[0] - q[0]) / lb * k, q[1] + (b[1] - q[1]) / lb * k])}`;
  }
  return `${d} L${fmt(pts[pts.length - 1])}`;
}
const SVG_NS = "http://www.w3.org/2000/svg";

// The light stage's glow: what shines, drawn again as the ink it lays (how far its glow colour stands below the stage)
// into a target of its own behind the faces and blurred short, takes that much out of the frame, so its colour spreads
// round it as ink does on paper. The engine keeps a short bloom on its light stage too (src/lib/glow-3d.ts).
const INK_SPREAD = {
  uniforms: { tDiffuse: { value: null }, tGlow: { value: null } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tGlow; varying vec2 vUv;
void main() { vec4 c = texture2D(tDiffuse, vUv); vec3 g = texture2D(tGlow, vUv).rgb; gl_FragColor = vec4(c.rgb * (1.0 - clamp(g, 0.0, 0.92)), c.a); }`,
};

// One picture: its own renderer, bloom on the dark stage, a camera that fits the picture to the box and settles onto it
// when it comes into view, leaning after the pointer, and the words placed at their points every frame. `still` is the
// moment shown where motion is reduced (seconds); `fallback` stands in where WebGL is not there.
export function LightFigure({ src, draw, shot, tags, label, still, fallback }: { src: string; draw: (s: number, pen: Pen) => void; shot: Shot; tags: Tag[]; label: string; still: number; fallback: ReactNode }) {
  const [flat, setFlat] = useState(false);
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), lines = useRef<SVGSVGElement>(null), spans = useRef<(HTMLSpanElement | null)[]>([]);
  const words = useRef(tags), painter = useRef(draw);
  words.current = tags; painter.current = draw;
  useEffect(() => {
    const holder = box.current!, el = canvas.current!, layer = lines.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true }); } catch { setFlat(true); return; }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2), fov = shot.fov ?? 24;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.setPixelRatio(pixelRatio);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
    const D = dotsOf(26000), L = linesOf(9000), F = facesOf(2000);
    scene.add(F.object, L.object, D.object);
    // Bloom takes only what is lit (the photo's tiles stay under its threshold).
    const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.72);
    composer.setPixelRatio(pixelRatio); composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
    // The light stage's glow, where the shot sets it: what shines, in a scene of its own, behind the faces drawn black.
    const glow = shot.glow ?? 0, GL = linesOf(4000), glowScene = new THREE.Scene();
    GL.material.blending = THREE.AdditiveBlending; glowScene.add(GL.object);
    const glowTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const spread = new UnrealBloomPass(new THREE.Vector2(256, 256), glow, LIGHT_RADIUS, 0), inkPass = new ShaderPass(INK_SPREAD), inked = new EffectComposer(renderer);
    inkPass.uniforms.tGlow.value = glowTarget.texture;
    inked.setPixelRatio(pixelRatio); inked.addPass(new RenderPass(scene, camera)); inked.addPass(inkPass); inked.addPass(new OutputPass());

    // The photo's patches at any grid, read once the photo is in: each patch's mean colour (display values).
    const image = new Image(), grids = new Map<string, Float32Array>();
    let loaded = false;
    image.onload = () => { loaded = true; };
    image.src = src;
    const shade = (cols: number, rows: number) => {
      if (!loaded) return null;
      const key = `${cols}x${rows}`, have = grids.get(key);
      if (have) return have;
      const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      // Down in halves first, so each patch is the mean of its pixels and not one sample.
      let from: CanvasImageSource = image, w = image.naturalWidth, h = image.naturalHeight;
      while (w / 2 > cols * 2 && h / 2 > rows * 2) {
        const half = document.createElement("canvas"); half.width = Math.round(w / 2); half.height = Math.round(h / 2);
        half.getContext("2d")!.drawImage(from, 0, 0, half.width, half.height); from = half; w = half.width; h = half.height;
      }
      c.width = cols; c.height = rows; ctx.imageSmoothingQuality = "high"; ctx.drawImage(from, 0, 0, cols, rows);
      const data = ctx.getImageData(0, 0, cols, rows).data, out = new Float32Array(cols * rows * 3);
      for (let p = 0; p < cols * rows; p++) for (let k = 0; k < 3; k++) out[p * 3 + k] = data[p * 4 + k] / 255;
      grids.set(key, out);
      return out;
    };

    let dark = true, ink: number[] = [1, 1, 1], ground: number[] = [0, 0, 0];
    const stage = new THREE.Color();
    const theme = () => {
      dark = isDark();
      ground = stageGround(el, dark); const c = new THREE.Color(getComputedStyle(holder).getPropertyValue("--stage-ink").trim() || "#232323"), o = { r: 0, g: 0, b: 0 };
      c.getRGB(o, THREE.SRGBColorSpace); ink = [o.r, o.g, o.b];
      stage.setRGB(ground[0], ground[1], ground[2], THREE.LinearSRGBColorSpace); renderer.setClearColor(stage, 1);
      const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      D.material.blending = blending; L.material.blending = blending;
      D.material.needsUpdate = true; L.material.needsUpdate = true; F.material.needsUpdate = true;
    };
    theme();
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const target = new THREE.Vector3(...shot.target), p = new THREE.Vector3();
    const look = (yaw: number, tilt: number) => new THREE.Vector3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
    let size = "", distance = 20;
    const fit = (w: number, h: number) => {
      camera.aspect = w / h; camera.clearViewOffset(); camera.updateProjectionMatrix();
      const dir = look(shot.yaw, shot.tilt);
      for (let i = 0; i < 8; i++) {
        camera.position.copy(target).addScaledVector(dir, distance); camera.lookAt(target); camera.updateMatrixWorld();
        let most = 0;
        for (const b of shot.bounds) { p.set(b[0], b[1], b[2]).project(camera); most = Math.max(most, Math.abs(p.x) / 0.96, Math.abs(p.y) / 0.94); }
        distance *= most;
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const b of shot.bounds) { p.set(b[0], b[1], b[2]).project(camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      camera.setViewOffset(w, h, (x0 + x1) / 2 * w / 2, -(y0 + y1) / 2 * h / 2, w, h); camera.updateProjectionMatrix();
    };
    const span = Math.max(...[0, 1, 2].map((k) => Math.max(...shot.bounds.map((b) => b[k])) - Math.min(...shot.bounds.map((b) => b[k]))));
    let fogNear = 0, fogFar = 1;
    const FOG = 0.5;
    const fade = (x: number, y: number, z: number) => { const d = -p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z; return 1 - FOG * clamp((d - fogNear) / Math.max(fogFar - fogNear, 1e-3)); };
    const glowing = () => glow > 0 && !dark;
    const pen: Pen = {
      dot: (x, y, z, s, c, a, soft = 0) => D.add(x, y, z, s, c, a, soft),
      lit: (x, y, z, s, c, a) => { D.add(x, y, z, s * (dark ? 3.4 : 2.8), c, a * (dark ? 0.2 : 0.11), 1); D.add(x, y, z, s, c, a, 0); },
      line: (a, b, c, aa, ab = aa) => L.add(a, b, c, aa * fade(a[0], a[1], a[2]), ab * fade(b[0], b[1], b[2])),
      shine: (a, b, c, alpha, g = c) => {
        const aa = alpha * fade(a[0], a[1], a[2]), ab = alpha * fade(b[0], b[1], b[2]);
        L.add(a, b, c, aa, ab);
        if (glowing()) GL.add(a, b, g.map((v, k) => Math.max(0, ground[k] - v)), aa, ab);
      },
      quad: (a, b, c, d, col, alphas) => F.add([a, b, c, d], col, [a, b, c, d].map((q, k) => alphas[k] * fade(q[0], q[1], q[2]))),
      route: (pts, kind, o = {}) => { routes.push({ pts, kind, o }); },
      get ink() { return ink; }, get ground() { return ground; }, get dark() { return dark; }, shade,
    };
    // The lines, drawn on the screen in an SVG over the canvas: halos, leaders, data, the lights along it, leaders' dots.
    const routes: Route[] = [];
    const groups = ["vl-halo", "vl-leader", "vl-data", "vl-pulse", "vl-tip"].map((cls) => { const g = document.createElementNS(SVG_NS, "g"); g.setAttribute("class", cls); layer.append(g); return g; });
    const pools: SVGElement[][] = groups.map(() => []), used = groups.map(() => 0);
    const take = (g: number) => {
      const pool = pools[g];
      if (used[g] >= pool.length) { const made = document.createElementNS(SVG_NS, g === 4 ? "circle" : "path"); if (g === 3) made.setAttribute("pathLength", "1"); if (g === 4) made.setAttribute("r", "2"); groups[g].append(made); pool.push(made); }
      const got = pool[used[g]++]; got.style.opacity = "1"; return got;
    };
    let W = 1, H = 1;
    const screen = (q: readonly number[]): P2 | null => { p.set(q[0], q[1], q[2]).project(camera); return p.z > 1 ? null : [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
    const leader = (from: P2, to: P2, a: number) => {
      const d = filleted(leaderPts(from, to), 6);
      for (const g of [0, 1]) { const line = take(g); line.setAttribute("d", d); line.style.opacity = a.toFixed(2); }
      const tip = take(4); tip.setAttribute("cx", from[0].toFixed(1)); tip.setAttribute("cy", from[1].toFixed(1)); tip.style.opacity = a.toFixed(2);
    };
    const data = (pts: P2[], o: RouteOpts, s: number) => {
      const d = filleted(octo(pts, o.bend, o.land), 12), a = (o.a ?? 1).toFixed(2), line = take(2);
      line.setAttribute("d", d); line.style.opacity = a;
      if (!o.speed) return;
      const n = o.lights ?? 1, pulse = take(3);
      pulse.setAttribute("d", d); pulse.style.opacity = a;
      pulse.style.strokeDasharray = `0.022 ${(1 / n - 0.022).toFixed(3)}`; pulse.style.strokeDashoffset = (-((s * o.speed + (o.offset ?? 0)) % 1)).toFixed(4);
    };

    let raf = 0, started = -1, shown = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!holder.offsetParent) { shown = -1; return; }
      if (started < 0) started = now;
      if (shown < 0) shown = now;
      const w = holder.clientWidth, h = holder.clientHeight;
      if (!w || !h) return;
      if (`${w}x${h}` !== size) {
        size = `${w}x${h}`; renderer.setSize(w, h, false); composer.setSize(w, h); fit(w, h);
        glowTarget.setSize(w * pixelRatio, h * pixelRatio); spread.setSize(w * pixelRatio, h * pixelRatio); inked.setSize(w, h);
        // The words shrink with a picture smaller than a laptop's (about 720 × 380), so they keep their places apart.
        holder.style.setProperty("--k", clamp(Math.min(w / 720, h / 380), 0.68, 1).toFixed(3));
        D.uniforms.unit.value = h * pixelRatio / (2 * Math.tan(fov * Math.PI / 360));
      }
      const s = reduced ? still : (now - started) / 1000;
      const lean = reduced ? { x: 0, y: 0 } : pointerLean(now);
      // Settles in from farther back, higher and to the side; then sways a little and leans after the pointer.
      const settle = reduced ? 0 : (1 - clamp((now - shown) / 1100)) ** 3;
      const yaw = shot.yaw + (reduced ? 0 : 0.04 * Math.sin(s * 0.21)) + 0.1 * lean.x - 0.5 * settle, tilt = shot.tilt + 0.05 * lean.y + 0.16 * settle;
      camera.position.copy(target).addScaledVector(look(yaw, tilt), distance * (1 + 0.6 * settle)); camera.lookAt(target); camera.updateMatrixWorld();
      // Depth: what stands farther back sinks into the stage, from a quarter of the way into the picture.
      let near = Infinity, far = -Infinity;
      for (const b of shot.bounds) { const d = -p.set(b[0], b[1], b[2]).applyMatrix4(camera.matrixWorldInverse).z; near = Math.min(near, d); far = Math.max(far, d); }
      fogNear = near + 0.25 * (far - near); fogFar = far + 0.3 * span;
      D.uniforms.fogNear.value = fogNear; D.uniforms.fogFar.value = fogFar; D.uniforms.fogAmount.value = FOG;
      D.begin(); L.begin(); F.begin(); GL.begin(); routes.length = 0; used.fill(0); W = w; H = h;
      painter.current(s, pen);
      D.end(); L.end(); F.end(); GL.end();
      if (dark) composer.render();
      else if (glow > 0) {
        // The glow first: the faces in black, to hide what shines behind them, then what shines, blurred short.
        renderer.setRenderTarget(glowTarget); renderer.setClearColor(0x000000, 1);
        D.object.visible = L.object.visible = false; F.object.material = black; renderer.render(scene, camera);
        F.object.material = F.material; D.object.visible = L.object.visible = true;
        renderer.autoClear = false; renderer.render(glowScene, camera); renderer.autoClear = true;
        renderer.setRenderTarget(null); renderer.setClearColor(stage, 1);
        spread.render(renderer, glowTarget, glowTarget, 0, false);
        inked.render();
      } else renderer.render(scene, camera);
      words.current.forEach((tag, i) => {
        const el = spans.current[i];
        if (!el) return;
        const at = tag.at(s), alpha = at ? (tag.fade?.(s) ?? 1) * clamp((now - shown) / 700) : 0;
        if (!at || alpha <= 0.01) { el.style.opacity = "0"; return; }
        const spot = screen(at);
        if (!spot) { el.style.opacity = "0"; return; }
        el.style.opacity = alpha.toFixed(2);
        el.style.left = `${spot[0].toFixed(1)}px`; el.style.top = `${spot[1].toFixed(1)}px`;
        // Its leader ends just short of the words, level with their middle.
        const from = tag.leader?.(s), thing = from ? screen(from) : null;
        if (thing) leader(thing, [spot[0] + (tag.align === "end" ? -3 : 3), spot[1]], alpha);
      });
      for (const r of routes) {
        if ((r.o.a ?? 1) < 0.01) continue;
        const pts = r.pts.map(screen);
        if (pts.some((q) => !q)) continue;
        if (r.kind === "leader") leader(pts[0]!, pts[pts.length - 1]!, r.o.a ?? 1); else data(pts as P2[], r.o, s);
      }
      pools.forEach((pool, g) => { for (let k = used[g]; k < pool.length; k++) pool[k].style.opacity = "0"; });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); watch.disconnect(); image.onload = null; D.dispose(); L.dispose(); F.dispose(); bloom.dispose(); composer.dispose();
      GL.dispose(); glowTarget.dispose(); black.dispose(); spread.dispose(); inkPass.dispose(); inked.dispose(); renderer.dispose();
    };
  }, [src, shot, still]);

  if (flat) return fallback;
  return <div className="lf vl" ref={box}>
    <canvas ref={canvas} role="img" aria-label={label} />
    <svg className="vl-lines" ref={lines} aria-hidden="true" />
    <div className="lf-tags">
      {tags.map((tag, i) => <span key={i} ref={(el) => { spans.current[i] = el; }} className={`lf-tag${tag.cls ? ` ${tag.cls}` : ""}`} data-dim={tag.dim ? "" : undefined}
        style={{ opacity: 0, transform: SHIFT[tag.align ?? "left"] }}>{tag.text}</span>)}
    </div>
  </div>;
}

/* ---------- 사진 확대: the facts the picture draws ---------- */
const IW = 720, IH = 960, KU = 263 / IW, KV = 571 / IH;
const COARSE: [number, number] = [26, 36], FINE: [number, number] = [40, 54];
// The band of the photo drawn: rows 12–25 of the 512² grid (26 × 14), the same band as rows 18–38 of the 768² one
// (40 × 21) — the sign, the flag and the no-parking signs, as the step's other figures crop it.
const V0 = 12 / 36, V1 = 26 / 36, BAND = (V1 - V0) * IH / IW;
const vb = (v: number) => (v - V0) / (V1 - V0);
const P512 = [0.0168, 0.0007, 0.4912, 0.4912], P768 = [0.00016, 0.00004, 0.00004, 0.99976];
const LETTERS = ["a", "b", "c", "d"], WORDS = ["500m", "1km", "100m", "300m"];
// One loop: 512² held, the patches split from the answer outward, 768² held, then back.
export const LOOP = 8.8, STILL = 5.6;
export const raw = (s: number) => { const t = ((s % LOOP) + LOOP) % LOOP; return t < 2.6 ? 0 : t < 4.1 ? (t - 2.6) / 1.5 : t < 7.5 ? 1 : 1 - (t - 7.5) / 1.3; };
// The chances follow once the patches round the answer have split.
export const turn = (s: number) => ease(clamp((raw(s) - 0.3) / 0.6));
const chancesAt = (s: number) => mixV(P512, P768, turn(s));
const pickAt = (s: number) => (turn(s) < 0.5 ? 2 : 3);
export const rgbAt = (g: Float32Array, k: number): Rgb => [g[k * 3], g[k * 3 + 1], g[k * 3 + 2]];
// How far a place of the photo is through the split, nearest the answer first.
const SPREAD = 0.9;
const splitAt = (r: number, u: number, v: number) => ease(clamp(r * (1 + SPREAD) - Math.min(1, Math.hypot((u - KU) * 0.75, v - KV) / 0.6) * SPREAD));
// A tile, lit: its glow under it.
export const tileLit = (pen: Pen, p: readonly number[], size: number, c: Rgb, a: number) => { pen.dot(p[0], p[1], p[2], size * 2.6, c, a * (pen.dark ? 0.16 : 0.08), 1); pen.dot(p[0], p[1], p[2], size, c, a, 2); };

// The band's patches as tiles in their real colours, laid by `place` (u from the left, v from the photo's top, 0–1): the
// 512² grid at r 0 and the 768² grid at 1; between, every coarse tile splits into the fine ones inside it. `width` is the
// photo's width in the scene. Nothing until the photo is in.
function patches(pen: Pen, r: number, place: (u: number, v: number) => number[], width: number) {
  const coarse = pen.shade(...COARSE), fine = pen.shade(...FINE);
  if (!coarse || !fine) return;
  const [cc, cr] = COARSE, [fc, fr] = FINE, cs = width / cc, fs = width / fc, bright = pen.dark ? 0.6 : 1;
  // A little more colour than the mean of the patch, so the band reads as the street it is.
  const put = (pt: number[], sz: number, c: Rgb, a: number) => { const m = (c[0] + c[1] + c[2]) / 3; pen.dot(pt[0], pt[1], pt[2], sz, c.map((v) => clamp(m + (v - m) * 1.2) * bright), a, 2); };
  for (let j = Math.round(V0 * cr); j < Math.round(V1 * cr); j++) for (let i = 0; i < cc; i++) {
    const u = (i + 0.5) / cc, v = (j + 0.5) / cr, e = splitAt(r, u, v);
    if (e < 1) put(place(u, v), cs * 0.9 * (1 - 0.3 * e), rgbAt(coarse, j * cc + i), 1 - e);
  }
  for (let j = Math.round(V0 * fr); j < Math.round(V1 * fr); j++) for (let i = 0; i < fc; i++) {
    const u = (i + 0.5) / fc, v = (j + 0.5) / fr, pi = Math.min(cc - 1, Math.floor(u * cc)), pj = Math.min(cr - 1, Math.floor(v * cr));
    const pu = (pi + 0.5) / cc, pv = (pj + 0.5) / cr, e = splitAt(r, pu, pv);
    if (e <= 0) continue;
    put(mixV(place(pu, pv), place(u, v), e), mix(cs * 0.5, fs * 0.9, e), mixV(rgbAt(coarse, pj * cc + pi), rgbAt(fine, j * fc + i), e), e);
  }
}
// A smooth curve through the points (centripetal Catmull–Rom: no corners, no loops), `per` samples a stretch.
export function smooth(pts: readonly (readonly number[])[], per = 12) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const knot = (a: readonly number[], b: readonly number[]) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) ** 0.5);
  const at = (a: readonly number[], b: readonly number[], ta: number, tb: number, t: number) => a.map((v, k) => (v * (tb - t) + b[k] * (t - ta)) / (tb - ta));
  const out: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1], p0 = i ? pts[i - 1] : p1.map((v, k) => 2 * v - p2[k]), p3 = i + 2 < pts.length ? pts[i + 2] : p2.map((v, k) => 2 * v - p1[k]);
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    for (let k = i ? 1 : 0; k <= per; k++) {
      const t = t1 + (t2 - t1) * k / per, a1 = at(p0, p1, 0, t1, t), a2 = at(p1, p2, t1, t2, t), a3 = at(p2, p3, t2, t3, t);
      out.push(at(at(a1, a2, 0, t2, t), at(a2, a3, t1, t3, t), t1, t2, t));
    }
  }
  return out;
}
// A curve from a that leaves level and comes down onto b, as the chances fan out from the language model's end.
export const drop = (a: readonly number[], b: readonly number[], n = 16) => Array.from({ length: n + 1 }, (_, k) => {
  const t = k / n, c = [mix(a[0], b[0], 0.62), a[1], mix(a[2], b[2], 0.62)];
  return a.map((v, i) => (1 - t) ** 2 * v + 2 * (1 - t) * t * c[i] + t * t * b[i]);
});
// A line along the points, as strong as `a`.
export const curve = (pen: Pen, pts: number[][], _c: Rgb, a: number) => pen.route(pts, "data", { a });
// A cubic Bézier: a patch's light from its place into its token, bowed through the encoder's mouth and throat.
export const cubic = (p: readonly (readonly number[])[], t: number) => p[0].map((_, i) => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i]);
// The question's way: a data line through its points, with a light running along it.
export function path(pen: Pen, through: number[][], _c: Rgb, _s: number, strong = 0.8, speed = 0.32) { pen.route(through, "data", { a: strong, speed, bend: [...through.slice(2).map(() => 0.5), 0] }); }
// The letters' chances as columns of tiles, the chosen one lit.
export const TILE = 0.2, STEP = 0.235;
function columns(pen: Pen, s: number, xs: (m: number) => number[], height: number, chosen: Rgb) {
  const p = chancesAt(s), pick = pickAt(s);
  for (let m = 0; m < 4; m++) {
    const [x, y, z] = xs(m), n = Math.max(1, Math.round(p[m] * height / STEP)), on = m === pick;
    for (let k = 0; k < n; k++) {
      const at = [x, y + STEP / 2 + k * STEP, z];
      if (on) tileLit(pen, at, TILE, chosen, 0.95); else pen.dot(at[0], at[1], at[2], TILE, pen.ink, p[m] > 0.1 ? 0.55 : 0.3, 2);
    }
  }
  const a = xs(0), b = xs(3);
  pen.line([a[0] - 0.35, a[1] - 0.04, a[2]], [b[0] + 0.35, b[1] - 0.04, b[2]], pen.ink, 0.3);
}
// The words of the chances: letter and word under each column, the chance above (two sets, crossing over as they turn),
// what was chosen and the answer under the word.
function chanceTags(xs: (m: number) => number[], height: number): Tag[] {
  const t512 = (s: number) => 1 - turn(s), t768 = (s: number) => turn(s);
  const shown = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(1)}%`);
  const top = (m: number, p: number): V3 => { const [x, y, z] = xs(m); return [x, y + Math.max(1, Math.round(p * height / STEP)) * STEP + 0.12, z]; };
  return [
    ...LETTERS.map((k, m): Tag => ({ text: <><b>{k}</b><span>{WORDS[m]}</span></>, at: () => { const [x, y, z] = xs(m); return [x, y - 0.12, z]; }, align: "below", cls: "vl-choice", dim: m < 2 })),
    ...[0, 1, 2, 3].flatMap((m): Tag[] => [
      { text: shown(P512[m]), at: () => (m < 2 ? null : top(m, P512[m])), fade: t512, align: "above", cls: "vl-chance", dim: P512[m] < 0.1 },
      { text: shown(P768[m]), at: () => (m < 2 ? null : top(m, P768[m])), fade: t768, align: "above", cls: "vl-chance", dim: P768[m] < 0.1 },
    ]),
    { text: "고른 답", at: () => { const [x, y, z] = xs(2); return [x, y - 1.0, z]; }, fade: t512, align: "below", cls: "vl-mark" },
    { text: "정답", at: () => { const [x, y, z] = xs(3); return [x, y - 1.0, z]; }, fade: t512, align: "below", cls: "vl-mark is-gold" },
    { text: <><span>고른 답</span><span>정답</span></>, at: () => { const [x, y, z] = xs(3); return [x, y - 1.0, z]; }, fade: t768, align: "below", cls: "vl-mark is-gold" },
  ];
}
// The input's size, 512² or 768², crossing over in one place as the patches split.
const sizeTags = (at: V3): Tag[] => [
  { text: <><b>512²</b><span>사진 토큰 234</span></>, at: () => at, fade: (s) => 1 - ease(clamp(raw(s) * 2.2 - 0.6)), cls: "vl-size" },
  { text: <><b>768²</b><span>사진 토큰 540</span></>, at: () => at, fade: (s) => ease(clamp(raw(s) * 2.2 - 0.6)), cls: "vl-size" },
];

/* ---------- The model, one structure of light ---------- */
export const B = { PW: 4.4, cx: -5.2, cy: 2.0, E0: -2.6, E1: -1.5, ER0: 1.75, ER1: 1.0, TX: -0.2, TW: 2.1, L0: 1.3, L1: 2.6, LR: 1.3, OUT: 3.0, BX: 3.7, BG: 1.15, BY: 0.4, BH: 2.8 };
const B_PH = B.PW * BAND, B_TH = B.TW * BAND;
const bPlace = (u: number, v: number) => [B.cx + (u - 0.5) * B.PW, B.cy + (0.5 - vb(v)) * B_PH, 0];
const bBar = (m: number) => [B.BX + m * B.BG, B.BY, 0];
// A token's place on the sheet that stands between the encoder and the language model.
const bToken = (u: number, v: number) => [B.TX + (u - 0.5) * B.TW, B.cy + (0.5 - vb(v)) * B_TH, 0];
// Inside a ring a patch's light is at its place in the photo, shrunk into the ring.
const bInside = (u: number, v: number, x: number, radius: number) => [x, B.cy + (0.5 - vb(v)) * radius * 0.9, (u - 0.5) * radius * 1.6];
const B_SHOT: Shot = { target: [-0.6, 2.0, 0], yaw: -0.34, tilt: 0.2, bounds: [[B.cx - B.PW / 2 - 0.1, B.cy - B_PH / 2 - 0.3, 0], [B.cx - B.PW / 2 - 0.1, B.cy + B_PH / 2 + 0.8, 0], [B.BX + 3 * B.BG + 0.35, -0.45, 0], [B.BX + 3 * B.BG + 0.35, B.BY + B.BH + 0.45, 0], [B.E0, B.cy + B.ER0, 0], [B.E0, B.cy - B.ER0 - 0.3, 0], [B.E0, B.cy, B.ER0], [B.L0, B.cy, -B.LR]] };
// The structure's names, each in calm space with a leader to its part: the encoder's middle ring, the token sheet's top,
// the language model's middle ring.
export const structureTags = (TH: number, tokens = true): Tag[] => [
  { text: "비전 인코더", at: () => [(B.E0 + B.E1) / 2 - 0.55, B.cy - B.ER0 - 0.4, 0], align: "end", dim: true, leader: () => [(B.E0 + B.E1) / 2, B.cy - (B.ER0 + B.ER1) / 2, 0] },
  ...(tokens ? [{ text: "사진 토큰", at: () => [B.TX + 0.45, B.cy + B.LR + 0.3, 0], align: "start", dim: true, leader: () => [B.TX, B.cy + TH / 2 + 0.03, 0] } as Tag] : []),
  { text: "언어 모델 · 4B", at: () => [(B.L0 + B.L1) / 2 - 0.55, B.cy - B.LR - 0.4, 0], align: "end", dim: true, leader: () => [(B.L0 + B.L1) / 2, B.cy - B.LR, 0] },
];
const B_TAGS: Tag[] = [
  ...sizeTags([B.cx - B.PW / 2, B.cy + B_PH / 2 + 0.4, 0]),
  ...structureTags(B_TH),
  ...chanceTags(bBar, B.BH),
];

function drawB(s: number, pen: Pen) {
  const r = raw(s), flow = pen.ink;
  patches(pen, r, bPlace, B.PW);
  // The encoder's layers: rings narrowing along the flow, a wave of light passing through them.
  const wave = (s * 0.55) % 1.4 - 0.2;
  for (let l = 0; l < 8; l++) {
    const q = l / 7, x = mix(B.E0, B.E1, q), rad = mix(B.ER0, B.ER1, q), on = Math.max(0, 1 - Math.abs(q - wave) / 0.18);
    for (let n = 0; n < 72; n++) { const t = n / 72 * Math.PI * 2; pen.dot(x, B.cy + rad * Math.cos(t), rad * Math.sin(t), 0.03 + 0.02 * on, pen.ink, 0.18 + 0.5 * on); }
  }
  // The tokens, 2 × 2 patches each, as smaller tiles in their patches' colour: the 512² sheet (13 × 18) splitting into the
  // 768² one (20 × 27).
  const tc = pen.shade(13, 18), tf = pen.shade(20, 27);
  for (let j = 0; j < 18; j++) for (let i = 0; i < 13; i++) {
    const u = (i + 0.5) / 13, v = (j + 0.5) / 18, e = splitAt(r, u, v);
    if (v < V0 || v > V1 || e >= 1) continue;
    tileLit(pen, bToken(u, v), B.TW / 13 * 0.88 * (1 - 0.3 * e), tc ? rgbAt(tc, j * 13 + i) : pen.ink, 1 - e);
  }
  for (let j = 0; j < 27; j++) for (let i = 0; i < 20; i++) {
    const u = (i + 0.5) / 20, v = (j + 0.5) / 27, pu = (Math.floor(u * 13) + 0.5) / 13, pv = (Math.floor(v * 18) + 0.5) / 18, e = splitAt(r, pu, pv);
    if (v < V0 || v > V1 || e <= 0) continue;
    tileLit(pen, mixV(bToken(pu, pv), bToken(u, v), e), mix(B.TW / 13 * 0.5, B.TW / 20 * 0.88, e), tf ? rgbAt(tf, j * 20 + i) : pen.ink, e);
  }
  // The question's words join the image tokens below the sheet.
  for (let n = 0; n < 10; n++) pen.dot(B.TX + (n - 4.5) * 0.17, B.cy - B_TH / 2 - 0.35, 0, 0.06, pen.ink, 0.5);
  // The language model's layers: rings along the flow, a wave of light through them.
  const wave2 = (s * 0.42 + 0.5) % 1.3 - 0.15;
  for (let l = 0; l < 6; l++) {
    const q = l / 5, x = mix(B.L0, B.L1, q), on = Math.max(0, 1 - Math.abs(q - wave2) / 0.16);
    for (let n = 0; n < 64; n++) { const t = n / 64 * Math.PI * 2; pen.dot(x, B.cy + B.LR * Math.cos(t), B.LR * Math.sin(t), 0.03 + 0.018 * on, pen.ink, 0.16 + 0.45 * on); }
  }
  // Light flowing: patches through the encoder into their tokens, and tokens through the language model to its end.
  const count = Math.round(mix(234, 540, ease(clamp(r))) * 0.4);
  for (let n = 0; n < count; n++) {
    const q = (s * 0.36 + hash(n * 7.3)) % 1, u = hash(n * 3.1 + 0.7), v = mix(V0, V1, hash(n * 5.9 + 0.3));
    const pts = [bPlace(u, v), bInside(u, v, B.E0, B.ER0), bInside(u, v, B.E1, B.ER1), bToken(u, v)];
    const at = cubic(pts, q);
    const c = pen.ink;
    pen.dot(at[0], at[1], at[2], 0.036, c, 0.65 * Math.sin(Math.PI * q));
    // The same light on from its token through the language model, gathering to its axis.
    const q2 = (q + 0.5) % 1, from = bToken(u, v), into = bInside(u, v, B.L0, B.LR), x = mix(from[0], B.OUT, q2);
    const at2 = x < B.L0 ? mixV(from, into, clamp((x - from[0]) / Math.max(B.L0 - from[0], 1e-3))) : mixV(into, [B.OUT, B.cy, 0], ease(clamp((x - B.L0) / (B.OUT - B.L0))));
    pen.dot(at2[0], at2[1], at2[2], 0.03, c, 0.45 * Math.sin(Math.PI * q2));
  }
  // The question's path: the answer's patch, through the encoder to its token, the axis of the language model, the chosen column.
  // The question's way: from the answer's patch to its token, on along the language model at the token's height, then
  // down at 45° from the model's end to the letters' floor and along it to the letter chosen; the other letters branch
  // off the same run.
  const pick = pickAt(s), kt = bToken(KU, KV), end = [B.OUT, kt[1], 0], foot = (m: number) => [bBar(m)[0], B.BY - 0.04, 0];
  path(pen, [bPlace(KU, KV), kt, end, mixV(foot(2), foot(3), turn(s))], flow, s, 0.75, 0.22);
  for (let m = 0; m < 4; m++) if (m !== pick) pen.route([end, foot(m)], "data", { a: 0.16, bend: 0 });
  const k = bPlace(KU, KV), ring = 0.22 + 0.02 * Math.sin(s * 2.2);
  for (let n = 0; n < 32; n++) { const t = n / 32 * Math.PI * 2; pen.dot(k[0] + ring * Math.cos(t), k[1] + ring * Math.sin(t), 0.02, 0.028, flow, 0.95); }
  columns(pen, s, bBar, B.BH, flow);
}

const LABEL = "같은 표지판 사진을 512²와 768²로 넣은 4B 모델. 768²에서 16픽셀 조각이 촘촘해지고 사진 토큰이 234개에서 540개로 늘며, 글자 확률이 c 100m 49.1% · d 300m 49.1%에서 d 300m 99.98%로 바뀐다.";

export function VqaZoomLight({ src, fallback }: { src: string; fallback: ReactNode }) {
  return <LightFigure src={src} draw={drawB} shot={B_SHOT} tags={B_TAGS} label={LABEL} still={STILL} fallback={fallback} />;
}
