"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { ModelAnatomy } from "@/components/vqa-anatomy";

// Where each step of the VQA contest changed the team's model, drawn in dots and ink in a shallow 3D that turns slowly;
// what the step changed glows. A step is two panels of one frame side by side, before and after, as papers show a
// change. In a panel the original photo lies at the bottom with its 16-pixel patches over it as dots in their real
// colours; the image encoder's layers are thin rings, its tokens dots, and every token feeds the place where the
// answer is read; the letters' chances (or votes) stand above as bars floating in the scene.
// - 사진 확대: the same sign cut at 512² and at 768², with the chances each run gave.
// - OCR 추가: the same sign at 512², without and with the eleven lines the OCR model read on it: all their boxes on the
//   photo lit alike, rising together into one block of words before the input, the question's three among eight that
//   have nothing to do with it; what both panels share is drawn quieter. The chances barely move, the wrong letter
//   still first.
// - 모델 크기: no photo. The models stand on an axis linear in parameters, each a lit point at what it got right
//   untrained of 400 questions, from zero; the log curve fitted through the three runs dashed to 122B, where only a
//   hollow ring stands and no number. Past 32B the floor darkens into the zone the contest's Colab could not run or pay
//   for. Beside 32B, in one row, the 17 questions it still missed after training: of the 12 whose photos were checked,
//   one model error, eleven label or question problems.
// - 앙상블 (the lead's judgment, reversed on the next step): a test photo; three models, then the four added on the
//   questions they split on, each casting one vote, a vote one brick of its letter's bar; the door sign's words boxed.
// - BF16 · 순서 섞기: how the frozen weights were held while LoRA learned — 4-bit NF4 (the 4B, 8B and 32B runs) beside
//   BF16 (the two 27B runs). The LoRA pair is the same on both sides; one row of W drawn large shows the 4-bit values
//   stepping through the 16 levels of their block, where BF16 keeps them. Under each, the choices: in a fixed order, or
//   in one of the 24 orders each time (letters stay, words move, the answer's letter with them).
// - 불확실 문항: a test photo; the three trained models' log-probability mean as bars (d and b nearly level) and each
//   model's own answer as a node (d · d · b). Only such questions were scored again, enlarged and in the four turns of
//   the choices — each bar travels with its word under the fixed letters — and this one turned to b. The clock boxed.
// The camera fits each step's picture to its box, so it is as large as the box allows at any size.
// Facts: the contest repo, exp/manu — C0_SPEC.json (Qwen3-VL-4B, NF4, LoRA r 16, max 512² pixels); for the sign
// (train_3696) the runs C0 c0_tune, V1_tune (768²) and O1_tune (OCR): 234 and 540 image tokens, the chances below; the
// model-scale runs S4-Z · S8-Z · S32-Z (338 · 351 · 368 of 400); the 2026-09-23 handoff (17 questions training did not
// fix, 12 photos checked: model error 1, label error 2, label doubtful 2, several answers 5, ambiguous 2); the
// 2026-09-24 handoff (the 27B runs in BF16, choices in one of 24 orders per question and epoch); the submission's
// rebuild for test_1785 (votes a b a, then a b b a a b b) and test_2233 (d d b, again b). Private notes: IMPL_NOTES.

export type ModelStage = "zoom" | "ocr" | "size" | "vote" | "bits" | "cascade";
// `box`: where the photo itself shows what the question asks (left, top, right, bottom as fractions), boxed on it.
export type PhotoSpec = { src: string; size: [number, number]; band: [number, number]; key: [number, number]; box?: [number, number, number, number] };
let lastStage: ModelStage = "zoom";

