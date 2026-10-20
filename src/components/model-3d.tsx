"use client";

import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BLOOM_RADIUS, LIGHT_BLOOM, LIGHT_FALLOFF, LIGHT_RADIUS, RAMP, cloud, glowTexture, isDark, segments } from "@/lib/glow-3d";
import { AXIS_HI, AXIS_LO, CURSOR01, DUET, DUET_LOOP, DUET_STARTS, PIANO_GAIN, PIANO_PARTIALS, VOICE_GAIN, VOICE_HARMONICS, pianoAt, voiceAt } from "@/components/model-figures";

// The pitch model's step pictures drawn in the engine's 3D light (src/lib/glow-3d.ts): what the engine's stages draw
// sound with, the waterfall of waveforms, the curtain of the moment and the pitch distribution's bars of light, are
// drawn here the same way. Each picture is an example made from rules, not a recording.

export type V3 = [number, number, number];
export type Kit = { cloud: (count: number) => ReturnType<typeof cloud>; segments: typeof segments };
export type Made = { root: THREE.Group; update: (s: number) => void; dispose: () => void };
// How the camera looks at a picture: at `target`, turned `yaw` and looking down by `tilt`, standing back until every
// point of `bounds` is in the view. A box wider than the picture stretches it sideways, up to `stretch` times, so the
// picture fills the box instead of standing small in its middle.
// `orbit` turns the camera away from `yaw` and back, `amp` radians over `period` seconds, where turning shows the depth.
export type Shot = { target: V3; yaw: number; tilt: number; bounds: V3[]; fov?: number; bloom?: number; stretch?: number; orbit?: { amp: number; period: number } };
// A word over the picture, pinned to a point of it (or hidden where `at` gives none), as bright as `fade` says.
export type Tag = { text: ReactNode; at: (s: number) => V3 | null; fade?: (s: number) => number; align?: "start" | "end" | "center" | "above"; dim?: boolean; wide?: boolean; lane?: boolean };

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (q: number) => q * q * q * (q * (q * 6 - 15) + 10);
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const SHIFT = { start: "translate(6px, -50%)", end: "translate(calc(-100% - 6px), -50%)", center: "translate(-50%, -50%)", above: "translate(-50%, calc(-100% - 4px))", left: "translate(0, -50%)" };

