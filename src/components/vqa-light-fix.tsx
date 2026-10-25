"use client";

import type { ReactNode } from "react";
import { B, LOOP, LightFigure, TILE, clamp, ease, mix, mixV, tileLit, turn, type Pen, type Shot, type Tag, type V3 } from "@/components/vqa-light";
import {
  ANSWERS, CLOCK_AGAIN, CLOCK_BASE, CLOCK_WORDS, DOOR_WORDS, F_CLOCK, F_DOOR, LETTERS, SIGN_WORDS, VOTES_ADDED, VOTES_FIRST,
  after, before, encoder, field, nf4, shuffleAt, shuffleLift, state, stateTags, tokens,
} from "@/components/vqa-light-steps";

// VQA 04 · 05 · 06 in light (chosen 2026-10-25 after the first light trial, src/components/vqa-light-steps.tsx, read
// "의미가 잘 안읽혀"): each picture draws what its step changed, large, and its reason.
// - 앙상블: a ballot, one row per model and one column per letter: three rows, then four more lit; each model's vote
//   sits in its row under its letter, and the count is the picture's largest figure, a 2 : 1 b turning into a 3 : 4 b.
// - BF16 · 순서 섞기: the same frozen W twice, solid columns in terraces under 4 bits and a smooth sheet under BF16,
//   coloured by value, each headed by what training gained on the team's own validation questions: 4B +72 · 8B +34 ·
//   32B ≈0 under 4 bits and a fixed order, the two 27B +41 · +11 under BF16 with the order shuffled. The two causes'
//   shares are not split, as the records do not split them.
// - 불확실 문항: 24 real test questions as cards, their first two shares under each; only the clock's stand level, and
//   it alone goes down to be scored again on its own clock, enlarged.
// Facts as on the step's other figures (src/components/vqa-model-3d.tsx, src/components/vqa-parts.tsx).

const label = (text: ReactNode, at: V3, more: Partial<Tag> = {}): Tag => ({ text, at: () => at, ...more });
const letters = (xs: number[], y: number, dim: number[] = []): Tag[] => LETTERS.map((k, m) => label(<b>{k}</b>, [xs[m], y - 0.12, 0], { align: "below", cls: "vl-letter", dim: dim.includes(m) }));
const words = (list: string[], xs: (s: number, m: number) => number, y: number, dim: number[] = [], lift: (s: number, m: number) => number = () => 0): Tag[] => list.map((w, m) => ({ text: w, at: (s) => [xs(s, m), y - 0.5 + lift(s, m), 0], align: "below", cls: "vl-word", dim: dim.includes(m) }));
const floor = (pen: Pen, x0: number, x1: number, y: number) => pen.line([x0, y - 0.04, 0], [x1, y - 0.04, 0], pen.ink, 0.3);
const shotOf = (x0: number, x1: number, y0: number, y1: number, yaw = -0.12, tilt = 0.1): Shot => ({ target: [(x0 + x1) / 2, (y0 + y1) / 2, 0], yaw, tilt, bounds: [[x0, y0, 0], [x1, y0, 0], [x0, y1, 0], [x1, y1, 0]] });

/* ---------- 04 앙상블 ---------- */
// A ballot: one row per model (its lane of light from the token sheet's edge to its node), one column per letter; each
// model puts its one vote in its own row under the letter it chose, so a column read down is that letter's count. The
// three first on top; the four added below, lit.
const V = { X0: 1.25, X1: 3.4, TOP: B.cy + 1.3, GAP: 0.4, BX: 4.5, BG: 1.15 };
const laneY = (k: number) => V.TOP - k * V.GAP, FLOOR = laneY(6) - 0.38;
const vX = (m: number) => V.BX + m * V.BG;
// Which model cast which vote is not drawn: in each group the rows stand in the order of their votes (the counts are the
// records': a 2 · b 1, then a 3 · b 4 with the four added).
const VOTES = [...[...VOTES_FIRST].sort(), ...[...VOTES_ADDED].sort()];