// A panel: the photo's band laid flat (twice as wide as deep), its patches as cols × rows dots.
const PW = 4.2, PD = 2.1, FRONT = 1.85, PX = 2.6;
// Marks on the photo itself (its boxes) lie just above it, under the patches, so they sit on the words they box.
const ON_PHOTO = 0.02;
const G26 = [26, 14], G40 = [40, 20], G52 = [52, 28];
const LETTERS = ["a", "b", "c", "d"];
const WORDS: Record<ModelStage, { words: string[]; gold?: number }> = {
  zoom: { words: ["500m", "1km", "100m", "300m"], gold: 3 },
  ocr: { words: ["500m", "1km", "100m", "300m"], gold: 3 },
  bits: { words: ["500m", "1km", "100m", "300m"], gold: 3 },
  vote: { words: ["흡연금지", "출입금지", "휴대폰 사용금지", "음식물 반입금지"] },
  cascade: { words: ["밤 8시 10분", "밤 10시 10분", "밤 7시 10분", "밤 9시 10분"] },
  size: { words: [] },
};
// The letters' chances the 4B model gave the sign: at 512² it chose c on a tie, at 768² d; at 512² with the OCR lines
// in the prompt c went up a little.
const P512 = [0.0168, 0.0007, 0.4912, 0.4912], P768 = [0.00016, 0.00004, 0.00004, 0.99976], POCR = [0.0066, 0.0009, 0.5272, 0.4653];
// The clock (test_2233): the three trained models' log-probability mean as the submission's rebuild computes it, shown as
// its normalised geometric mean — first d and b 0.105 apart in log (under the 2.0 that picks a question for re-scoring),
// then, re-scored larger and in the four orders, b. The models' own answers were d (Qwen3.5), d (Qwen3.8), b (Gemma 4).
const CLOCK_BASE = [0.1929, 0.3578, 0.0517, 0.3976], CLOCK_AGAIN = [0.2837, 0.4032, 0.0779, 0.2353];
const percent = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(1)}%`);
// The sixteen values of 4-bit NF4 (bitsandbytes), within a block scaled to its largest weight.
const NF4 = [-1, -0.6962, -0.5251, -0.3949, -0.2844, -0.1848, -0.0911, 0, 0.0796, 0.1609, 0.2461, 0.3379, 0.4407, 0.5626, 0.723, 1];
// What the OCR model read on the sign's photo (left, top, right, bottom as fractions of the photo), the answer's three lines marked.
const OCR: { text: string; box: number[]; key?: boolean }[] = [
  { text: "H", box: [0.5708, 0.4427, 0.6417, 0.4906] }, { text: "수봉은사로", box: [0.2333, 0.5063, 0.3139, 0.5313] },
  { text: "·선릉역", box: [0.3375, 0.5063, 0.3958, 0.5292] }, { text: "강남세브란스병원", box: [0.4111, 0.5052, 0.4819, 0.5281] },
  { text: "주정차금지", box: [0.65, 0.4938, 0.7653, 0.524] }, { text: "언주로", box: [0.3208, 0.5406, 0.4014, 0.5708], key: true },
  { text: "Eonju-ro", box: [0.3306, 0.5719, 0.3917, 0.5875], key: true }, { text: "300m", box: [0.3347, 0.5958, 0.3861, 0.6115], key: true },
  { text: "견인지역", box: [0.6431, 0.5854, 0.775, 0.6156] }, { text: "341", box: [0.7986, 0.7802, 0.8458, 0.8063] }, { text: "R0", box: [0.7556, 0.8458, 0.8167, 0.8615] },
];

// Where the OCR lines gather before the input, in front of the panel (from its centre): all eleven rise off the sign
// together and stand there as one block of words, the eight that have nothing to do with the question among them.
const OCR_AT = { dx: 0.15, y: 2.2, z: FRONT + 0.3 };

// A panel's chances: probabilities (p), or one vote per model (votes, the letter each cast; from index `added` on the
// models the step added), or only the letter chosen. `y` is the bars' base. `fed`: the choice whose word the step put
// into the input (its word under the bar lit as the input's is). `picks`: each model's own answer, drawn as nodes over
// bars that are the models' combined score. `plain`: bars without numbers (a combined score, not one model's chance).
type Out = { p?: number[]; votes?: number[]; added?: number; picks?: number[]; plain?: boolean; pick: number; lit?: boolean; fed?: number; marks: string[]; y: number };
type Panel = { cx: number; grid: number[]; on?: boolean; ocr?: boolean; orders?: boolean; out: Out };
const PANELS: Record<ModelStage, Panel[]> = {
  zoom: [
    { cx: -PX, grid: G26, out: { p: P512, pick: 2, marks: ["", "", "고른 답", "정답"], y: 3.25 } },
    { cx: PX, grid: G40, on: true, out: { p: P768, pick: 3, lit: true, marks: ["", "", "", "고른 답 · 정답"], y: 3.25 } },
  ],
  ocr: [
    { cx: -PX, grid: G26, out: { p: P512, pick: 2, marks: ["", "", "고른 답", "정답"], y: 3.25 } },
    { cx: PX, grid: G26, ocr: true, out: { p: POCR, pick: 2, fed: 3, marks: ["", "", "고른 답", "정답"], y: 3.25 } },
  ],
  vote: [
    { cx: -PX, grid: G26, out: { votes: [0, 1, 0], added: 3, pick: 0, marks: ["고른 답", "", "", ""], y: 3.65 } },
    { cx: PX, grid: G26, out: { votes: [0, 1, 0, 0, 1, 1, 1], added: 3, pick: 1, marks: ["", "고른 답", "", ""], y: 3.65 } },
  ],
  cascade: [
    { cx: -PX, grid: G26, out: { p: CLOCK_BASE, plain: true, picks: [3, 3, 1], pick: 3, marks: ["", "", "", "고른 답"], y: 3.25 } },
    { cx: PX, grid: G52, on: true, orders: true, out: { p: CLOCK_AGAIN, plain: true, pick: 1, lit: true, marks: ["", "다시 채점한 답", "", ""], y: 3.25 } },
  ],
  bits: [], size: [],
};
// The choices asked again in four orders, drawn as the four turns of the list (each word stands in each slot once);
// order[slot] = the word standing there. The words step through them under fixed letters, as on the BF16 step.
const ORDERS4 = [[0, 1, 2, 3], [3, 0, 1, 2], [2, 3, 0, 1], [1, 2, 3, 0]];
// A vote is one brick of the bar, with a clear gap to the next.
const BAR_H = 1.5, VOTE_H = 0.36, VOTE_GAP = 0.07;
// The panels' titles stand a little above the step's tallest bar (and its number), so no height is left empty above
// the bars and the picture can fill its box.
const topOf = (o: Out) => o.y + (o.p ? Math.max(...o.p) * BAR_H : o.votes ? Math.max(...LETTERS.map((_, m) => o.votes!.filter((v) => v === m).length)) * VOTE_H : 0.44);
const TITLE_Y = Object.fromEntries((Object.keys(PANELS) as ModelStage[]).map((s) => [s, PANELS[s].length ? Math.max(...PANELS[s].map((p) => topOf(p.out))) + 0.85 : 0])) as Record<ModelStage, number>;
// The bars' spacing: wider where the choices are long words, or where two close chances stand side by side.
const gapOf = (stage: ModelStage) => (stage === "vote" || stage === "cascade" || stage === "ocr" ? 0.98 : 0.62);
// What both panels share is drawn quieter where the step only adds something, so what it added stands out.
// The photo's patches and the encoder's rings take the first value, the tokens and the question's row (behind the OCR
// words) the second.
// A panel whose patches are themselves the change (on) stays full.
const quietOf = (stage: ModelStage) => (stage === "ocr" || stage === "vote" || stage === "cascade" ? [0.42, 0.2] : [1, 1]);

// 모델 크기: the axis (0 to 130B across), heights from zero to the ceiling of 400, and the three runs.
const SX = (b: number) => -4.4 + b / 130 * 8.8, SH = (n: number) => n / 400 * 3.0;
const SIZES = [{ b: 4, right: 338 }, { b: 8, right: 351 }, { b: 32, right: 368 }];
// A run's point on the curve (its radius, for placing its number).
const orb = (_b: number) => 0.09;
const fitted = (() => {
  const logs = SIZES.map((s) => Math.log(s.b)), mx = logs.reduce((a, v) => a + v, 0) / 3, my = SIZES.reduce((a, s) => a + s.right, 0) / 3;
  const slope = logs.reduce((a, v, k) => a + (v - mx) * (SIZES[k].right - my), 0) / logs.reduce((a, v) => a + (v - mx) ** 2, 0);
  return (b: number) => my + slope * (Math.log(b) - mx);
})();
// The 17 questions 32B still missed after training, in one row: 1 model error, 11 label or question problems, 5 photos
// not checked.
const MISSED = [...Array(1).fill("model"), ...Array(11).fill("label"), ...Array(5).fill("unseen")] as ("model" | "label" | "unseen")[];
const CLUSTER = { x: -1.05, y: 1.45, z: 0, gap: 0.19 };
const missedX = (m: number) => CLUSTER.x + m * CLUSTER.gap + (m >= 1 ? 0.12 : 0) + (m >= 12 ? 0.12 : 0);
// Where the contest's Colab stops: past 32B the floor darkens into the zone a model could not run in or pay for.
const COST_FROM = 36, COST_FULL = 60;

// How each step is seen: the camera's angles and the points its picture must hold.
const panelExtent = (s: ModelStage) => [[-4.75, 0, -1.1], [4.75, 0, -1.1], [-4.75, 0, FRONT], [4.75, 0, FRONT], [-4.7, TITLE_Y[s] + 0.1, 0.3], [4.7, TITLE_Y[s] + 0.1, 0.3]];
const VIEWS: Record<ModelStage, { tilt: number; turn: number; extent: number[][] }> = {
  zoom: { tilt: 0.4, turn: 0, extent: panelExtent("zoom") },
  ocr: { tilt: 0.4, turn: 0, extent: panelExtent("ocr") },
  vote: { tilt: 0.4, turn: 0, extent: panelExtent("vote") },
  cascade: { tilt: 0.4, turn: 0, extent: panelExtent("cascade") },
  size: { tilt: 0.14, turn: 0.16, extent: [[-4.8, -0.2, -0.6], [4.8, -0.2, -0.6], [-4.8, -0.2, 0.75], [4.8, -0.2, 0.75], [-4.8, 3.4, -0.6], [4.8, 3.4, 0.6]] },
  bits: { tilt: 0.12, turn: 0, extent: [[-4.25, -1.1, 1.4], [4.25, -1.1, 1.4], [-4.25, 4.65, 0], [4.25, 4.65, 0], [-4.2, 3.5, -1.0], [4.2, 3.5, -1.0]] },
};

const ease = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// W's values: a smooth field about zero, and the same held in 4 bits (each block of a row scaled to its largest weight,
// every weight moved to the nearest NF4 value).
function weights(n: number, block: number) {
  const field = (u: number, w: number) => 0.55 * Math.sin(u * 1.9 + 0.4) * Math.cos(w * 1.5 - 0.3) + 0.3 * Math.sin((u + w) * 2.4 + 1.1) + 0.12 * Math.sin(u * 5.1 - w * 3.3);
  const smooth = new Float32Array(n * n), held = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) smooth[j * n + i] = field((i / (n - 1) - 0.5) * 3, (j / (n - 1) - 0.5) * 3);
  for (let j = 0; j < n; j++) for (let b = 0; b < n; b += block) {
    let top = 1e-6;
    for (let i = b; i < Math.min(n, b + block); i++) top = Math.max(top, Math.abs(smooth[j * n + i]));
    for (let i = b; i < Math.min(n, b + block); i++) {
      const v = smooth[j * n + i] / top;
      held[j * n + i] = top * NF4.reduce((best, level) => (Math.abs(level - v) < Math.abs(best - v) ? level : best), NF4[0]);
    }
  }
  return { smooth, held };
}
// The shuffle: a new order of the words under the letters every 1.8 s (order[slot] = the words standing there).
const order = (r: number) => { const o = [0, 1, 2, 3]; let s = (r * 9301 + 49297) % 233280; for (let i = 3; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = s % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; };

// Round dots sized in world units, each with its own colour and opacity, drawn as given (sRGB).
const DOT_VERTEX = `attribute float size; attribute vec4 tint; varying vec4 vTint; uniform float unit;
void main() { vTint = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, size * unit / -mv.z); gl_Position = projectionMatrix * mv; }`;
const DOT_FRAGMENT = `varying vec4 vTint;
void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard; gl_FragColor = vec4(vTint.rgb, vTint.a * smoothstep(1.0, 0.72, d)); }`;

// Strokes with a width in pixels and round ends (three's fat lines), opaque: a stroke's strength is its colour mixed
// from the ground toward the ink (in linear light, as the line material expects).
function strokes(max: number, width: number) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(max * 6)); geometry.setColors(new Float32Array(max * 6));
  const pos = (geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data, col = (geometry.getAttribute("instanceColorStart") as THREE.InterleavedBufferAttribute).data;
  const material = new LineMaterial({ vertexColors: true, linewidth: width, depthTest: false, depthWrite: false });
  const line = new LineSegments2(geometry, material); line.frustumCulled = false; line.renderOrder = -1;
  let n = 0;
  return {
    line, material,
    add(a: number[], b: number[], ca: number[], cb: number[]) {
      if (n >= max) return;
      pos.array.set(a, n * 6); pos.array.set(b, n * 6 + 3); col.array.set(ca, n * 6); col.array.set(cb, n * 6 + 3); n++;
    },
    begin() { n = 0; },
    end() { geometry.instanceCount = n; pos.needsUpdate = true; col.needsUpdate = true; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

function canvasOf(maxDots: number, maxLines: number) {
  const dg = new THREE.BufferGeometry(), dp = new Float32Array(maxDots * 3), dt = new Float32Array(maxDots * 4), ds = new Float32Array(maxDots);
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("tint", new THREE.BufferAttribute(dt, 4)); dg.setAttribute("size", new THREE.BufferAttribute(ds, 1));
  const dm = new THREE.ShaderMaterial({ uniforms: { unit: { value: 1 } }, vertexShader: DOT_VERTEX, fragmentShader: DOT_FRAGMENT, transparent: true, depthWrite: false, depthTest: false });
  const dots = new THREE.Points(dg, dm); dots.frustumCulled = false;
  const thin = strokes(maxLines, 1.15), bold = strokes(600, 2.6);
  let nd = 0;
  return {
    dots, thin, bold, unit: dm.uniforms.unit,
    dot(x: number, y: number, z: number, size: number, c: number[], a: number) {
      if (nd >= maxDots || a < 0.01) return;
      dp[nd * 3] = x; dp[nd * 3 + 1] = y; dp[nd * 3 + 2] = z; ds[nd] = size;
      dt[nd * 4] = c[0]; dt[nd * 4 + 1] = c[1]; dt[nd * 4 + 2] = c[2]; dt[nd * 4 + 3] = Math.min(1, a); nd++;
    },
    begin() { nd = 0; thin.begin(); bold.begin(); },
    end() {
      dg.setDrawRange(0, nd);
      for (const name of ["position", "tint", "size"]) dg.getAttribute(name).needsUpdate = true;
      thin.end(); bold.end();
    },
    dispose() { dg.dispose(); dm.dispose(); thin.dispose(); bold.dispose(); },
  };
}

// Places the camera for a step: its angles, a point to look at and a distance.
const aim = (camera: THREE.PerspectiveCamera, target: number[], dist: number, tilt: number, turn: number) => {
  camera.position.set(target[0] + dist * Math.cos(tilt) * Math.sin(turn), target[1] + dist * Math.sin(tilt), target[2] + dist * Math.cos(tilt) * Math.cos(turn));
  camera.lookAt(target[0], target[1], target[2]); camera.updateMatrixWorld();
};
// The point to look at and the distance that fit a step's picture to the box, kept clear of the box's edges by the
// words that stand outside the dots: the panels' titles above (two lines), the question below.
function fit(view: (typeof VIEWS)[ModelStage], aspect: number, fov: number, h: number) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200), v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const target = [0, 1, 0].map((_, k) => view.extent.reduce((a, p) => a + p[k], 0) / view.extent.length);
  let dist = 16;
  // A short box (under 420px) hides the question below, so it keeps only a sliver there.
  const box = { left: -0.95, right: 0.95, bottom: Math.max(-0.97, -1 + 2 * (h < 420 ? 6 : 26) / h), top: Math.min(0.9, 1 - 2 * 46 / h) };
  for (let it = 0; it < 8; it++) {
    aim(camera, target, dist, view.tilt, view.turn);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of view.extent) { v.set(p[0], p[1], p[2]).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const half = dist * Math.tan(fov * Math.PI / 360);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const dx = ((x0 + x1) / 2 - (box.left + box.right) / 2) * half * aspect, dy = ((y0 + y1) / 2 - (box.bottom + box.top) / 2) * half;
    for (let k = 0; k < 3; k++) target[k] += right.getComponent(k) * dx + up.getComponent(k) * dy;
    dist *= Math.max((x1 - x0) / (box.right - box.left), (y1 - y0) / (box.top - box.bottom));
  }
  return { target, dist };
}

type Label = { cls: string; text: string; sub?: string; at: number[] };
// The words on each step: panel titles, small tags at their dots, the question.
const LABELS: Record<ModelStage, Label[]> = {
  zoom: [
    { cls: "m3-title", text: "512²", sub: "사진 토큰 234", at: [-PX, TITLE_Y.zoom, 0.3] },
    { cls: "m3-title", text: "768²", sub: "조각이 촘촘해지고 사진 토큰 540", at: [PX, TITLE_Y.zoom, 0.3] },
    { cls: "m3-tag is-soft is-right", text: "같은 4B 모델", at: [-PX + 0.15, 2.25, 0.3] },
    { cls: "m3-tag is-soft is-right", text: "같은 4B 모델", at: [PX + 0.15, 2.25, 0.3] },
  ],
  ocr: [
    { cls: "m3-title", text: "OCR 없이", sub: "같은 4B · 512², 사진과 질문만", at: [-PX, TITLE_Y.ocr, 0.3] },
    { cls: "m3-title", text: "OCR 글과 함께", sub: "OCR 모델이 읽은 11줄을 질문과 함께 입력", at: [PX, TITLE_Y.ocr, 0.3] },
    { cls: "m3-quote", text: "파란색 도로 표지판에 적힌 '언주로'까지의 거리는?", at: [0, 0, FRONT + 0.2] },
  ],
  vote: [
    { cls: "m3-title", text: "모델 3개", sub: "32B · Gemma 4 · 8B의 다수결", at: [-PX, TITLE_Y.vote, 0.3] },
    { cls: "m3-title", text: "모델 7개", sub: "답이 갈린 434문항에서만 4개를 더해 한 표씩", at: [PX, TITLE_Y.vote, 0.3] },
    { cls: "m3-quote", text: "이 EPS-B 구역에서 금지된 행위는?", at: [0, 0, FRONT + 0.2] },
  ],
  cascade: [
    { cls: "m3-title", text: "처음 · 세 모델의 로그 확률 평균", sub: "답이 d · d · b로 갈리고 1 · 2등 차가 작음", at: [-PX, TITLE_Y.cascade, 0.3] },
    { cls: "m3-title", text: "이 문항만 다시 채점", sub: "6,714문항 중 298문항 · 2배 · 3배 확대 · 보기 순서 4가지", at: [PX, TITLE_Y.cascade, 0.3] },
    { cls: "m3-quote", text: "가로등에 달린 시계는 몇 시를 가리키나요?", at: [0, 0, FRONT + 0.2] },
  ],
  size: [
    { cls: "m3-tag is-left", text: "338", at: [SX(4) - 0.2, SH(338) + 0.02, 0] },
    { cls: "m3-tag is-right", text: "351", at: [SX(8) + 0.06, SH(351) - 0.26, 0] },
    { cls: "m3-tag", text: "368", at: [SX(32), SH(368) + 0.3, 0] },
    ...[0, 100, 200, 300].map((n) => ({ cls: "m3-tag is-soft is-left", text: String(n), at: [SX(0) - 0.12, SH(n), -0.5] })),
    ...SIZES.map((s, k) => ({ cls: `m3-chip${k === 0 ? " is-left" : ""}`, text: `${s.b}B`, at: [SX(s.b) + (k === 0 ? -0.1 : k === 1 ? 0.1 : 0), -0.12, 0.75] })),
    { cls: "m3-chip", text: "122B", at: [SX(122), -0.12, 0.75] },
    { cls: "m3-tag is-soft is-left", text: "만점 400", at: [SX(0) - 0.12, SH(400), -0.5] },
    { cls: "m3-tag", text: "대회 Colab에서 실행 불가 · 예산 초과", at: [SX(88), 0.42, 0.1] },
    { cls: "m3-tag is-right", text: "32B 학습 후에도 남은 오답 17문항", at: [CLUSTER.x - 0.08, CLUSTER.y + 0.36, 0] },
    { cls: "m3-tag is-soft", text: "모델 오류 1", at: [missedX(0), CLUSTER.y - 0.3, 0] },
    { cls: "m3-tag is-soft", text: "라벨 · 문항 문제 11", at: [(missedX(1) + missedX(11)) / 2, CLUSTER.y - 0.3, 0] },
    { cls: "m3-tag is-soft", text: "사진 미확인 5", at: [(missedX(12) + missedX(16)) / 2, CLUSTER.y - 0.3, 0] },
    { cls: "m3-tag is-soft", text: "가로: 파라미터 수 · 높이: 학습 전 400문항 중 맞힌 수", at: [-0.2, -0.62, 0.75] },
  ],
  bits: [
    { cls: "m3-title", text: "4비트(NF4)로 학습", sub: "4B · 8B · 32B · 보기 순서 고정", at: [-2.35, 4.45, 0] },
    { cls: "m3-title", text: "BF16으로 학습", sub: "27B 두 모델 · 보기 순서 섞기", at: [2.35, 4.45, 0] },
    { cls: "m3-tag is-soft", text: "동결된 W · LoRA B · A는 양쪽 같음", at: [0, 3.3, 0] },
    { cls: "m3-tag is-soft", text: "W의 한 줄: 블록마다 16단계로 떨어진 값과 오차", at: [-2.35, 0.55, 0.6] },
    { cls: "m3-tag is-soft", text: "W의 한 줄: 원래 값 그대로", at: [2.35, 0.55, 0.6] },
    { cls: "m3-tag is-soft", text: "정답 글자에만 손실", at: [-2.35, -0.95, 1.4] },
    { cls: "m3-tag is-soft", text: "학습할 때마다 24가지 순서 중 하나", at: [2.35, -0.95, 1.4] },
  ],
};
const ARIA: Record<ModelStage, string> = {
  zoom: "점으로 그린 모식, 두 판: 같은 표지판을 512²와 768²에서 16픽셀 조각으로 자른 점. 768²에서 점이 촘촘해지고 사진 토큰이 234개에서 540개로 늘며, 글자 확률이 c 100m 49.1% · d 300m 49.1%에서 d 300m 99.98%로 바뀐다.",
  ocr: "점으로 그린 모식, 두 판: 같은 표지판을 같은 4B 모델에 512²로 넣는다. 오른쪽은 OCR 모델이 사진에서 읽은 글 11줄이 질문과 함께 입력에 더해진다. 질문과 관련된 글은 언주로 · Eonju-ro · 300m 3줄이고 나머지 8줄(수봉은사로 · 선릉역 · 강남세브란스병원 · 주정차금지 · 견인지역 등)은 무관한 글이다. 확률은 c 100m 49.1% · d 300m 49.1%에서 c 52.7% · d 46.5%로, 틀린 c가 앞선다.",
  size: "점으로 그린 그래프: 파라미터 수에 비례한 가로축 위에 4B · 8B · 32B가 선다. 기둥의 바닥 넓이는 모델 크기, 높이는 학습 전 400문항 중 맞힌 수(338 · 351 · 368)로 0부터 만점 400까지. 세 점에 맞춘 로그 곡선을 122B 자리까지 점선으로 이었고 122B에는 숫자가 없다. 32B보다 큰 모델은 대회 Colab에서 실행되지 않고 예산을 넘는다. 32B 학습 후에도 남은 오답 17문항 중 사진을 본 12문항은 모델 오류 1, 라벨 · 문항 문제 11이었다.",
  vote: "점으로 그린 모식, 두 판: 같은 test 사진(EPS-B 실 문 표지, '관계자외출입금지'에 상자)에 모델마다 한 표씩, 표가 막대에 한 칸씩 쌓인다. 모델 3개는 a · b · a로 a(흡연금지), 모델 7개는 a 3표 · b 4표로 b(출입금지)를 고른다. 오른쪽에서 더한 모델 넷과 그 표가 빛난다.",
  bits: "점으로 그린 모식, 두 판: 언어 모델 한 층의 가중치 W. 왼쪽 4비트는 값이 블록마다 16단계로 끊기고 보기 순서가 고정, 오른쪽 BF16은 원래 값 그대로이고 학습할 때마다 보기의 글이 a b c d 자리를 바꾸며 정답 글자도 함께 옮겨 간다. LoRA B · A는 양쪽이 같다. 손실은 정답 글자에만 건다.",
  cascade: "점으로 그린 모식, 두 판: test 사진(가로등의 시계, 시계에 상자). 왼쪽은 학습한 세 모델의 로그 확률 평균 막대로 d(밤 9시 10분)와 b(밤 10시 10분)가 거의 같고, 세 모델의 답은 d · d · b로 갈렸다. 이런 문항(6,714문항 중 298문항)만 2배 · 3배로 확대해 조각을 촘촘히 하고, 보기를 한 칸씩 돌린 순서 4가지로 다시 채점하자 b가 가장 높아졌다. 오른쪽의 막대는 자기 보기 글과 함께 자리를 옮긴다.",
};

export function VqaModel3D({ stage, photo, fallback }: { stage: ModelStage; photo: PhotoSpec; fallback?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null), tags = useRef<HTMLDivElement>(null);
  const [flat, setFlat] = useState(false);
  useEffect(() => {
    const box = host.current!, overlay = tags.current!;
    const was = lastStage;
    lastStage = stage;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFlat(true); return; }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio); renderer.setClearColor(0x000000, 0);
    box.prepend(renderer.domElement);
    const FOV = 30, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const C = canvasOf(16000, 9000);
    scene.add(C.thin.line, C.bold.line, C.dots);
    const panels = PANELS[stage], [IW, IH] = photo.size, [B0, B1] = photo.band, BAR_GAP = gapOf(stage), [Q, QT] = quietOf(stage);
    // A point of the photo (in its pixels) on a panel laid flat at centre cx.
    const onPhoto = (cx: number, px: number, py: number) => [cx - PW / 2 + px / IW * PW, -PD / 2 + (py - B0) / (B1 - B0) * PD];

    // The photo's patches in their real colours, read once the photo is in, for every grid the step shows.
    const grids = [...new Set(panels.map((p) => p.grid))];
    const shades = new Map(grids.map((g) => [g, new Float32Array(g[0] * g[1] * 3).fill(0.6)]));
    const image = new Image();
    image.onload = () => grids.forEach((g) => {
      const [cols, rows] = g, canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const scale = (image.naturalHeight || IH) / IH, patch = shades.get(g)!;
      canvas.width = cols; canvas.height = rows; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, B0 * scale, IW * scale, (B1 - B0) * scale, 0, 0, cols, rows);
      const data = ctx.getImageData(0, 0, cols, rows).data;
      for (let p = 0; p < cols * rows; p++) for (let c = 0; c < 3; c++) patch[p * 3 + c] = data[p * 4 + c] / 255;
    });
    if (panels.length) image.src = photo.src;
    // The original photo's band, lying under each panel's patches.
    const texture = new THREE.TextureLoader().load(photo.src);
    texture.colorSpace = THREE.SRGBColorSpace; texture.offset.set(0, (IH - B1) / IH); texture.repeat.set(1, (B1 - B0) / IH);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    const plane = new THREE.PlaneGeometry(PW, PD);
    panels.forEach(({ cx }) => { const m = new THREE.Mesh(plane, photoMat); m.rotation.x = -Math.PI / 2; m.position.x = cx; m.renderOrder = -2; scene.add(m); });
    const W16 = weights(16, 4);

    // The ink of the stage, read again when the theme changes.
    let ink = [0.05, 0.05, 0.05], inkLin = [0, 0, 0], groundLin = [1, 1, 1], dark = false;
    const groundOf = (el: HTMLElement | null): string => { for (let at = el; at; at = at.parentElement) { const bg = getComputedStyle(at).backgroundColor; if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg; } return getComputedStyle(document.body).backgroundColor || "#ffffff"; };
    const paint = () => {
      dark = document.documentElement.classList.contains("dark");
      const c = new THREE.Color(getComputedStyle(box).getPropertyValue("--stage-ink").trim() || "#232323"), g = new THREE.Color().setStyle(groundOf(box)), o = { r: 0, g: 0, b: 0 };
      c.getRGB(o, THREE.SRGBColorSpace); ink = [o.r, o.g, o.b];
      inkLin = [c.r, c.g, c.b]; groundLin = [g.r, g.g, g.b];
    };
    paint();
    const theme = new MutationObserver(paint); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Words over the picture.
    const put = (cls: string, text: string, sub?: string) => {
      const el = document.createElement("div"); el.className = cls;
      const b = document.createElement("b"); b.textContent = text; el.append(b);
      if (sub) { const span = document.createElement("span"); span.textContent = sub; el.append(span); }
      overlay.append(el); return el;
    };
    const labels = LABELS[stage].map((l) => ({ ...l, el: put(l.cls, l.text, l.sub) }));
    // The letters and words under each bar (or, on the bits step, under each choice), the chance above, the marks below.
    const { words: choiceWords, gold } = WORDS[stage];
    const sets = stage === "bits" ? 2 : panels.length;
    const letters = Array.from({ length: sets }, () => LETTERS.map((k) => put("m3-chip", k)));
    const shown = (k: number, m: number) => { const o = panels[k]?.out; return !o?.votes || o.pick === m || o.votes.includes(m); };
    const words = Array.from({ length: sets }, (_, k) => choiceWords.map((text, m) => {
      const el = put(m % 2 ? "m3-word is-odd" : "m3-word", stage === "bits" || shown(k, m) ? text : "");
      if (m === gold) el.dataset.gold = "";
      if (stage !== "bits" && panels[k].out.pick === m) el.classList.add("is-pick");
      if (stage !== "bits" && gold !== undefined && panels[k].out.pick === m && m !== gold) el.dataset.wrong = "";
      return el;
    }));
    const counts = (o: Out) => LETTERS.map((_, m) => (o.votes ?? []).filter((v) => v === m).length);
    // On the OCR step only the two close chances are written; the others are near zero on both sides.
    const chances = panels.map(({ out }) => LETTERS.map((_, m) => put((m % 2 ? "is-odd " : "") + (out.p && out.p[m] < 0.1 ? "m3-tag is-small" : "m3-tag"), out.p ? (out.plain || (stage === "ocr" && out.p[m] < 0.1) ? "" : percent(out.p[m])) : out.votes ? (counts(out)[m] ? `${counts(out)[m]}표` : "") : "")));
    const marks = panels.map(({ out }) => out.marks.map((text) => put("m3-mark", text)));
    // The eleven OCR lines as one block of words, in the order read: the question's three in ink, the one that is a
    // choice's word (300m) lit as its word under the bar is; the eight unrelated to the question as noise — blurred,
    // each a little askew and flickering on its own beat.
    const ocrBlocks = panels.filter((pn) => pn.ocr).map((pn) => {
      const el = document.createElement("div"), p = document.createElement("p");
      el.className = "m3-ocrs";
      OCR.forEach((line, m) => {
        const span = document.createElement("span"); span.textContent = line.text;
        if (line.key) span.className = WORDS[stage].words.includes(line.text) ? "is-key is-gold" : "is-key";
        else {
          span.className = "is-noise";
          span.style.rotate = `${((hash(m + 3) * 2 - 1) * 7).toFixed(1)}deg`;
          span.style.translate = `0 ${((hash(m + 11) * 2 - 1) * 0.25).toFixed(2)}em`;
          span.style.animationDuration = `${(0.9 + hash(m + 21) * 1.6).toFixed(2)}s`;
          span.style.animationDelay = `${(-hash(m + 31) * 2).toFixed(2)}s`;
        }
        p.append(span);
      });
      el.append(p); overlay.append(el);
      return { cx: pn.cx, el };
    });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now(), MOVE = reduced ? 1 : 1400;
    let raf = 0, size = "", seen = true, fromPose = { target: [0, 0, 0], dist: 1 }, toPose = fromPose;
    const watch = new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; }); watch.observe(box);
    const v = new THREE.Vector3();
    const project = (p: number[], w: number, h: number) => { v.set(p[0], p[1], p[2]).project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
    const place = (el: HTMLElement, p: number[], w: number, h: number, alpha: number) => { const [x, y] = project(p, w, h); el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.opacity = alpha.toFixed(2); };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!box.offsetParent || !seen) return;
      const w = box.clientWidth, h = box.clientHeight;
      if (`${w}x${h}` !== size) {
        size = `${w}x${h}`; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
        C.unit.value = h * pixelRatio / (2 * Math.tan(FOV * Math.PI / 360));
        C.thin.material.resolution.set(w, h); C.bold.material.resolution.set(w, h);
        box.toggleAttribute("data-short", h < 420); box.toggleAttribute("data-narrow", w < 560);
        fromPose = fit(VIEWS[was], camera.aspect, FOV, h); toPose = fit(VIEWS[stage], camera.aspect, FOV, h);
      }
      const t = ease(Math.min(1, (now - started) / MOVE)), sec = reduced ? 0 : now / 1000;
      // The dots come up from the bottom as the step opens.
      const grow = reduced ? 1 : Math.min(1, (now - started) / 1600);
      const rise = (order: number) => ease(clamp((grow - order * 0.55) / 0.45));
      const target = fromPose.target.map((a, k) => mix(a, toPose.target[k], t));
      aim(camera, target, mix(fromPose.dist, toPose.dist, t), mix(VIEWS[was].tilt, VIEWS[stage].tilt, t), mix(VIEWS[was].turn, VIEWS[stage].turn, t) + 0.06 * Math.sin(sec * 0.18));

      C.begin();
      const cam = camera.position, near = mix(fromPose.dist, toPose.dist, t);
      const depth = (x: number, y: number, z: number) => clamp(1.15 - Math.max(0, Math.hypot(x - cam.x, y - cam.y, z - cam.z) - near + 3) / 7 * 0.55);
      const dot = (x: number, y: number, z: number, s: number, c: number[], a: number, order = y / 7) => { const r = rise(clamp(order)), yy = y - (1 - r) * 0.35; C.dot(x, yy, z, s, c, a * r * depth(x, yy, z)); };
      const strength = (a: number) => [0, 1, 2].map((k) => mix(groundLin[k], inkLin[k], clamp(a)));
      const stroke = (bold: boolean, ax: number, ay: number, az: number, bx: number, by: number, bz: number, a: number, b = a, order = Math.max(ay, by) / 7) => {
        const r = rise(clamp(order)), ya = ay - (1 - r) * 0.35, yb = by - (1 - r) * 0.35;
        if (a * r < 0.01 && b * r < 0.01) return;
        (bold ? C.bold : C.thin).add([ax, ya, az], [bx, yb, bz], strength(a * r * depth(ax, ya, az)), strength(b * r * depth(bx, yb, bz)));
      };
      const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, a: number, b = a, order = Math.max(ay, by) / 7) => stroke(false, ax, ay, az, bx, by, bz, a, b, order);
      // Ink, and the same ink lit: a soft halo under the dot.
      const plain = (x: number, y: number, z: number, sz: number, a: number, order?: number) => dot(x, y, z, sz, ink, a, order);
      const lit = (x: number, y: number, z: number, sz: number, a: number, order?: number) => { if (dark) dot(x, y, z, sz * 3.2, ink, a * 0.13, order); dot(x, y, z, sz * (dark ? 1 : 1.12), ink, a, order); };
      // A lit line: the stroke with small lit dots along it.
      const litLine = (a: number[], b: number[], strong = 0.75) => {
        seg(a[0], a[1], a[2], b[0], b[1], b[2], strong);
        const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.12));
        for (let m = 1; m < n; m++) lit(mix(a[0], b[0], m / n), mix(a[1], b[1], m / n), mix(a[2], b[2], m / n), 0.022, 0.8);
      };
      // The question's own path, drawn bold, with a light running along it.
      const path = (pts: number[][], speed = 0.28) => {
        const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2])), total = lens.reduce((a, l) => a + l, 0);
        pts.slice(1).forEach((p, i) => stroke(true, pts[i][0], pts[i][1], pts[i][2], p[0], p[1], p[2], 0.95));
        const along = (u: number) => { let d = u * total; for (let i = 0; i < lens.length; i++) { if (d <= lens[i]) { const q = d / lens[i]; return pts[i].map((v, k) => mix(v, pts[i + 1][k], q)); } d -= lens[i]; } return pts[pts.length - 1]; };
        const head = (sec * speed) % 1;
        for (let n = 0; n < 12; n++) { const u = head - n * 0.012; if (u < 0) break; const p = along(u); lit(p[0], p[1], p[2], 0.1 - n * 0.006, 1 - n / 12); }
      };
      photoMat.opacity = rise(0);
      // A layer: a thin ring round the panel (a rounded rectangle at height y), lit by on.
      const ring = (x0: number, x1: number, z0: number, z1: number, y: number, a: number, on = 0) => {
        const r = 0.3, pts: number[][] = [];
        [[x1 - r, z1 - r], [x0 + r, z1 - r], [x0 + r, z0 + r], [x1 - r, z0 + r]].forEach(([cx, cz], c) => { for (let q = 0; q <= 4; q++) { const ang = (c + q / 4) * Math.PI / 2; pts.push([cx + r * Math.cos(ang), cz + r * Math.sin(ang)]); } });
        pts.forEach((p, i) => {
          const q2 = pts[(i + 1) % pts.length];
          seg(p[0], y, p[1], q2[0], y, q2[1], a + 0.55 * on);
          if (on > 0.02) { const n = Math.max(1, Math.ceil(Math.hypot(q2[0] - p[0], q2[1] - p[1]) / 0.13)); for (let m = 0; m < n; m++) lit(mix(p[0], q2[0], m / n), y, mix(p[1], q2[1], m / n), 0.032, on); }
        });
      };
      // A circle of dots (a model's node, a hollow mark).
      const circle = (x: number, y: number, z: number, r: number, sz: number, a: number, on: boolean, facing: "up" | "front" = "front") => {
        for (let m = 0; m < 18; m++) { const ang = m / 18 * Math.PI * 2, c = r * Math.cos(ang), s = r * Math.sin(ang); (on ? lit : plain)(x + c, y + (facing === "front" ? s : 0), z + (facing === "up" ? s : 0), sz, a); }
      };
      // One wave climbs the encoder's layers.
      const wave = (sec * 8) % 34, glow = (l: number) => Math.max(0, 1 - Math.abs(l - wave) / 1.6);
      // The photo's 16-pixel patches as dots in their real colours over it; the changed panel's dots glow in their own colour.
      const patches = (cx: number, g: number[], y: number, on: boolean) => {
        const [cols, rows] = g, patch = shades.get(g)!, sp = PW / cols;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const p = (j * cols + i) * 3, c = [patch[p], patch[p + 1], patch[p + 2]], x = cx - PW / 2 + (i + 0.5) * sp, z = -PD / 2 + (j + 0.5) * PD / rows;
          if (on) dot(x, y, z, sp * 1.7, c, 0.14, 0);
          dot(x, y, z, sp * 0.82, c, on ? 1 : Q, 0);
        }
      };
      // The image tokens at height ty, each fed by its 2 × 2 patches from the encoder's top; a spark rises from every
      // patch into its token. Returns the tokens' places.
      const tokens = (cx: number, g: number[], from: number, top: number, ty: number, on: boolean, seed: number) => {
        const [cols, rows] = g, tc = cols / 2, tr = rows / 2, s = PW / tc * 0.24, qt = on ? 1 : QT;
        const at: number[][] = [];
        for (let j = 0; j < tr; j++) for (let i = 0; i < tc; i++) {
          const x = cx - PW / 2 + (i + 0.5) * PW / tc, z = -PD / 2 + (j + 0.5) * PD / tr;
          (on ? lit : plain)(x, ty, z, s, 0.85 * qt);
          at.push([x, z]);
          for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
            const px = cx - PW / 2 + (i * 2 + di + 0.5) * PW / cols, pz = -PD / 2 + (j * 2 + dj + 0.5) * PD / rows;
            seg(px, from, pz, px, top, pz, 0.07 * qt); seg(px, top, pz, x, ty, z, 0.05 * qt, 0.16 * qt);
            const q = (sec * 0.3 + hash(j * 977 + i * 31 + dj * 7 + di + seed)) % 1, y = mix(from, ty, q), f = y < top ? 0 : ease((y - top) / (ty - top));
            dot(mix(px, x, f), y, mix(pz, z, f), s * 0.35, ink, 0.7 * qt * Math.sin(Math.PI * q), y / 7);
          }
        }
        return at;
      };
      // The patch where the question's answer lies, and its token, at panel centre cx, grid g.
      const answerPath = (cx: number, g: number[]) => {
        const [cols, rows] = g, i = Math.floor(photo.key[0] / IW * cols), j = Math.floor((photo.key[1] - B0) / (B1 - B0) * rows);
        return [cx - PW / 2 + (i + 0.5) * PW / cols, -PD / 2 + (j + 0.5) * PD / rows, cx - PW / 2 + ((i >> 1) + 0.5) * PW / (cols / 2), -PD / 2 + ((j >> 1) + 0.5) * PD / (rows / 2)];
      };
      // A column of dots from y0 to y1 at x.
      const column = (x: number, y0: number, y1: number, z: number, on: boolean, a: number, sz = 0.13) => { for (let y = y0; y <= y1 + 1e-6; y += 0.03) (on ? lit : plain)(x, y, z, sz, a); };
      // The letters' chances as bars rising from a base line, or the votes stacked one block each, floating in the scene.
      const bars = (cx: number, o: Out, slot: (m: number) => number = (m) => m) => {
        const x0 = cx - 1.5 * BAR_GAP, at = slot(o.pick);
        seg(x0 - 0.28, o.y, 0.3, x0 + 3 * BAR_GAP + 0.28, o.y, 0.3, 0.45);
        if (o.p) o.p.forEach((p, m) => column(x0 + slot(m) * BAR_GAP, o.y + 0.04, o.y + Math.max(0.035, p * BAR_H), 0.3, !!o.lit && m === o.pick, p > 0.1 ? 0.95 : 0.5));
        else if (o.votes) LETTERS.forEach((_, m) => {
          let k = 0;
          o.votes!.forEach((v, n) => { if (v !== m) return; column(x0 + m * BAR_GAP, o.y + VOTE_GAP + k * VOTE_H, o.y + (k + 1) * VOTE_H - VOTE_GAP, 0.3, n >= (o.added ?? 99), 0.95, 0.17); k++; });
        });
        else { circle(x0 + at * BAR_GAP, o.y + 0.24, 0.3, 0.2, 0.035, 1, true); lit(x0 + at * BAR_GAP, o.y + 0.24, 0.3, 0.1, 1); }
      };
      const barTop = (o: Out, m: number) => (o.p ? Math.max(0.035, o.p[m] * BAR_H) : o.votes ? o.votes.filter((v) => v === m).length * VOTE_H : 0.44);

      const round = Math.floor(sec / 1.8), within = ease(Math.min(1, (sec / 1.8 - round) * 2)), w4 = reduced ? 1 : within;
      const o4a = ORDERS4[(round + 3) % 4], o4b = ORDERS4[round % 4];
      const spot4 = LETTERS.map((_, c) => mix(o4a.indexOf(c), o4b.indexOf(c), w4)), lift4 = LETTERS.map((_, c) => (o4a.indexOf(c) !== o4b.indexOf(c) ? Math.sin(Math.PI * w4) : 0));
      const slotOf = (pn: Panel, m: number) => (pn.orders ? spot4[m] : m);

      // The panels: photo, patches, encoder, tokens, the input's words, what the step added, and the chances.
      panels.forEach((pn, k) => {
        const { cx, grid, out } = pn, qt = pn.on ? 1 : QT;
        patches(cx, grid, 0.6, !!pn.on);
        // Where the photo itself shows what the question asks, boxed in dots over the patches.
        if (photo.box) {
          const [bl, bt, br, bb] = photo.box, a = onPhoto(cx, bl * IW, Math.max(bt * IH, B0)), b = onPhoto(cx, br * IW, Math.min(bb * IH, B1));
          const corners = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
          corners.forEach((c, n) => {
            const d = corners[(n + 1) % 4], steps = Math.max(2, Math.ceil(Math.hypot(d[0] - c[0], d[1] - c[1]) / 0.035));
            for (let q = 0; q < steps; q++) plain(mix(c[0], d[0], q / steps), ON_PHOTO, mix(c[1], d[1], q / steps), 0.04, 1, 0);
          });
        }
        for (let l = 0; l < 24; l += 3) ring(cx - PW / 2 - 0.15, cx + PW / 2 + 0.15, -PD / 2 - 0.15, PD / 2 + 0.15, 0.9 + l * 0.022, 0.16 * Q, glow(l) * Q);
        const image = tokens(cx, grid, 0.6, 1.45, 1.75, !!pn.on, k * 5000);
        // The question, the choices and the last place: one row of words in front.
        const text = [-2.0, -1.7, -1.4, -1.1, -0.8, -0.35, 0.15, 0.65, 1.15, 1.9].map((d) => cx + d);
        const voted = !!(out.votes || out.picks), meet = [cx, voted ? 2.15 : 2.85, 0.3];
        text.forEach((x) => {
          plain(x, 1.75, FRONT - 0.3, 0.1, 0.85 * qt);
          seg(x, 1.75, FRONT - 0.3, meet[0], meet[1], meet[2], 0.05 * qt, 0.22 * qt);
        });
        for (const [x, z] of image) seg(x, 1.75, z, meet[0], meet[1], meet[2], 0.035 * qt, 0.22 * qt);
        // OCR: every line's box on the photo (drawn in dots, over the patches), all of them lit alike, each with a lit
        // stroke rising to the block of words; from there one bold stroke into the input.
        if (pn.ocr) {
          const at = [cx + OCR_AT.dx, OCR_AT.y, OCR_AT.z];
          OCR.forEach((line) => {
            const [l, tp, r, bt] = line.box, y0 = tp * IH, y1 = bt * IH;
            if (y1 <= B0 || y0 >= B1) return;
            const a = onPhoto(cx, l * IW, Math.max(y0, B0)), b = onPhoto(cx, r * IW, Math.min(y1, B1));
            const corners = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
            corners.forEach((c, n) => {
              const d = corners[(n + 1) % 4], steps = Math.max(2, Math.ceil(Math.hypot(d[0] - c[0], d[1] - c[1]) / 0.035));
              for (let q = 0; q < steps; q++) lit(mix(c[0], d[0], q / steps), ON_PHOTO, mix(c[1], d[1], q / steps), 0.035, 0.95, 0);
            });
            litLine([(a[0] + b[0]) / 2, ON_PHOTO, (a[1] + b[1]) / 2], at, 0.7);
          });
          lit(at[0], at[1], at[2], 0.12, 1);
          stroke(true, at[0], at[1], at[2], meet[0], meet[1], meet[2], 0.85, 0.6);
        }
        // The models, each a node casting its one vote into its own brick of its letter's bar (the line meets that brick
        // at its side); the ones this step added lit, with their bricks.
        const x0 = cx - 1.5 * BAR_GAP;
        if (out.votes) out.votes.forEach((vote, n) => {
          const nx = cx + (n - (out.votes!.length - 1) / 2) * 0.46, NY = 2.6, node = [nx, NY, 0.3], on = n >= (out.added ?? 99);
          const bx = x0 + vote * BAR_GAP, height = out.votes!.slice(0, n).filter((v) => v === vote).length, brick = [bx + (nx < bx ? -0.11 : 0.11), out.y + (height + 0.5) * VOTE_H, 0.3];
          circle(nx, NY, 0.3, 0.12, 0.03, 0.9, on);
          (on ? lit : plain)(nx, NY, 0.3, 0.08, 1);
          if (on) { litLine(meet, node, 0.55); litLine(node, brick, 0.75); }
          else { seg(meet[0], meet[1], meet[2], nx, NY, 0.3, 0.3); seg(nx, NY, 0.3, brick[0], brick[1], brick[2], 0.35); }
        });
        else if (out.picks) out.picks.forEach((answer, n) => {
          const nx = cx + (n - (out.picks!.length - 1) / 2) * 0.46, NY = 2.6, ax = x0 + slotOf(pn, answer) * BAR_GAP;
          circle(nx, NY, 0.3, 0.12, 0.03, 0.9, false);
          plain(nx, NY, 0.3, 0.08, 1);
          seg(meet[0], meet[1], meet[2], nx, NY, 0.3, 0.3); seg(nx, NY, 0.3, ax, out.y, 0.3, 0.35);
        });
        else seg(meet[0], meet[1], meet[2], meet[0], out.y, 0.3, 0.6);
        const [px, pz, tx, tz] = answerPath(cx, grid);
        lit(px, 0.6, pz, grid === G52 ? 0.1 : grid === G40 ? 0.12 : 0.16, 1, 0);
        path([[px, 0.6, pz], [px, 1.45, pz], [tx, 1.75, tz], meet, ...(out.votes ? [] : [[cx, out.y, 0.3]]), [x0 + slotOf(pn, out.pick) * BAR_GAP, out.y, 0.3]], 0.24);
        bars(cx, out, (m) => slotOf(pn, m));
      });

      // 모델 크기: a wall of faint dot rules at 0 · 100 · 200 · 300 behind, the ceiling of 400 as a sheet of dots, the
      // parameter axis on the floor (where the contest's Colab could not run a model, dotted); the curve fitted through
      // the three runs drawn bold with light running along it, then faint and dashed to 122B; each run a lit point on the
      // curve with a dotted drop to the axis, 122B only a hollow ring and no number; and beside 32B the 17 questions
      // training did not fix.
      if (stage === "size") {
        const WZ = -0.5;
        for (const n of [100, 200, 300, 400]) for (let x = SX(0); x <= SX(130); x += 0.12) plain(x, SH(n), WZ, 0.02, n === 400 ? 0.4 : 0.24);
        for (let y = 0; y <= SH(400); y += 0.12) plain(SX(0), y, WZ, 0.02, 0.35);
        seg(SX(0), 0, 0.6, SX(130), 0, 0.6, 0.65, 0.65, 0);
        for (let x = SX(0); x <= SX(130); x += 0.12) plain(x, 0, WZ, 0.02, 0.3, 0);
        // The cost: past 32B the floor fills with dots, darker toward 60B and full from there on.
        for (let x = SX(COST_FROM); x <= SX(130) + 1e-6; x += 0.11) {
          const a = 0.1 + 0.42 * clamp((x - SX(COST_FROM)) / (SX(COST_FULL) - SX(COST_FROM)));
          for (let z = WZ; z <= 0.56 + 1e-6; z += 0.11) plain(x, 0, z, 0.03, a, 0);
        }
        // The curve measured from 4B to 32B, bold with light running along it; its fit carried on to 122B in dashes.
        const curve = (b: number) => [SX(b), SH(fitted(b)), 0];
        path(Array.from({ length: 33 }, (_, i) => curve(4 * 8 ** (i / 32))), 0.22);
        for (let i = 0; i < 40; i += 2) { const a = curve(32 * (122 / 32) ** (i / 40)), b = curve(32 * (122 / 32) ** ((i + 1) / 40)); seg(a[0], a[1], a[2], b[0], b[1], b[2], 0.55); }
        SIZES.forEach((s) => {
          const x = SX(s.b), top = SH(s.right);
          lit(x, top, 0, 0.2, 1);
          for (let yy = 0.04; yy < top - 0.12; yy += 0.07) plain(x, yy, 0, 0.018, 0.3);
          seg(x, 0, 0.6, x, 0, 0.47, 0.65, 0.65, 0);
        });
        const end = curve(122);
        circle(end[0], end[1], 0, 0.12, 0.026, 0.75, false);
        seg(end[0], 0, 0.6, end[0], 0, 0.47, 0.5, 0.5, 0);
        for (let yy = 0.04; yy < end[1] - 0.14; yy += 0.14) plain(end[0], yy, 0, 0.016, 0.18);
        // The 17 in one row: one lit (the model error), eleven hollow (label or question problems), five faint (not checked).
        MISSED.forEach((kind, m) => {
          const x = missedX(m), y = CLUSTER.y;
          if (kind === "model") lit(x, y, CLUSTER.z, 0.13, 1);
          else if (kind === "label") circle(x, y, CLUSTER.z, 0.06, 0.02, 0.85, false);
          else plain(x, y, CLUSTER.z, 0.045, 0.3);
        });
        // From 32B down to the row's name, then across to it.
        const c0 = [SX(32) + 0.06, SH(368) - 0.14, 0], ty = CLUSTER.y + 0.36;
        seg(c0[0], c0[1], c0[2], c0[0], ty, 0, 0.4);
        seg(c0[0], ty, 0, CLUSTER.x - 0.18, ty, 0, 0.4);
      }

      // The shuffle (one panel fixed, the other trading places): where each choice's words stand, lifted while they move.
      const before = order(round - 1), now2 = order(round);
      const spot = LETTERS.map((_, c) => mix(before.indexOf(c), now2.indexOf(c), within)), lift = LETTERS.map((_, c) => (before.indexOf(c) !== now2.indexOf(c) ? Math.sin(Math.PI * within) : 0));
      if (stage === "bits") {
        [-2.35, 2.35].forEach((cx, k) => {
          const run = (ax: number, ay: number, bx: number, by: number, z: number, sz: number, a: number) => {
            const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (sz * 0.7)));
            for (let q = 0; q <= steps; q++) lit(mix(ax, bx, q / steps), mix(ay, by, q / steps), z, sz, a);
          };
          // The frozen W of one layer, small, tipped toward the camera, with the same LoRA pair on its sides (B down the
          // left, A along the top); the row taken out below is lit.
          const n = 12, half = 0.8, pick = 7;
          const at = (u: number, vv: number, hgt = 0) => [cx + u * half, 3.3 + vv * half * 0.55 + hgt * 0.83, -vv * half * 0.83 + hgt * 0.55];
          const uv = (m: number) => m / (n - 1) * 2 - 1;
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const p = at(uv(i), uv(j), 0.18 * (k ? W16.smooth : W16.held)[Math.round(j * 15 / (n - 1)) * 16 + Math.round(i * 15 / (n - 1))]);
            if (j === pick) lit(p[0], p[1], p[2], 0.05, 0.95); else plain(p[0], p[1], p[2], 0.04, 0.35);
          }
          for (let m = 0; m < n; m++) { const b = at(-1.22, uv(m)), a = at(uv(m), 1.22); plain(b[0], b[1], b[2], 0.05, 0.7); plain(a[0], a[1], a[2], 0.05, 0.7); }
          // That row drawn large: the true values as a faint curve; at 4 bits each block of six values is scaled to its
          // largest and every value drops to the nearest of the sixteen NF4 levels — a lit staircase, the gaps marked; in
          // BF16 the values stay on the curve, lit.
          const N = 24, x0 = cx - 1.75, x1 = cx + 1.75, base = 1.75, amp = 0.95, z = 0.6, dx = (x1 - x0) / N;
          const row = (uv(pick) * 0.5) * 3, field = (a: number) => 0.55 * Math.sin(a * 1.9 + 0.4) * Math.cos(row * 1.5 - 0.3) + 0.3 * Math.sin((a + row) * 2.4 + 1.1) + 0.12 * Math.sin(a * 5.1 - row * 3.3);
          const xs = (i: number) => x0 + (i + 0.5) * dx, val = (i: number) => field(((i + 0.5) / N - 0.5) * 3);
          const pa = at(-1, uv(pick)), pb = at(1, uv(pick));
          for (const [a, b] of [[pa, [x0, base + amp, z]], [pb, [x1, base + amp, z]]]) for (let q = 0.08; q < 0.95; q += 0.07) plain(mix(a[0], b[0], q), mix(a[1], b[1], q), mix(a[2], b[2], q), 0.016, 0.4);
          for (let i = 0; i < N * 4; i++) { const a = i / (N * 4), b = (i + 1) / (N * 4); seg(mix(x0, x1, a), base + amp * field((a - 0.5) * 3), z, mix(x0, x1, b), base + amp * field((b - 0.5) * 3), z, k ? 0.5 : 0.28); }
          let prev = NaN;
          for (let b0 = 0; b0 < N; b0 += 6) {
            let top = 1e-6;
            for (let i = b0; i < b0 + 6; i++) top = Math.max(top, Math.abs(val(i)));
            if (!k) {
              for (const level of NF4) seg(xs(b0) - dx / 2, base + amp * top * level, z - 0.01, xs(b0 + 5) + dx / 2, base + amp * top * level, z - 0.01, 0.14);
              if (b0) seg(xs(b0) - dx / 2, base - amp, z, xs(b0) - dx / 2, base + amp, z, 0.3);
            }
            for (let i = b0; i < b0 + 6; i++) {
              const value = val(i), y = base + amp * value;
              if (k) { lit(xs(i), y, z, 0.075, 1); continue; }
              const held = base + amp * top * NF4.reduce((best, level) => (Math.abs(level - value / top) < Math.abs(best - value / top) ? level : best), NF4[0]);
              if (!Number.isNaN(prev)) run(xs(i) - dx / 2, prev, xs(i) - dx / 2, held, z, 0.04, 0.9);
              run(xs(i) - dx / 2, held, xs(i) + dx / 2, held, z, 0.04, 0.95);
              seg(xs(i), y, z + 0.01, xs(i), held, z + 0.01, 0.7);
              plain(xs(i), y, z, 0.05, 0.45);
              prev = held;
            }
          }
          // The choices: letters fixed in their slots; the answer's letter ringed (the loss is taken on it alone).
          const slots = [-0.9, -0.3, 0.3, 0.9].map((d) => cx + d), goldAt = k ? spot[3] : 3;
          slots.forEach((x) => plain(x, -0.2, 1.4, 0.15, 0.9));
          const gx = mix(slots[0], slots[3], goldAt / 3);
          for (let m = 0; m < 36; m++) { const a = m / 36 * Math.PI * 2; (k ? lit : plain)(gx + 0.17 * Math.cos(a), -0.2 + 0.17 * Math.sin(a), 1.4, 0.024, 1); }
        });
      }
      C.end();
      renderer.render(scene, camera);

      // Words.
      for (const l of labels) place(l.el, l.at, w, h, grow);
      panels.forEach((pn, k) => LETTERS.forEach((_, m) => {
        const { cx, out } = pn, x = cx - 1.5 * BAR_GAP + m * BAR_GAP, xw = cx - 1.5 * BAR_GAP + slotOf(pn, m) * BAR_GAP;
        place(letters[k][m], [x, out.y - 0.06, 0.3], w, h, grow); place(words[k][m], [xw, out.y - 0.06, 0.3], w, h, grow);
        place(chances[k][m], [xw, out.y + barTop(out, m) + 0.2, 0.3], w, h, grow); place(marks[k][m], [xw, out.y - 0.06, 0.3], w, h, grow);
        if (pn.orders) words[k][m].style.marginTop = `${(-14 * lift4[m]).toFixed(1)}px`;
        words[k][m].classList.toggle("is-lit", (!!out.lit && m === out.pick) || out.fed === m);
      }));
      for (const { cx, el } of ocrBlocks) place(el, [cx + OCR_AT.dx, OCR_AT.y, OCR_AT.z], w, h, grow);
      if (stage === "bits") [-1, 1].forEach((pc, k) => {
        const slots = [-0.9, -0.3, 0.3, 0.9].map((d) => pc * 2.35 + d);
        slots.forEach((x, m) => {
          place(letters[k][m], [x, -0.33, 1.4], w, h, grow);
          place(words[k][m], [k ? mix(slots[0], slots[3], spot[m] / 3) : x, -0.33, 1.4], w, h, grow);
          words[k][m].classList.toggle("is-lit", k === 1);
          words[k][m].style.marginTop = `${(-16 * (k ? lift[m] : 0)).toFixed(1)}px`;
        });
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); theme.disconnect(); watch.disconnect(); image.onload = null;
      C.dispose(); texture.dispose(); photoMat.dispose(); plane.dispose(); renderer.dispose(); renderer.domElement.remove(); overlay.replaceChildren();
    };
  }, [stage, photo]);
  return <div className="m3" ref={host} role="img" aria-label={ARIA[stage]}>
    {flat && (fallback ?? <ModelAnatomy photo={photo.src} />)}
    <div className="m3-tags" ref={tags} aria-hidden="true" />
  </div>;
}