// One picture: its own renderer, the engine's bloom and colour ramp, a camera that fits the picture to the box, and
// the words placed at their points every frame. `still` is the moment shown where motion is reduced (seconds).
export function GlowFigure({ make, shot, tags, label, still }: { make: (kit: Kit) => Made; shot: Shot; tags: Tag[]; label: string; still: number }) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), spans = useRef<(HTMLSpanElement | null)[]>([]);
  const words = useRef(tags);
  words.current = tags;
  useEffect(() => {
    const holder = box.current!, el = canvas.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true }); } catch { holder.dataset.flat = ""; return; }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(pixelRatio); renderer.setClearColor(new THREE.Color().setRGB(5 / 255, 5 / 255, 5 / 255, THREE.LinearSRGBColorSpace), 1);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(shot.fov ?? 24, 1, 0.1, 400);
    // Its own zoom and falloff, so the engine's figure on the same page keeps its own.
    const zoom = { value: 1 }, falloff = { value: 1 }, map = glowTexture();
    const made = make({ cloud: (count) => cloud(count, map, pixelRatio, { zoom, falloff }), segments });
    scene.add(made.root);
    const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, BLOOM_RADIUS, 0.2), output = new OutputPass(), ramp = new ShaderPass(RAMP);
    composer.setPixelRatio(pixelRatio); composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(output); composer.addPass(ramp);
    let dark = true;
    const theme = () => { dark = isDark(); ramp.uniforms.light.value = dark ? 0 : 1; bloom.radius = dark ? BLOOM_RADIUS : LIGHT_RADIUS; falloff.value = dark ? 1 : LIGHT_FALLOFF; };
    theme();
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const target = new THREE.Vector3(...shot.target), p = new THREE.Vector3();
    const look = new THREE.Vector3(Math.sin(shot.yaw) * Math.cos(shot.tilt), Math.sin(shot.tilt), Math.cos(shot.yaw) * Math.cos(shot.tilt));
    let size = "", distance = 20, wide = 1;
    // A point of the picture as it stands after the sideways stretch.
    const spot = (b: readonly number[]) => p.set(shot.target[0] + (b[0] - shot.target[0]) * wide, b[1], b[2]);
    const extent = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const b of shot.bounds) { spot(b).project(camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      return { x0, x1, y0, y1 };
    };
    // Stand back until the picture fits; where the box is wider than the picture, stretch it and stand back again; then
    // shift the view so the picture sits in the middle of the box.
    const fit = (w: number, h: number) => {
      camera.aspect = w / h; camera.clearViewOffset(); camera.updateProjectionMatrix();
      wide = 1;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 6; i++) {
          camera.position.copy(target).addScaledVector(look, distance); camera.lookAt(target); camera.updateMatrixWorld();
          let most = 0;
          for (const b of shot.bounds) { spot(b).project(camera); most = Math.max(most, Math.abs(p.x) / 0.97, Math.abs(p.y) / 0.95); }
          distance *= most;
        }
        camera.position.copy(target).addScaledVector(look, distance); camera.lookAt(target); camera.updateMatrixWorld();
        const e = extent(), across = (e.x1 - e.x0) / 1.94, up = (e.y1 - e.y0) / 1.9;
        if (pass || up <= across * 1.02) break;
        wide = clamp(up / across, 1, shot.stretch ?? 1);
      }
      made.root.scale.x = wide; made.root.position.x = shot.target[0] * (1 - wide);
      const e = extent();
      camera.setViewOffset(w, h, (e.x0 + e.x1) / 2 * w / 2, -(e.y0 + e.y1) / 2 * h / 2, w, h); camera.updateProjectionMatrix();
    };

    let raf = 0, started = -1;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!holder.offsetParent) return;
      if (started < 0) started = now;
      const w = holder.clientWidth, h = holder.clientHeight;
      if (!w || !h) return;
      if (`${w}x${h}` !== size) { size = `${w}x${h}`; renderer.setSize(w, h, false); composer.setSize(w, h); fit(w, h); }
      const s = reduced ? still : (now - started) / 1000;
      // A slow sway, so the picture reads as standing in depth.
      const sway = (reduced ? 0 : 0.035 * Math.sin(s * 0.21)) + (shot.orbit ? shot.orbit.amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * s / shot.orbit.period)) : 0);
      const turn = new THREE.Vector3(Math.sin(shot.yaw + sway) * Math.cos(shot.tilt), Math.sin(shot.tilt), Math.cos(shot.yaw + sway) * Math.cos(shot.tilt));
      camera.position.copy(target).addScaledVector(turn, distance); camera.lookAt(target); camera.updateMatrixWorld();
      // Point sizes were set for a card camera about 4.8 units away; they keep their size on screen at any distance.
      zoom.value = distance / 4.8 * clamp(w / 900, 0.7, 1.2);
      made.update(s);
      bloom.strength = (shot.bloom ?? 0.55) * (dark ? 1 : LIGHT_BLOOM);
      composer.render();
      words.current.forEach((tag, i) => {
        const span = spans.current[i];
        if (!span) return;
        const at = tag.at(s), fade = at ? (tag.fade?.(s) ?? 1) : 0;
        if (!at || fade <= 0.01) { span.style.opacity = "0"; return; }
        spot(at).project(camera);
        span.style.opacity = fade.toFixed(2);
        span.style.left = `${((p.x + 1) / 2 * w).toFixed(1)}px`; span.style.top = `${((1 - p.y) / 2 * h).toFixed(1)}px`;
      });
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); watch.disconnect(); made.dispose(); bloom.dispose(); output.dispose(); ramp.dispose(); composer.dispose(); map.dispose(); renderer.dispose(); };
  }, [make, shot, still]);

  return <div className="lf" ref={box}>
    <canvas ref={canvas} role="img" aria-label={label} />
    <div className="lf-tags">
      {tags.map((tag, i) => <span key={i} ref={(el) => { spans.current[i] = el; }} className={`lf-tag${tag.lane ? " lf-lane" : ""}`} data-dim={tag.dim ? "" : undefined} data-wide={tag.wide ? "" : undefined}
        style={{ opacity: 0, transform: SHIFT[tag.align ?? "left"] }}>{tag.text}</span>)}
    </div>
  </div>;
}

// ---- 01 Pitch only, not separation, in 3D ----------------------------------------------------------------------------
// The same picture as the flat one (src/components/model-figures.tsx, PitchOnly): above, the pipeline as it was, run on
// a recording; below, what was built, run live. Sound is the engine's first stage, a waterfall of waveforms: each line is
// the sound up to a moment, the newest in front and the older ones behind. The moment being computed is the engine's
// curtain of light. The distribution is the engine's third stage: one bar of light per pitch bin, the frame before
// behind it. On the floor in front of the sound, each model's reach in time spreads out from the curtain layer by layer,
// as the engine's no-future figure draws it: past the curtain is the future reference.
//
// Above, a recording: the sound stands still and the curtain runs across it; past the curtain the sound is lit, and both
// models use it (Mel-RoFormer the whole chunk, FCPE about 900ms). Below, live: the curtain stands still and the sound flows
// in to it, only 20ms past it, drawn wider so it can be seen. Between Mel-RoFormer and FCPE the vocal stem flows: the
// voice alone, a cleaner wave than the mix. Both rows give out the same moment and the same pitch, and the distribution
// above comes down an arc as what the CNN learns.