function drawVoteFix(s: number, pen: Pen) {
  const f = F_DOOR, t = turn(s);
  encoder(pen, s, 0.25); tokens(pen, f, 0, [26, 46], undefined, 0.4, false);
  const edge = [B.TX + B.TW / 2 + 0.05, B.cy, 0];
  VOTES.forEach((vote, k) => {
    const added = k >= 3, a = added ? t : 1, ghost = added ? 0.07 * (1 - t) : 0, y = laneY(k);
    pen.route([edge, [V.X1 - 0.11, y, 0]], "data", { a: (added ? 0.6 : 0.45) * a + ghost, speed: a > 0.02 ? 0.36 : undefined, offset: k * 0.17, lights: 2, bend: 0.08 });
    for (let n = 0; n < 22; n++) { const q = n / 22 * Math.PI * 2; (added ? pen.lit : pen.dot)(V.X1 + 0.09 * Math.cos(q), y + 0.09 * Math.sin(q), 0, 0.026, pen.ink, Math.max(a, ghost * 4)); }
    // Along its row to its vote; the other cells of the row faint.
    for (let m = 0; m < 4; m++) if (m !== vote) pen.dot(vX(m), y, 0, TILE, pen.ink, 0.07, 2);
    const cell = [vX(vote), y, 0];
    pen.route([[V.X1 + 0.11, y, 0], [cell[0] - 0.16, y, 0]], "data", { a: added ? 0.6 * a : 0.3, speed: added ? 0.5 : undefined, offset: k * 0.11 });
    if (added) tileLit(pen, cell, TILE * 1.2, pen.ink, 0.95 * a); else pen.dot(cell[0], cell[1], cell[2], TILE * 1.2, pen.ink, 0.62, 2);
  });
  floor(pen, vX(0) - 0.4, vX(3) + 0.4, FLOOR + 0.04);
}
const VOTE_FIX_TAGS: Tag[] = [
  ...stateTags([V.X0 - 0.15, V.TOP + 1.35, 0], state("모델 3개의 다수결", "32B · Gemma 4 · 8B"), state("모델 7개의 다수결", "답이 갈린 434문항에서 4개를 더해")),
  label("처음 3개", [V.X0 - 0.3, laneY(1), 0], { align: "end", dim: true }),
  { text: "더한 4개", at: () => [V.X0 - 0.3, (laneY(3) + laneY(6)) / 2, 0], fade: after, align: "end", dim: true },
  { text: <><b>a 2</b><span>:</span><b>1 b</b></>, at: () => [(vX(0) + vX(1)) / 2, V.TOP + 0.4, 0], fade: before, align: "above", cls: "vl-tally" },
  { text: <><b>a 3</b><span>:</span><b>4 b</b></>, at: () => [(vX(0) + vX(1)) / 2, V.TOP + 0.4, 0], fade: after, align: "above", cls: "vl-tally" },
  ...letters([0, 1, 2, 3].map(vX), FLOOR, [2, 3]),
  ...words(DOOR_WORDS, (_s, m) => vX(m), FLOOR, [2, 3]),
  { text: "고른 답", at: () => [vX(0), FLOOR - 1.12, 0], fade: before, align: "below", cls: "vl-mark" },
  { text: "고른 답", at: () => [vX(1), FLOOR - 1.12, 0], fade: after, align: "below", cls: "vl-mark" },
];

/* ---------- 05 BF16 · 순서 섞기 ---------- */
// The same frozen W twice, side by side, seen from above and in front, each weight a height over a base. On the left,
// held in 4 bits: every block of six along a row scaled to its largest weight and each weight fallen to the nearest of
// NF4's sixteen levels, one solid column per weight, packed with no gap, so the hills become terraces, block by block,
// and each row a staircase. On the right, in BF16: the same hills as one smooth solid sheet. Both take their values'
// colour, and on the light stage their front edges glow in it (the shot's `glow`). The landscape is a smooth
// example so that the terraces read as terraces (real weights are not smooth), a picture near the fact rather than the
// weights themselves. On each, LoRA's B runs along the left edge and A along the back, one line each over the top, the
// same on both. Under each the four choices: the answer always at d under 4 bits, trading places one pair at a time under BF16.
const P = { N: 12, PITCH: 0.27, Y: 1.6, H: 0.62, BLOCK: 6 }, BASE = -P.H * 1.03;
const ZF = (P.N / 2) * P.PITCH, TOP = P.Y + P.H + 0.18, CY = P.Y + BASE - 0.75, HALF_X = (P.N / 2) * P.PITCH + 0.42;
const cSlot = (cx: number, m: number) => cx + (m - 1.5) * 0.82;
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));
// The point over column i (0 at the left; fractions between), row j (0 at the back) of the W centred at cx, at height h.
const plate = (cx: number, i: number, j: number, h = 0) => [cx + (i - (P.N - 1) / 2) * P.PITCH, P.Y + h, (j - (P.N - 1) / 2) * P.PITCH];
const weight = (i: number, j: number) => field((i / (P.N - 1) - 0.5) * 2.6, (j / (P.N - 1) - 0.5) * 2.6);
// Held in 4 bits: scaled to the largest weight of its block of six along the row, then the nearest NF4 level.
const held = (i: number, j: number) => {
  const b0 = Math.floor(i / P.BLOCK) * P.BLOCK;
  let top = 1e-6;
  for (let k = b0; k < b0 + P.BLOCK; k++) top = Math.max(top, Math.abs(weight(k, j)));
  return top * nf4(weight(i, j) / top);
};
// Each loop the columns settle onto their levels, from the front row back, and let go of them at the end.
const settled = (s: number, j: number) => {
  const t = ((s % LOOP) + LOOP) % LOOP, d = (P.N - 1 - j) * 0.07;
  return span(t, 0.4 + d, 1.3 + d) * (1 - span(t, 7.8 + d * 0.4, 8.5 + d * 0.4));
};
// The weights' colour is their value, soft: blue below nothing and raspberry (the site's accent) above, the ink's grey at
// nothing, only far enough to tell the levels apart ("너무 쨍한색을 쓰지 말고 … 연한쪽으로"). Height and colour say the
// same, so under 4 bits a block's levels come out twice, as terraces and as bands of colour.
const HUE = { neg: [[0.29, 0.45, 0.69], [0.44, 0.58, 0.84]], pos: [[0.753, 0.267, 0.4], [0.851, 0.267, 0.275]] };
const TINT = 0.6, PALE = 0.45;
const lean = (v: number) => Math.min(1, Math.abs(v)) ** 0.7;
const hueOf = (pen: Pen, v: number) => HUE[v < 0 ? "neg" : "pos"][pen.dark ? 1 : 0];
// The weight's deep colour, for its edges and lines: the ink at nothing; toward its hue as far as it leans (on the light
// stage the hue a little darkened, as far as it goes).
const inkOf = (pen: Pen, v: number) => (pen.dark ? mixV(pen.ink, hueOf(pen, v), TINT * lean(v)) : mixV(pen.ink, mixV(hueOf(pen, v), pen.ink, 0.25), lean(v)));
// A face `k` of the way into its shade. On the dark stage, up from the stage to the weight's colour; on the light one,
// down from a pale wash of its hue (the stage's grey at nothing) to its deep colour, so a shade stays its hue, not grey.
const shadeOf = (pen: Pen, k: number, v = 0) => {
  const deep = inkOf(pen, v);
  if (pen.dark) return mixV(pen.ground, deep, k);
  return mixV(mixV(mixV(pen.ground, pen.ink, 0.06), mixV(pen.ground, hueOf(pen, v), PALE), lean(v)), deep, k);
};
// What spreads round a shining edge on the light stage: its hue as far as the weight leans to it, nothing at nothing.
const glowOf = (pen: Pen, v: number) => mixV(pen.ground, hueOf(pen, v), lean(v));

function drawBitsFix(s: number, pen: Pen) {
  const dk = pen.dark, solid = [1, 1, 1, 1], yb = P.Y + BASE, e = 0.004;
  const face = (q: number[][], k: number, v = 0) => pen.quad(q[0], q[1], q[2], q[3], shadeOf(pen, k, v), solid);
  // Tops lighter the higher they stand; fronts and sides deeper.
  const topK = (v: number) => (dk ? 0.38 + 0.5 * (v + 1) / 2 : 0.34 - 0.24 * (v + 1) / 2), frontK = dk ? 0.14 : 0.66, sideK = dk ? 0.24 : 0.5;
  const edge = dk ? 0.9 : 1, faint = dk ? 0.35 : 0.42;
  const [L, R] = [-HALF_X, HALF_X];
  // LoRA on each: B along the left edge and A along the back, one line each over the top, light running along them.
  for (const cx of [L, R]) {
    const b0 = plate(cx, -1, -0.5), b1 = plate(cx, -1, P.N - 0.5), a0 = plate(cx, -0.5, -1), a1 = plate(cx, P.N - 0.5, -1);
    pen.line([b0[0], TOP, b0[2]], [b1[0], TOP, b1[2]], pen.ink, 0.7); pen.line([a0[0], TOP, a0[2]], [a1[0], TOP, a1[2]], pen.ink, 0.7);
    for (let n = 0; n < 2; n++) {
      const q = ((s * 0.25 + n * 0.5) % 1);
      pen.lit(mix(b0[0], b1[0], q), TOP, mix(b0[2], b1[2], q), 0.06, pen.ink, 0.9); pen.lit(mix(a0[0], a1[0], q), TOP, mix(a0[2], a1[2], q), 0.06, pen.ink, 0.9);
    }
  }
  // 4 bits: one column per weight in its value's colour; the outline of each top, its front edge heavy and shining, so
  // the rows read as staircases.
  const hw = P.PITCH / 2;
  for (let j = 0; j < P.N; j++) for (let i = 0; i < P.N; i++) {
    const v = mix(weight(i, j), held(i, j), settled(s, j)), c = plate(L, i, j, P.H * v), tone = inkOf(pen, v);
    const x0 = c[0] - hw, x1 = c[0] + hw, y = c[1], z0 = c[2] - hw, z1 = c[2] + hw;
    face([[x0, y, z0], [x0, y, z1], [x0, yb, z1], [x0, yb, z0]], sideK, v);
    face([[x1, y, z0], [x1, y, z1], [x1, yb, z1], [x1, yb, z0]], sideK, v);
    face([[x0, y, z1], [x1, y, z1], [x1, yb, z1], [x0, yb, z1]], frontK, v);
    face([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], topK(v), v);
    pen.shine([x0, y + e, z1 + e], [x1, y + e, z1 + e], tone, edge, glowOf(pen, v));
    pen.line([x0 - e, y + e, z0], [x0 - e, y + e, z1], tone, faint); pen.line([x1 + e, y + e, z0], [x1 + e, y + e, z1], tone, faint);
  }
  // BF16: the same landscape, one smooth sheet at twice the grid in its values' colour, shaded by its slope (light from
  // the left and behind), walled down to the base on its four sides, its rows drawn across it, its front edge shining.
  const hAt = (i: number, j: number) => P.H * weight(i, j), at = (i: number, j: number) => plate(R, i, j, hAt(i, j));
  const lit = (i: number, j: number) => clamp(0.5 + 1.5 * (hAt(i - 0.25, j) - hAt(i + 0.25, j)) * 2 + 1.5 * (hAt(i, j - 0.25) - hAt(i, j + 0.25)) * 2);
  const sheetK = (i: number, j: number) => (dk ? 0.3 + 0.55 * lit(i, j) : 0.42 - 0.34 * lit(i, j));
  const lo = -0.5, hi = P.N - 0.5, st = 0.5;
  const ground = (i: number, j: number) => plate(R, i, j, BASE);
  for (let i = lo; i < hi - 1e-6; i += st) {
    face([at(i, hi), at(i + st, hi), ground(i + st, hi), ground(i, hi)], frontK, weight(i + st / 2, hi));
    face([at(i, lo), at(i + st, lo), ground(i + st, lo), ground(i, lo)], frontK, weight(i + st / 2, lo));
  }
  for (let j = lo; j < hi - 1e-6; j += st) {
    face([at(lo, j), at(lo, j + st), ground(lo, j + st), ground(lo, j)], sideK, weight(lo, j + st / 2));
    face([at(hi, j), at(hi, j + st), ground(hi, j + st), ground(hi, j)], sideK, weight(hi, j + st / 2));
  }
  for (let j = lo; j < hi - 1e-6; j += st) for (let i = lo; i < hi - 1e-6; i += st)
    face([at(i, j), at(i + st, j), at(i + st, j + st), at(i, j + st)], sheetK(i + st / 2, j + st / 2), weight(i + st / 2, j + st / 2));
  for (let j = 0; j < P.N; j++) {
    let last: number[] | null = null;
    for (let q = 0; q <= (hi - lo) * 4; q++) { const c = at(lo + q / 4, j); c[1] += e; if (last) pen.line(last, c, inkOf(pen, weight(lo + q / 4, j)), faint); last = c; }
  }
  let last: number[] | null = null;
  for (let q = 0; q <= (hi - lo) * 4; q++) { const c = at(lo + q / 4, hi); c[1] += e; c[2] += e; if (last) pen.shine(last, c, inkOf(pen, weight(lo + q / 4, hi)), edge, glowOf(pen, weight(lo + q / 4, hi))); last = c; }
  // The four choices under each; the answer's letter ringed, fixed at d under 4 bits, moving with its word under BF16.
  [L, R].forEach((cx, k) => {
    for (let m = 0; m < 4; m++) pen.dot(cSlot(cx, m), CY, ZF, TILE * 1.6, pen.ink, 0.55, 2);
    const gx = mix(cSlot(cx, 0), cSlot(cx, 3), (k ? shuffleAt(s, 3) : 3) / 3);
    for (let n = 0; n < 44; n++) { const a = n / 44 * Math.PI * 2; pen.lit(gx + 0.34 * Math.cos(a), CY + 0.34 * Math.sin(a), ZF, 0.032, pen.ink, 0.95); }
  });
}
const halfTag = (cx: number, name: string, sub: string, gain: string): Tag =>
  label(<><b>{name}</b><span>{sub} · 자체 검증 <em>{gain}</em></span></>, [cx, TOP + 0.42, plate(cx, 0, -1.3)[2]], { align: "above", cls: "vl-size is-center" });