const LOOP_S = DUET_LOOP / 1000, START_S = CURSOR01.start / 1000;
// The waves' pitch is drawn slowed down, so a line holds a dozen turns: a note's frequency on screen is this many turns a
// second at A4, scaled by its pitch. Each part turns a whole number of times in one loop, so the loop has no seam.
const fv = (cents: number) => 2.9 * 2 ** ((cents - 6900) / 1200);
const whole = (f: number) => Math.max(1, Math.round(f * LOOP_S)) / LOOP_S;
const VOICE_TURNS = (() => {
  const raw = DUET.map((n) => fv(n.m * 100) * n.d / 1000), total = raw.reduce((a, b) => a + b, 0), k = Math.round(total) / total;
  let acc = 0;
  return { per: Math.round(total), k, at: raw.map((r) => { const a = acc; acc += r * k; return a; }) };
})();
function duetIndex(ms: number) {
  let i = 0;
  while (i < DUET.length - 1 && ms >= DUET_STARTS[i + 1]) i++;
  return i;
}
// The sound at a moment (seconds, unbroken across loops): the voice alone, or the voice with the piano.
export function wave(s: number, voiceOnly: boolean) {
  const loops = Math.floor(s / LOOP_S), ms = (s - loops * LOOP_S) * 1000, i = duetIndex(ms), v = voiceAt(ms);
  const turns = VOICE_TURNS.per * loops + VOICE_TURNS.at[i] + VOICE_TURNS.k * fv(DUET[i].m * 100) * (ms - DUET_STARTS[i]) / 1000;
  const ph = 2 * Math.PI * turns, voice = v.amp * (0.75 * Math.sin(ph) + 0.25 * Math.sin(2 * ph));
  if (voiceOnly) return 0.9 * voice;
  const piano = pianoAt(ms);
  const chord = piano.chord.reduce((sum, m, j) => sum + Math.sin(2 * Math.PI * whole(fv(m * 100)) * s + j * 1.7), 0) / piano.chord.length;
  return 0.72 * voice + 0.42 * piano.ring * chord;
}
// The piano alone, as the engine plays it: what the reference carries (03).
export function pianoWave(s: number) {
  const loops = Math.floor(s / LOOP_S), ms = (s - loops * LOOP_S) * 1000, piano = pianoAt(ms);
  return 0.8 * piano.ring * piano.chord.reduce((sum, m, j) => sum + Math.sin(2 * Math.PI * whole(fv(m * 100)) * s + j * 1.7), 0) / piano.chord.length;
}
export const voiceNear = (ms: number, c: number, width: number) => {
  const v = voiceAt(ms);
  return VOICE_HARMONICS.reduce((s, dc, i) => Math.max(s, VOICE_GAIN[i] * Math.exp(-(((v.cents + dc - c) / width) ** 2))), 0);
};
export const pianoNear = (ms: number, c: number, width: number) => {
  const p = pianoAt(ms);
  return p.chord.reduce((s, m) => PIANO_PARTIALS.reduce((r, dc, i) => Math.max(r, PIANO_GAIN[i] * p.ring * Math.exp(-(((m * 100 + dc - c) / width) ** 2))), s), 0);
};
const loopMs = (s: number) => ((s * 1000 % DUET_LOOP) + DUET_LOOP) % DUET_LOOP;

// Where things stand, in world units. Time runs left to right at PACE units a second; the recording above is one turn of
// the loop long, so its curtain runs round it without a break and always stands on the moment of the row below.
// Below, the live sound runs on as far as the CNN, which stands under FCPE, right before the distribution.
const PACE = 1.1, X0 = 0.4, X1 = X0 + LOOP_S * PACE, NOW = 5.9, STUB = 0.16;
const ROWS = [{ y: 1.8 }, { y: -1.8 }] as const;
type Row = (typeof ROWS)[number];
// The lines go back and a little to the right, as the engine's waterfall is seen from its side.
const AMP = 0.36, LINES = 10, DZ = 0.13, SKEW = 0.05, DT = 0.06, BACK = -(LINES - 1) * DZ;
// The waterfall as 01 draws it, for the other steps that draw sound (src/components/model-3d-steps.tsx).
export const WATERFALL = { amp: AMP, lines: LINES, dz: DZ, skew: SKEW, dt: DT, pace: PACE };
const FLOOR = -0.86, FAN_Z = 0.26, FAN_FRONT = 1.3;
const COL = { roformer: [4.82, 5.72] as const, stem: [5.84, 6.42] as const, fcpe: [6.54, 7.34] as const, cnn: [6.52, 7.47] as const, bars: [7.6, 9.3] as const };
// The bars cover MIDI 56 to 84, drawn every 50 cents so each bar stands apart; the voice sings 67 to 71.
const BIN_LO = 5600, BIN_HI = 8400, BIN = 50, BINS = (BIN_HI - BIN_LO) / BIN + 1, BAR_H = 1.5;
const FCPE_LAYERS = 6, CNN_LAYERS = 13;
const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
const pitchY = (row: Row, c: number) => row.y + ((c - AXIS_LO) / (AXIS_HI - AXIS_LO) - 0.5) * 1.5;
const barX = (c: number, at: readonly [number, number]) => at[0] + (at[1] - at[0]) * (c - BIN_LO) / (BIN_HI - BIN_LO);
const barBase = (row: Row) => row.y - 0.72;
// The curtain above: where it stands at a moment, and how far into its fade at the two ends of the recording.
function curtain(s: number) {
  const q = (((s - START_S) % LOOP_S) + LOOP_S) % LOOP_S / LOOP_S;
  return { x: X0 + q * (X1 - X0), on: ease(clamp(q / 0.03)) * ease(clamp((1 - q) / 0.03)) };
}
const OLD = 0.74, NEW = 1;
// From the distribution above, round its right side, down into the distribution below.
function answerArc() {
  const a: V3 = [COL.bars[1] + 0.06, barBase(ROWS[0]) + 0.1, 0], b: V3 = [COL.bars[1] + 0.06, barBase(ROWS[1]) + BAR_H * 0.72, 0], c: V3 = [COL.bars[1] + 0.95, (a[1] + b[1]) / 2, 0];
  return (q: number): V3 => [0, 1, 2].map((i) => (1 - q) ** 2 * a[i] + 2 * q * (1 - q) * c[i] + q * q * b[i]) as V3;
}