const choiceSet = (cx: number, moving: boolean): Tag[] => [
  ...LETTERS.map((k, m) => label(<b>{k}</b>, [cSlot(cx, m), CY, ZF], { align: "center", cls: "vl-letter vl-in" })),
  ...SIGN_WORDS.map((w, m): Tag => ({ text: w, at: (s) => [moving ? mix(cSlot(cx, 0), cSlot(cx, 3), shuffleAt(s, m) / 3) : cSlot(cx, m), CY - 0.44 + (moving ? shuffleLift(s, m) : 0), ZF], align: "below", cls: "vl-word" })),
];
const BITS_FIX_TAGS: Tag[] = [
  halfTag(-HALF_X, "4비트(NF4)로 학습", "4B · 8B · 32B", "+72 · +34 · ≈0"),
  halfTag(HALF_X, "BF16으로 학습", "27B 두 모델", "+41 · +11"),
  label("같은 동결된 W · LoRA B · A(r 16)", [0, TOP + 0.06, plate(0, 0, -1.3)[2]], { align: "above", dim: true }),
  label("보기 순서 고정 · 정답 300m는 늘 d", [-HALF_X, CY + 0.48, ZF], { align: "above", dim: true }),
  label("보기 순서 섞기 · 학습할 때마다 24가지 중 하나", [HALF_X, CY + 0.48, ZF], { align: "above", dim: true }),
  ...choiceSet(-HALF_X, false), ...choiceSet(HALF_X, true),
];
const BITS_SHOT: Shot = {
  target: [0, P.Y - 0.2, 0.3], yaw: -0.03, tilt: 0.42, glow: 1.3,
  bounds: [[-HALF_X * 2 - 0.1, P.Y + BASE, ZF], [HALF_X * 2 + 0.1, P.Y + BASE, ZF], [-HALF_X * 2 - 0.1, TOP + 1.0, -ZF - 0.4], [HALF_X * 2 + 0.1, TOP + 1.0, -ZF - 0.4], [-3.6, CY - 0.95, ZF], [3.6, CY - 0.95, ZF]],
};

/* ---------- 06 불확실 문항: the clock ---------- */
// The question asks what time the clock on the lamp post shows, so the answer is drawn on that clock: its face is the
// photo's patches inside the clock's box, enlarged, in their own colour, and on it one hour hand per choice (8, 10, 7
// and 9 o'clock, all at ten past, so one minute hand serves them all), each a column of tiles as long as the mean chance
// the models give it. At first the face is coarse and the 9 and 10 o'clock hands stand nearly level (d 39.8% · b 35.8%,
// the shares written by the choices, 0.1 apart in log, under the 2.0 that picks a question; a dotted arc at the longer
// one's reach shows how little the other falls short); the three models' own answers sit on the rim at 9, 9 and 10.
// Then this question alone is scored again: the face's patches split finer (2× · 3×), light runs out along the hands
// four times, once per order of the choices, from the models trained again on all the data, and the 10 o'clock hand
// comes out on top; the first lengths stay as ghosts. The four orders' own chances are not kept, only their mean, so the
// hands move once. The face's patch counts keep the ratio of the enlargements (1 : 2 : 3), not the model's own counts.
// The clock is drawn at any size and place (a dial frame), its face from any box of the picture.
type Dial = { X: number; Y: number; R: number; face?: [number, number, number, number] };
const HOURS = [8, 10, 7, 9];
const unit = (d: Dial) => d.R / 2.3;
const onDial = (d: Dial, hour: number, r: number, z = 0): V3 => { const q = Math.PI / 2 - 2 * Math.PI * hour / 12; return [d.X + Math.cos(q) * r, d.Y + Math.sin(q) * r, z]; };
// A hand's length in tiles (a fraction at its tip), as long as its chance, the longest near the rim.
const HUB = 0.34, HSTEP = 0.25, HTILE = 0.21;
const handOf = (p: number) => p / 0.42 * (2.3 - 0.42 - HUB) / HSTEP;
const reach = (d: Dial, n: number) => (HUB + n * HSTEP) * unit(d);
const phase = (s: number) => ((s % LOOP) + LOOP) % LOOP;
const back = (q: number) => 1 - span(q, 7.6, 8.6);
// The clock enlarged (2.4–3.4 s), measured again four times (3.4–5.4 s), held, and back.
const zoomAt = (s: number) => span(phase(s), 2.4, 3.4) * back(phase(s)), againAt = (s: number) => span(phase(s), 3.4, 5.4) * back(phase(s));
const chanceAt = (s: number, m: number) => mix(CLOCK_BASE[m], CLOCK_AGAIN[m], againAt(s));
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
// The face: the photo's patches inside the clock's box, n across, round, in their own colour.
function faceAt(pen: Pen, d: Dial, n: number, a: number) {
  const box = d.face ?? F_CLOCK.pic.box!, cols = Math.round(n / (box[2] - box[0])), rows = Math.round(n / (box[3] - box[1])), g = pen.shade(cols, rows);
  if (!g || a < 0.01) return;
  const i0 = Math.floor(box[0] * cols), j0 = Math.floor(box[1] * rows), cell = 2 * d.R / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5 - n / 2) * cell, y = (n / 2 - j - 0.5) * cell;
    if (Math.hypot(x, y) > d.R - cell * 0.4) continue;
    const k = ((j0 + j) * cols + i0 + i) * 3, c = [g[k], g[k + 1], g[k + 2]].map((v) => v * (pen.dark ? 0.5 : 1));
    pen.dot(d.X + x, d.Y + y, -0.08, cell * (n > 20 ? 1.12 : 0.92), c, a, 2);
  }
}