// The CNN as every picture draws it (01 · 02 · 03 · 06): the engine's CNN symbol (src/components/showcase-parts.tsx,
// CnnGlyph) in this screen's light. Four layers stand left to right, each shorter and brighter than the one before, a
// sheet of faint points in a frame of light; the channels behind each are the frames stacked behind it, as 03's walls
// show theirs. A kernel of light scans the first layer, moving as the engine's does, and its corners draw together onto
// the next; the short bar at the right is what comes out. Frames and hatching are lines, so the symbol holds in the light
// theme too. It stands `w` wide from `xa`, centred on `yc`, and gives back where the sound goes in and the output leaves.
export type LineFn = (a: V3, b: V3, ca: number, cb?: number) => void;
export type PutFn = (x: number, y: number, z: number, size: number, a: number) => void;
export const CNN_ASPECT = 1.15;
export function cnnStack(line: LineFn, put: PutFn, xa: number, w: number, yc: number, k: number, s: number) {
  // The glyph's own coordinates (96 × 46, drawn from 4 to 88 across and 4 to 42 down) placed on the picture.
  const h = w * CNN_ASPECT, gx = (x: number) => xa + (x - 4) / 84 * w, gy = (y: number) => yc + (23 - y) / 38 * h;
  const at = (x: number, y: number, z = 0): V3 => [gx(x), gy(y), z];
  const layer = (x0: number, x1: number, y0: number, y1: number, c: number) => {
    // The channels behind: each frame up and to the right of the one before it, only its top and right edges showing.
    for (let j = 3; j >= 1; j--) {
      const dx = j * 0.018 * w, dy = j * 0.035 * w, z = -j * 0.07, a = (0.5 - 0.11 * j) * c;
      const [l, t] = [gx(x0) + dx, gy(y0) + dy], [r, b] = [gx(x1) + dx, gy(y1) + dy];
      line([l, t, z], [r, t, z], a); line([r, t, z], [r, b, z], a);
    }
    // The front: a sheet of faint points in its frame.
    const cols = Math.max(2, Math.round((gx(x1) - gx(x0)) / 0.055)), rows = Math.max(4, Math.round((gy(y0) - gy(y1)) / 0.055));
    for (let r = 1; r < rows; r++) for (let j = 1; j < cols; j++) put(...at(x0 + (x1 - x0) * j / cols, y0 + (y1 - y0) * r / rows), 2.6, 0.12 * c);
    line(at(x0, y0), at(x1, y0), c); line(at(x1, y0), at(x1, y1), c); line(at(x1, y1), at(x0, y1), c); line(at(x0, y1), at(x0, y0), c);
  };
  for (let i = 0; i < 4; i++) layer(4 + i * 18, 18 + i * 18, 4 + i * 4, 42 - i * 4, (0.45 + 0.15 * i) * k);
  // The output: a short bar of light, hatched.
  for (let j = 0; j <= 3; j++) { const x = 84 + 4 * j / 3; line(at(x, 18), at(x, 28), 0.95 * k); for (let r = 0; r <= 4; r++) put(...at(x, 18 + 10 * r / 4), 3.6, 0.6 * k); }
  put(...at(86, 23), 16, 0.22 * k);
  // The kernel, moving as the engine's does (globals.css, cnn-scan): 2.4s each way, there and back, from the top left
  // down to the bottom and up to the top right of the first layer, eased within each half. Its corners meet on the next.
  const u = (s / 2.4) % 2, q = u < 1 ? u : 2 - u, e = (v: number) => v * v * (3 - 2 * v);
  const kx = 4 + (q < 0.5 ? 4 * e(q * 2) : 4 + 3 * e(q * 2 - 1)), ky = 4 + (q < 0.5 ? 27 * e(q * 2) : 27 * (1 - e(q * 2 - 1)));
  for (let r = 0; r <= 4; r++) {
    line(at(kx, ky + 7 * r / 4, 0.01), at(kx + 7, ky + 7 * r / 4, 0.01), 0.9 * k);
    for (let j = 0; j <= 4; j++) put(...at(kx + 7 * j / 4, ky + 7 * r / 4, 0.01), 3.6, 0.65 * k);
  }
  put(...at(kx + 3.5, ky + 3.5, 0.01), 14, 0.25 * k);
  const meet = at(22 + (kx + 3.5 - 4), 8 + (ky + 3.5 - 4) * 30 / 38, 0.01);
  for (const [cx, cy] of [[kx, ky], [kx + 7, ky], [kx, ky + 7], [kx + 7, ky + 7]]) line(at(cx, cy, 0.01), meet, 0.5 * k, 0.15 * k);
  put(...meet, 6, 0.6 * k);
  return { input: at(4, 23), foot: at(11, 42), out: at(88, 23), top: gy(4) };
}