function drawDial(s: number, pen: Pen, d: Dial) {
  const q = phase(s), z = zoomAt(s), g = againAt(s), u = unit(d);
  // The face at 1×, then 2× and 3× as many patches across.
  faceAt(pen, d, 12, 1 - clamp(z * 2)); faceAt(pen, d, 24, clamp(z * 2) * clamp(2 - z * 2)); faceAt(pen, d, 36, clamp(z * 2 - 1));
  // The rim, its hour marks, the minute hand all four choices share (ten past) and the hub.
  for (let n = 0; n < 180; n++) { const t = n / 180 * Math.PI * 2; pen.dot(d.X + d.R * Math.cos(t), d.Y + d.R * Math.sin(t), 0, 0.028 * u, pen.ink, 0.6); }
  for (let h = 0; h < 12; h++) for (let r = d.R + 0.08 * u; r < d.R + (h % 3 ? 0.18 : 0.28) * u; r += 0.045 * u) { const at = onDial(d, h, r, 0.01); pen.dot(at[0], at[1], at[2], 0.04 * u, pen.ink, 0.8, 0); }
  for (let k = 0; k < 9; k++) { const at = onDial(d, 2, (HUB + 0.1 + k * 0.17) * u, 0.01); pen.dot(at[0], at[1], at[2], 0.06 * u, pen.ink, 0.5, 0); }
  for (let n = 0; n < 20; n++) { const t = n / 20 * Math.PI * 2; pen.dot(d.X + 0.13 * u * Math.cos(t), d.Y + 0.13 * u * Math.sin(t), 0.01, 0.03 * u, pen.ink, 0.9); }
  // The hour hands, one per choice, as long as its chance (the tip tile as large as the fraction left); the first
  // lengths left as ghosts once measured again, and light running out along each hand once per order of the choices.
  const pick = g < 0.5 ? 3 : 1, round = (q - 3.4) / 0.5;
  HOURS.forEach((hour, m) => {
    const n = handOf(chanceAt(s, m)), was = handOf(CLOCK_BASE[m]), h = hour + 10 / 60;
    for (let k = 0; k < Math.ceil(Math.max(n, was)); k++) {
      const at = onDial(d, h, (HUB + (k + 0.5) * HSTEP) * u, 0.02), part = clamp(n - k), size = HTILE * u * Math.max(0.4, part);
      if (part <= 0.05) pen.dot(at[0], at[1], at[2], HTILE * u * Math.max(0.4, clamp(was - k)), pen.ink, 0.16 * g, 2);
      else if (m === pick) tileLit(pen, at, size, pen.ink, 0.95);
      else pen.dot(at[0], at[1], at[2], size, pen.ink, (m === 1 || m === 3 ? 0.66 : 0.42) * (pen.dark ? 0.55 : 1), 2);
    }
    if (round >= 0 && round < 4) { const at = onDial(d, h, (HUB + (round % 1) * n * HSTEP) * u, 0.04); pen.lit(at[0], at[1], at[2], 0.09 * u, pen.ink, Math.sin(Math.PI * (round % 1))); }
  });
  // How nearly level the two longest stand: an arc at the 9 o'clock hand's reach, through the 10 o'clock one's.
  const arc = 1 - clamp(z * 2), r9 = reach(d, handOf(CLOCK_BASE[3]));
  for (let t = 9 + 10 / 60 - 0.1; t <= 10 + 10 / 60 + 0.15; t += 0.03) { const at = onDial(d, t, r9, 0.02); pen.dot(at[0], at[1], at[2], 0.032 * u, pen.ink, 0.9 * arc); }
  // The three models' own answers on the rim: 9, 9 and 10 o'clock.
  ANSWERS.forEach((m, k) => { const at = onDial(d, HOURS[m] + 10 / 60 + (k === 1 ? 0.25 : 0), d.R - 0.16 * u, 0.01); pen.lit(at[0], at[1], at[2], 0.07 * u, pen.ink, 1 - clamp(z * 2)); });
}
const shift = (at: V3, dy: number): V3 => [at[0], at[1] + dy, 0];
// The dial's own words: each choice at its hour outside the rim with its share (first, then measured again), which was
// picked first and which after, and the count of the orders.
function dialTags(d: Dial): Tag[] {
  const u = unit(d), rim = (m: number) => onDial(d, HOURS[m] + 10 / 60, d.R + 0.42 * u);
  const hour = (m: number, p: number, fade: (s: number) => number): Tag =>
    ({ text: <><b>{LETTERS[m]}</b><span>{CLOCK_WORDS[m]}</span><em>{pct(p)}</em></>, at: () => rim(m), fade, align: "end", cls: "vl-hour", dim: m === 0 || m === 2 });
  return [
    ...HOURS.flatMap((_h, m) => [hour(m, CLOCK_BASE[m], (s) => 1 - againAt(s)), hour(m, CLOCK_AGAIN[m], againAt)]),
    { text: "처음 고른 답", at: () => shift(rim(3), -0.3 * u), fade: (s) => 1 - againAt(s), align: "end", cls: "vl-mark" },
    { text: "다시 채점한 답", at: () => shift(rim(1), 0.42 * u + 0.1), fade: againAt, align: "end", cls: "vl-mark" },
    ...[1, 2, 3, 4].map((k): Tag => ({ text: `보기 순서 ${k}/4`, at: () => [d.X, d.Y - d.R - 0.36 * u, 0], fade: (s) => { const r = (phase(s) - 3.4) / 0.5 - (k - 1); return r > 0 && r < 1 ? 1 : 0; }, align: "below", cls: "vl-mark is-gold" })),
  ];
}

/* ---------- 06 불확실 문항: the cards ---------- */
// The step as it ran on real questions: 24 test questions as cards, each its photo with two bars under it, the shares
// the three trained models gave the first and the second choice. Twenty-three were drawn at random from those the
// cascade left alone: one bar full, the other next to nothing, settled at once. The clock question's two bars stand
// nearly level (39.8% · 35.8%): it alone lights up and goes down to be scored again, on its clock, enlarged 2× · 3×,
// over the four orders, by the models trained again on all the data, and the 10 o'clock hand comes out on top. One card
// in twenty-four is the cascade's own share: 298 of 6,714 questions. The clock's face is the photo's own clock (its
// hands at ten past ten show once enlarged). The shares are the three members' log-mean from the VQA repository's
// records (exp/manu), the same that picked the 298; the photos are the contest's own test photos.
// The sheet: 24 cards of 90 × 120 (12 across, two down), then the clock's box enlarged to 240 × 240.
const SHEET = { COLS: 12, CARD: [18, 24], FACE: [1080 / 1320, 0, 1, 1] as [number, number, number, number], GRID: [264, 48] as [number, number] };
// The first two shares of each card, in slot order (the clock at slot 17).
const SHARES: [number, number][] = [
  [0.9997, 0.0002], [0.9999, 0.0001], [0.9999, 0], [0.9989, 0.0009], [0.9985, 0.0009], [1, 0], [0.9999, 0], [1, 0], [0.9996, 0.0004], [0.9998, 0.0001], [1, 0], [0.9996, 0.0002],
  [0.9996, 0.0002], [0.9967, 0.0015], [0.9999, 0], [0.9999, 0], [0.9964, 0.0031], [0.3976, 0.3578], [0.9976, 0.0017], [1, 0], [0.9441, 0.0542], [0.9998, 0.0001], [0.9998, 0.0002], [0.9984, 0.0014],
];
const CLOCK_SLOT = 17;
const CD = { X0: -3.85, PITCH: 0.7, W: 0.56, H: 0.75, ROW1: 4.45, ROW2: 3.35, BAR: 0.05 };
const cardAt = (k: number) => [CD.X0 + (k % SHEET.COLS) * CD.PITCH, k < SHEET.COLS ? CD.ROW1 : CD.ROW2];
const CARDS_DIAL: Dial = { X: cardAt(CLOCK_SLOT)[0], Y: 0.2, R: 1.75, face: SHEET.FACE };
// Every card shows (0–0.5 s) and is scored once (0.5–1.4 s); the settled ones fall back, the clock's lights (1.4–2.0 s)
// and goes down (1.8–2.4 s); the clock is scored again (2.4–5.4 s, as above); the share of all comes in (5.0–5.5 s).
const showAt = (s: number) => span(phase(s), 0, 0.5) * back(phase(s)), scoreAt = (s: number) => span(phase(s), 0.5, 1.4) * back(phase(s));
const pickAt = (s: number) => span(phase(s), 1.4, 2.0) * back(phase(s)), downAt = (s: number) => span(phase(s), 1.8, 2.4) * back(phase(s));
const shareAt = (s: number) => span(phase(s), 5.0, 5.5) * back(phase(s));

function drawCascadeCards(s: number, pen: Pen) {
  const show = showAt(s), score = scoreAt(s), pick = pickAt(s), down = downAt(s);
  const g = pen.shade(...SHEET.GRID), [cw, ch] = SHEET.CARD, tile = CD.W / cw, bright = pen.dark ? 0.62 : 1;
  const full = mixV(pen.ground, pen.ink, pen.dark ? 0.9 : 0.85), half = mixV(pen.ground, pen.ink, pen.dark ? 0.5 : 0.4), solid = [1, 1, 1, 1];
  for (let k = 0; k < 24; k++) {
    const [cx, cy] = cardAt(k), clock = k === CLOCK_SLOT, a = show * (clock ? 1 : 1 - 0.5 * pick);
    // The photo, its patches as tiles in their own colour.
    if (g) for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const gi = (k % SHEET.COLS) * cw + i, gj = Math.floor(k / SHEET.COLS) * ch + j, q = (gj * SHEET.GRID[0] + gi) * 3;
      pen.dot(cx + (i + 0.5 - cw / 2) * tile, cy + (ch / 2 - j - 0.5) * tile, 0, tile * 1.14, [g[q] * bright, g[q + 1] * bright, g[q + 2] * bright], a, 2);
    }
    // The first and second shares, growing as the card is scored.
    const left = cx - CD.W / 2, y0 = cy - CD.H / 2 - 0.08;
    [0, 1].forEach((r) => {
      const len = Math.max(0.012, SHARES[k][r] * CD.W * score), y = y0 - r * (CD.BAR + 0.035);
      pen.quad([left, y, 0], [left + len, y, 0], [left + len, y - CD.BAR, 0], [left, y - CD.BAR, 0], r ? half : full, solid.map((v) => v * a));
    });
    // The clock's card ringed in light once its two bars stand level.
    if (clock && pick > 0.01) {
      const x0 = left - 0.06, x1 = cx + CD.W / 2 + 0.06, yt = cy + CD.H / 2 + 0.06, yb = y0 - 2 * CD.BAR - 0.1;
      const edge = (p: number[], q: number[]) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.035); for (let t = 0; t < n; t++) pen.lit(mix(p[0], q[0], t / n), mix(p[1], q[1], t / n), 0.02, 0.028, pen.ink, pick); };
      edge([x0, yt], [x1, yt]); edge([x1, yt], [x1, yb]); edge([x1, yb], [x0, yb]); edge([x0, yb], [x0, yt]);
      pen.route([[cx, yb - 0.03, 0], onDial(CARDS_DIAL, 0, CARDS_DIAL.R + 0.32)], "data", { a: 0.85 * down, speed: down > 0.02 ? 0.45 : undefined, lights: 2 });
    }
  }
  drawDial(s, pen, CARDS_DIAL);
}
const cardsUnder = CD.ROW2 - CD.H / 2 - 0.08 - 2 * CD.BAR - 0.1;
const CASCADE_CARDS_TAGS: Tag[] = [
  label(<><b>확신 없는 문항만 다시 채점</b><span>test 문항 24개 · 사진 밑 두 막대 = 1등 · 2등 보기의 확률</span></>, [CD.X0 - CD.W / 2, CD.ROW1 + CD.H / 2 + 0.38, 0], { align: "start", cls: "vl-size" }),
  { text: <><b>나머지 23개: 1등이 압도</b><span>한 번 채점으로 확정</span></>, at: () => [cardAt(23)[0] + CD.W / 2, cardsUnder - 0.1, 0], fade: pickAt, align: "end", cls: "vl-gate is-end" },
  { text: <><b>1등 39.8% · 2등 35.8%</b><span>비슷함 → 이 문항만 다시 채점</span></>, at: () => [cardAt(CLOCK_SLOT)[0] - 0.25, cardsUnder - 0.1, 0], fade: pickAt, align: "end", cls: "vl-gate is-end" },
  { text: <><b>더 크게 · 네 번 다시</b><span>시계를 2배 · 3배 확대 · 보기 순서 4가지</span><span>전체 데이터로 다시 학습한 세 모델</span></>, at: () => [CARDS_DIAL.X + CARDS_DIAL.R + 0.55, CARDS_DIAL.Y + 0.55, 0], fade: zoomAt, align: "start", cls: "vl-gate" },
  { text: <><b>6,714문항 중 298문항(4.4%)만 이렇게</b><span>바뀐 답 25 · Public +6</span></>, at: () => [CARDS_DIAL.X + CARDS_DIAL.R + 0.55, CARDS_DIAL.Y - 0.75, 0], fade: shareAt, align: "start", cls: "vl-gate" },
  ...dialTags(CARDS_DIAL),
];