function pitchOnly3D(kit: Kit): Made {
  const root = new THREE.Group();
  const lines = kit.segments(9000), light = kit.cloud(12000);
  root.add(lines.object, light.object);
  let seg = 0, dot = 0;
  const line = (a: V3, b: V3, ca: number, cb = ca) => { if (seg < 9000) lines.set(seg++, a, b, ca, cb); };
  const put = (x: number, y: number, z: number, size: number, a: number) => { if (dot < 12000 && a > 0.002) light.set(dot++, x, y, z, size, a); };

  // The waterfall: `clock(x, k)` is the moment of sound at x on the k-th line back; `lit(x)` brightens the future
  // reference. Sparks ride the front line, as on the engine's.
  const waterfall = (row: Row, xa: number, xb: number, clock: (x: number, k: number) => number, voiceOnly: boolean, gain: number, lit: (x: number) => number, depth = LINES, scale = AMP) => {
    const n = Math.max(8, Math.ceil((xb - xa) / 0.018));
    for (let k = 0; k < depth; k++) {
      const z = -k * DZ, dx = k * SKEW, fade = k ? (1 - k / depth) ** 2.2 * 0.3 * gain : 0.72 * gain;
      let prev: V3 | null = null;
      for (let i = 0; i <= n; i++) {
        const x = xa + (xb - xa) * i / n, v = wave(clock(x, k), voiceOnly), edge = ease(clamp((x - xa) / 0.12)) * ease(clamp((xb - x) / 0.05));
        const at: V3 = [x + dx, row.y + v * scale, z], c = Math.min(1, fade * edge * lit(x));
        if (prev) line(prev, at, c);
        if (k === 0) put(x, at[1], z, 2 + 8 * Math.abs(v), gain * edge * lit(x) * (0.16 + 0.55 * Math.abs(v)));
        prev = at;
      }
    }
  };
  // The engine's curtain: a sheet of faint points standing across the sound at the moment being computed, its edges
  // drawn, and its foot running on over the floor to the reach.
  const curtainAt = (row: Row, x: number, k: number) => {
    const y0 = row.y - AMP * 1.45, y1 = row.y + AMP * 1.8, z0 = BACK - 0.05, z1 = 0.12, xb = x - z0 / DZ * SKEW;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) { const q = c / 11; put(xb + (x - xb) * q, y0 + (y1 - y0) * r / 9, z0 + (z1 - z0) * q, 3.4, (0.08 + 0.09 * q) * k); }
    line([x, y0, z1], [x, y1, z1], 0.9 * k); line([xb, y0, z0], [x, y0, z1], 0.4 * k);
    line([x, y0, z1], [x, row.y + FLOOR, FAN_Z], 0.35 * k);
  };
  // A model's reach on the floor: one row of points per layer, from the frame given out (at the curtain, nearest the
  // sound) out to the frames it reads; past the curtain they are bright. `rows` 0 is one row for the whole chunk.
  const reach = (row: Row, x: number, z0: number, z1: number, rows: number, of: (j: number) => { back: number; ahead: number }, limit: readonly [number, number], k: number) => {
    const y = row.y + FLOOR;
    for (let j = 0; j <= rows; j++) {
      const z = rows ? z0 + (z1 - z0) * j / rows : z0, r = of(rows ? j : 1), from = Math.max(limit[0], x - r.back * PACE / 1000), to = Math.min(limit[1], x + r.ahead * PACE / 1000);
      const step = 0.042, open = (v: number) => ease(clamp((v - limit[0]) / 0.25)) * ease(clamp((limit[1] - v) / 0.25));
      for (let v = x - Math.floor((x - from) / step) * step; v <= to + 1e-6; v += step) {
        const ahead = v > x + 0.004;
        put(v, y, z, ahead ? 4.6 : 3.4, (ahead ? 0.55 : 0.2) * open(v) * k);
      }
    }
    put(x, y, z0, 7, 0.7 * k);
  };
  // The engine's pitch distribution: a bar of light for each bin, as tall as it is likely, the frame before standing
  // behind it. The voice's vibrato sways its peak.
  const bars = (row: Row, ms: number, k: number, at: readonly [number, number]) => {
    const y = barBase(row);
    [[ms - 20, -0.22, 0.3], [ms, 0, 1]].forEach(([when, z, g]) => {
      const v = voiceAt(((when % DUET_LOOP) + DUET_LOOP) % DUET_LOOP), flicker = Math.floor(when / 80);
      for (let b = 0; b < BINS; b++) {
        const c = BIN_LO + b * BIN, x = barX(c, at), dc = c - v.cents;
        const p = v.amp * (0.8 * Math.exp(-(dc * dc) / (2 * 70 * 70)) + 0.14 * Math.exp(-(dc * dc) / (2 * 260 * 260))) + 0.012 * hash(b * 7.1 + flicker * 0.37);
        line([x, y, z], [x, y + p * BAR_H, z], 0.03 * g * k, (0.1 + 0.9 * p) * g * k);
        put(x, y + p * BAR_H, z, 1.4 + 13 * p, g * k * (0.08 + 0.8 * p));
      }
    });
    line([at[0], y, 0.06], [at[1], y, 0.06], 0.2 * k);
  };
  const peakOf = (row: Row, ms: number, at: readonly [number, number]): V3 => { const v = voiceAt(ms); return [barX(v.cents, at), barBase(row) + 0.94 * v.amp * BAR_H, 0]; };
  // A curve drawn as a line of light, points spaced by length.
  const strand = (at: (q: number) => V3, glow: (q: number) => number, size: number, gap = 0.022, steps = 120) => {
    let [px, py, pz] = at(0), run = gap;
    for (let i = 0; i <= steps; i++) {
      const q = i / steps, [x, y, z] = at(q);
      run += Math.hypot(x - px, y - py, z - pz); px = x; py = y; pz = z;
      if (run < gap) continue;
      run = 0; put(x, y, z, size, glow(q));
    }
  };
  // Light carried from a model to the peak of its distribution.
  const beam = (from: V3, to: V3, k: number, s: number) => {
    const mid: V3 = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.12, 0];
    const at = (q: number): V3 => [0, 1, 2].map((i) => (1 - q) ** 2 * from[i] + 2 * q * (1 - q) * mid[i] + q * q * to[i]) as V3;
    strand(at, (q) => (0.18 + 0.5 * Math.exp(-(((q - (s / 1.1) % 1) / 0.08) ** 2))) * ease(clamp(q / 0.08)) * k, 3, 0.03);
  };

  // Mel-RoFormer: the spectrum cut into bands, a token each, joined by attention. A nest of half-rings of one shape,
  // each joining two tokens and leaning back into the depth: those between the voice's harmonics glow, and one token at
  // a time, sweeping up the column, reaches out to all the others.
  const roformer = (row: Row, xa: number, xb: number, k: number, ms: number, s: number) => {
    const N = 11, band = (AXIS_HI - AXIS_LO) / N, ny = (i: number) => pitchY(row, AXIS_LO + (i + 0.5) * band), nx = xa + 0.06, reachX = (xb - xa) * 0.86 / (N - 1), lean = 0.6;
    const voice = Array.from({ length: N }, (_, i) => voiceNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.55));
    const piano = Array.from({ length: N }, (_, i) => pianoNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.55));
    const flow = (s / 1.6) % 1, query = (s / 3.2) % 1 * (N + 2) - 1;
    const ring = (i: number, j: number, glow: number) => {
      const y0 = ny(i), y1 = ny(j), cy = (y0 + y1) / 2, ry = Math.abs(y1 - y0) / 2, rx = reachX * Math.abs(j - i);
      strand((q) => { const th = -Math.PI / 2 + Math.PI * q, out = rx * Math.cos(th); return [nx + out * Math.cos(lean), cy + ry * Math.sin(th) * Math.sign(y1 - y0), -out * Math.sin(lean)]; },
        (q) => glow * (0.8 + 1.0 * Math.exp(-((((q - flow + 1) % 1 - 0.5) * 5) ** 2))), 3, 0.02, 90);
    };
    for (let i = 0; i < N - 1; i++) ring(i, i + 1, 0.16 * k);
    for (let i = 0; i < N; i++) for (let j = i + 2; j < N; j++) {
      const both = Math.sqrt(voice[i] * voice[j]), asked = Math.exp(-((i - query) ** 2) / 0.5) + Math.exp(-((j - query) ** 2) / 0.5);
      const g = 0.4 * both + 0.12 * asked * (0.4 + voice[i] + voice[j]);
      if (g > 0.02) ring(i, j, g * k);
    }
    for (let i = 0; i < N; i++) put(nx, ny(i), 0, 5 + 3 * voice[i], (0.2 + 0.6 * voice[i] + 0.15 * piano[i] + 0.3 * Math.exp(-((i - query) ** 2) / 0.5)) * k);
  };
  // FCPE: the stem's spectrum as channels running side by side like strings, held at both ends and swaying a little,
  // fanned a little in depth; each of its six layers mixes all of them at once, a band of light across every string
  // passing from front to back. The strings that carry the voice's harmonics are lit.
  const fcpe = (row: Row, xa: number, xb: number, k: number, ms: number, s: number) => {
    const L = 8, band = (AXIS_HI - AXIS_LO) / L, work = (s / 1.4) % 1 * (FCPE_LAYERS + 2) - 1, layerX = (l: number) => xa + (xb - xa) * (l + 0.5) / FCPE_LAYERS;
    const glow = (l: number) => Math.exp(-((l - work) ** 2) / 0.5);
    const passing = (x: number) => { let v = 0; for (let l = 0; l < FCPE_LAYERS; l++) v = Math.max(v, glow(l) * Math.exp(-(((x - layerX(l)) / (0.07 * (xb - xa))) ** 2))); return v; };
    for (let i = 0; i < L; i++) {
      const ly = pitchY(row, AXIS_LO + (i + 0.5) * band), e = voiceNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.6), z = (i - (L - 1) / 2) * -0.035, sway = 0.012 * (0.6 + 0.9 * e);
      strand((q) => [xa + (xb - xa) * q, ly + sway * Math.sin(2 * Math.PI * (1.5 * q - s / 1.8) + i * 0.9) * Math.sin(Math.PI * q), z],
        (q) => (0.16 + 0.5 * e + 0.35 * passing(xa + (xb - xa) * q)) * k, 2.8 + 1.4 * e, 0.018, 100);
    }
    for (let l = 0; l < FCPE_LAYERS; l++) for (let r = 0; r <= 16; r++) put(layerX(l), pitchY(row, AXIS_LO + (AXIS_HI - AXIS_LO) * r / 16), 0, 2.8, (0.08 + 0.3 * glow(l)) * k);
  };
  // The CNN, as every picture draws it (cnnStack above).
  const cnn = (row: Row, k: number, s: number) => cnnStack(line, put, COL.cnn[0], COL.cnn[1] - COL.cnn[0], row.y, k, s);

  return {
    root,
    dispose: () => { lines.dispose(); light.dispose(); },
    update: (s) => {
      seg = 0; dot = 0;
      const [top, bottom] = ROWS, c = curtain(s), ms = loopMs(s);
      // Above: the recording stands still; the curtain runs across it, and the sound past it is lit.
      const recorded = (x: number, k: number) => START_S + (x - X0) / PACE - k * DT;
      const past = (at: number) => (x: number) => 1 + 0.7 * ease(clamp((x - at) / 0.05));
      waterfall(top, X0, X1, recorded, false, OLD, past(c.x));
      if (c.on > 0.01) {
        curtainAt(top, c.x, OLD * c.on);
        reach(top, c.x, FAN_Z, FAN_Z, 0, () => ({ back: Infinity, ahead: Infinity }), [X0, X1], OLD * c.on);
        reach(top, c.x, FAN_Z + 0.16, FAN_FRONT, FCPE_LAYERS, (j) => ({ back: 150 * j, ahead: 150 * j }), [X0, X1], OLD * c.on);
      }
      roformer(top, COL.roformer[0], COL.roformer[1], OLD, ms, s);
      // The vocal stem flows out of Mel-RoFormer into FCPE: what reaches FCPE is the moment it computes.
      waterfall(top, COL.stem[0], COL.stem[1], (x, k) => s - (x - COL.stem[1]) / PACE - k * DT, true, OLD, () => 1, 6, AMP * 0.8);
      fcpe(top, COL.fcpe[0], COL.fcpe[1], OLD, ms, s);
      beam([COL.fcpe[1] + 0.02, pitchY(top, voiceAt(ms).cents), 0], peakOf(top, ms, COL.bars), OLD, s);
      bars(top, ms, OLD, COL.bars);

      // Below: live. The curtain stands still and the sound flows in to it, only 20ms past it, and nothing after.
      const live = (x: number, k: number) => s + (x - NOW) / PACE - k * DT;
      waterfall(bottom, X0, NOW + STUB, live, false, NEW, past(NOW));
      curtainAt(bottom, NOW, NEW);
      reach(bottom, NOW, FAN_Z, FAN_FRONT, CNN_LAYERS, (j) => ({ back: 20 * Math.min(j, CNN_LAYERS - 1), ahead: j >= CNN_LAYERS ? STUB / PACE * 1000 : 0 }), [X0, NOW + STUB], NEW);
      for (let x = NOW + STUB + 0.08; x <= COL.cnn[0] - 0.05; x += 0.07) put(x, bottom.y + FLOOR, FAN_FRONT, 3, 0.12);
      const net = cnn(bottom, NEW, s);
      beam([net.out[0] + 0.02, net.out[1], net.out[2]], peakOf(bottom, ms, COL.bars), NEW, s);
      bars(bottom, ms, NEW, COL.bars);

      // The training answer: an arc from the distribution above down and back to the one below, its head there.
      const answer = answerArc(), end = answer(1), before = answer(0.97), dx = end[0] - before[0], dy = end[1] - before[1], n = Math.hypot(dx, dy);
      strand(answer, (q) => 0.16 + 0.5 * Math.exp(-(((q - (s / 2.2) % 1) * 9) ** 2)), 3.6, 0.09, 120);
      for (const side of [-1, 1]) put(end[0] - 0.09 * dx / n + side * 0.06 * dy / n, end[1] - 0.09 * dy / n - side * 0.06 * dx / n, 0, 3.6, 0.5);
      put(end[0], end[1], 0, 3.6, 0.5);

      lines.clear(seg); light.hide(dot);
      lines.commit(); light.commit();
    },
  };
}