const ARIA = {
  vote: "언어 모델 자리에 모델이 한 줄씩 쌓인다. 처음 모델 3개가 a · b · a로 표를 내 a(흡연금지) 2 : b(출입금지) 1, 답이 갈린 문항에서 모델 4개를 더하자 a 3 : b 4로 b를 고른다.",
  bits: "같은 동결된 W 두 벌을 나란히, 값을 높이와 색(음수 파랑 · 양수 분홍)으로 그린다. 왼쪽은 4비트(NF4)로 학습(4B · 8B · 32B): 가중치마다 기둥 하나를 틈 없이 세우고, 행마다 여섯 개씩 블록의 최댓값에 맞춰 16단계로 떨어져 언덕이 계단식 단이 된다. 오른쪽은 BF16으로 학습(27B 두 모델): 같은 언덕이 매끈한 면이다. LoRA B · A는 판의 왼쪽 가장자리와 뒤 가장자리에 한 줄씩, 양쪽 같다. 보기는 4비트 쪽에서 정답 300m가 늘 d이고, BF16 쪽에서는 학습할 때마다 자리를 바꾸며 정답 글자도 따라간다. 자체 검증에서 학습으로 더 맞힌 문항: 4B +72 · 8B +34 · 32B 약 0, 27B 두 모델 +41 · +11.",
  cascade: "test 문항 24개를 카드로: 사진과 그 밑에 세 모델이 1등 · 2등 보기에 준 확률 막대 둘. 다시 채점 대상이 아닌 문항에서 무작위로 뽑은 23개는 1등 막대가 꽉 차고 2등은 거의 없어 그대로 확정된다. 가로등 시계 문항만 두 막대가 39.8% · 35.8%로 비슷해 빛나며 아래로 내려가, 시계를 2배 · 3배 확대하고 보기 순서 4가지와 다시 학습한 세 모델로 다시 채점된다. 시계판에서 9시와 10시 바늘이 거의 같다가 10시 바늘(40.3%)이 가장 길어진다. 전체로는 6,714문항 중 298문항(4.4%)만 이렇게 다시 채점했고, 바뀐 답은 25문항, Public은 +6문항이다.",
};
const STEPS = {
  vote: { draw: drawVoteFix, tags: VOTE_FIX_TAGS, shot: shotOf(-1.3, vX(3) + 0.6, FLOOR - 1.45, V.TOP + 1.6) },
  bits: { draw: drawBitsFix, tags: BITS_FIX_TAGS, shot: BITS_SHOT },
  cascade: { draw: drawCascadeCards, tags: CASCADE_CARDS_TAGS, shot: shotOf(-4.5, 5.2, -2.1, 5.55, -0.04, 0.04) },
};

export function VqaStepFix({ step, src, fallback }: { step: keyof typeof STEPS; src: string; fallback: ReactNode }) {
  const { draw, tags, shot } = STEPS[step];
  return <LightFigure key={`fix-${step}`} src={src} draw={draw} shot={shot} tags={tags} label={ARIA[step]} still={5.6} fallback={fallback} />;
}