const SHOT01: Shot = {
  target: [4.9, 0, 0], yaw: -0.1, tilt: 0.46, bloom: 0.36, stretch: 2.2,
  bounds: [[X0 - 0.1, ROWS[0].y + 1.3, 0], [COL.bars[1] + 0.95, ROWS[0].y + 1.3, 0], [X0 - 0.1, ROWS[1].y + FLOOR - 0.1, FAN_FRONT + 0.15], [COL.bars[1] + 0.95, ROWS[1].y + FLOOR, FAN_FRONT], [X0 + LINES * SKEW, ROWS[0].y + 0.8, BACK], [COL.bars[1], ROWS[0].y + 0.85, -0.3]],
};
const top = ROWS[0], bottom = ROWS[1];
const TAGS01: Tag[] = [
  { text: <><b>원래 파이프라인</b><span className="lf-sub">학습 정답 생성</span></>, at: () => [X0 - 0.1, top.y + 1.15, 0], dim: true },
  { text: <><b>우리가 만든 것</b><span className="lf-sub">휴대폰에서 실행</span></>, at: () => [X0 - 0.1, bottom.y + 1.15, 0] },
  { text: <b>Mel-RoFormer</b>, at: () => [mid(COL.roformer), top.y + 0.82, 0], align: "above", dim: true },
  { text: "보컬 스템", at: () => [mid(COL.stem), top.y + 0.5, 0], align: "above", dim: true, wide: true },
  { text: <b>FCPE</b>, at: () => [mid(COL.fcpe), top.y + 0.82, 0], align: "above", dim: true },
  { text: <b>CNN</b>, at: () => [mid(COL.cnn), bottom.y + (COL.cnn[1] - COL.cnn[0]) * CNN_ASPECT / 2 + 0.14, 0], align: "above" },
  { text: "음높이 분포", at: () => [mid(COL.bars), barBase(top) - 0.2, 0.06], align: "center", dim: true },
  { text: "음높이 분포", at: () => [mid(COL.bars), barBase(bottom) - 0.2, 0.06], align: "center" },
  { text: "섞인 소리", at: () => [X0, top.y - AMP * 1.6, 0.05], dim: true, wide: true, fade: (s) => clamp((curtain(s).x - X0 - 0.9) / 0.2) },
  { text: "섞인 소리", at: () => [X0, bottom.y - AMP * 1.6, 0.05] },
  { text: "계산하는 프레임", at: (s) => [curtain(s).x, top.y + AMP * 1.85, 0.12], align: "above", fade: (s) => curtain(s).on, wide: true },
  { text: "계산하는 프레임", at: () => [NOW, bottom.y + AMP * 1.85, 0.12], align: "above" },
  { text: <b>미래 참조</b>, at: (s) => [curtain(s).x + 0.04, top.y + FLOOR, FAN_FRONT + 0.12], align: "start", fade: (s) => curtain(s).on * clamp((X1 - curtain(s).x) / 0.4) },
  { text: <><b>Mel-RoFormer</b>구간 전체</>, at: () => [X1 + 0.02, top.y + FLOOR, FAN_Z], align: "start", dim: true, wide: true },
  { text: <><b>FCPE</b>약 900ms</>, at: (s) => [Math.min(X1, curtain(s).x + 0.9 * PACE) + 0.02, top.y + FLOOR, FAN_FRONT], align: "start", dim: true, wide: true, fade: (s) => curtain(s).on * clamp((X1 - curtain(s).x) / 0.3) },
  { text: <><b>미래 참조</b>20ms</>, at: () => [NOW + STUB, bottom.y + FLOOR, FAN_FRONT + 0.12], align: "start" },
  { text: <b>CNN</b>, at: () => [NOW - 0.24 * PACE - 0.03, bottom.y + FLOOR, FAN_FRONT], align: "end", lane: true, wide: true },
  { text: "아직 없음", at: () => [COL.cnn[0] - 0.05, bottom.y + FLOOR, FAN_FRONT - 0.18], align: "end", dim: true, wide: true },
  { text: "학습 정답", at: () => answerArc()(0.5), align: "end" },
];

export function PitchOnly3D() {
  return <GlowFigure make={pitchOnly3D} shot={SHOT01} tags={TAGS01} still={2.6}
    label="위는 원래 파이프라인으로, 녹음에서 학습 정답을 만든다. 섞인 소리에서 Mel-RoFormer가 피아노를 걸러 보컬 스템을 만들고, 그 보컬을 FCPE가 읽어 음높이 분포를 낸다. 아래는 우리가 만든 것으로, 휴대폰에서 실시간으로 같은 섞인 소리를 CNN 하나가 바로 같은 음높이 분포로 바꾼다. 소리는 파형의 폭포로, 앞줄이 가장 최근이다. 위는 녹음이라 소리는 멈춰 있고 계산하는 프레임이 빛의 막으로 그 위를 지나가며, 아래는 실시간이라 막은 서 있고 소리가 흘러 들어온다. 두 막은 늘 같은 순간에 있다. 위는 막 뒤에도 소리가 이어지고, 두 모델이 그 뒤의 소리까지 쓴다: Mel-RoFormer는 구간 전체, FCPE는 층마다 앞뒤로 넓어져 약 900ms를 미래 참조한다. 아래는 그 프레임 뒤 20ms까지만 소리가 들어와 있고, 그 뒤는 아직 없다. CNN은 층마다 과거 쪽으로 넓어지고, 입력에 가장 가까운 층만 20ms를 미래 참조한다. CNN은 층을 거칠수록 작아지는 판 넷으로, 첫 판을 커널이 훑는다. 위의 분포가 바깥쪽 호를 따라 내려와 CNN이 배우는 학습 정답이 된다." />;
}
