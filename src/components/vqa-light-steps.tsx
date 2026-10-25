"use client";

import type { ReactNode } from "react";
import { B, LOOP, LightFigure, STEP, TILE, clamp, cubic, ease, hash, mix, mixV, path, raw, rgbAt, structureTags, tileLit, turn, type Pen, type Rgb, type Shot, type Tag, type V3 } from "@/components/vqa-light";

// VQA 02 OCR 추가 drawn as 사진 확대 is (src/components/vqa-light.tsx): the photo's patches as tiles in their colour,
// the vision encoder's rings, the image tokens, the language model's rings, the chances as columns of tiles. The eleven
// lines the OCR model read are boxed on the photo and stream past the encoder, as the text they are, into one block of
// words that joins the input; the eight with nothing to do with the question flicker as noise. The chances barely move
// and the wrong letter stays first. Also the parts and the facts the other steps' pictures take (src/components/vqa-light-fix.tsx).
// Facts: as on the step's other figures (src/components/vqa-model-3d.tsx): the sign's chances without and with the OCR
// lines (c0_tune, O1_tune), the door sign's votes (test_1785: a b a; seven a 3 · b 4, so the four added gave a 1 · b 3),
// the clock's mean before and after (test_2233), NF4's sixteen levels. Grids where the step does not change the input are
// drawn at 26 patches across.

/* ---------- Photos and where they stand ---------- */
// A photo as drawn: its size, the band of it shown (v0–v1 of its height), the answer's place and, where the question
// asks about one thing on it, that thing's box (fractions of the photo).
export type Pic = { w: number; h: number; v0: number; v1: number; key: [number, number]; box?: [number, number, number, number] };
const SIGN: Pic = { w: 720, h: 960, v0: 12 / 36, v1: 26 / 36, key: [263 / 720, 571 / 960] };
const DOOR: Pic = { w: 720, h: 1280, v0: 458 / 1280, v1: 818 / 1280, key: [350 / 720, 638 / 1280], box: [0.285, 0.477, 0.688, 0.52] };
const CLOCK: Pic = { w: 720, h: 960, v0: 225 / 960, v1: 585 / 960, key: [299 / 720, 405 / 960], box: [0.364, 0.383, 0.467, 0.46] };
export type Grid = [number, number];

export function frameOf(pic: Pic) {
  const band = (pic.v1 - pic.v0) * pic.h / pic.w, vb = (v: number) => (v - pic.v0) / (pic.v1 - pic.v0), PH = B.PW * band, TH = B.TW * band;
  return {
    pic, PH, TH,
    place: (u: number, v: number) => [B.cx + (u - 0.5) * B.PW, B.cy + (0.5 - vb(v)) * PH, 0],
    token: (u: number, v: number) => [B.TX + (u - 0.5) * B.TW, B.cy + (0.5 - vb(v)) * TH, 0],
    inside: (u: number, v: number, x: number, radius: number) => [x, B.cy + (0.5 - vb(v)) * radius * 0.9, (u - 0.5) * radius * 1.6],
  };
}
export type Frame = ReturnType<typeof frameOf>;
export const F_SIGN = frameOf(SIGN), F_DOOR = frameOf(DOOR), F_CLOCK = frameOf(CLOCK);
export const rowsOf = (pic: Pic, n: number) => [Math.round(pic.v0 * n), Math.round(pic.v1 * n)];
// How far a place of the photo is through a split, nearest the answer first.
export const splitAt = (f: Frame, r: number, u: number, v: number) => ease(clamp(r * 1.9 - Math.min(1, Math.hypot((u - f.pic.key[0]) * f.pic.w / f.pic.h, v - f.pic.key[1]) / 0.6) * 0.9));
export const bend = (a: readonly number[], b: readonly number[], bow: number[], n = 24) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n, m = mixV(a, b, 0.5).map((v, i) => v + bow[i]); return mixV(mixV(a, m, t), mixV(m, b, t), t); });

/* ---------- The structure's parts ---------- */
// The band's patches as tiles in their colour (a little more than the patch's mean); with `fine`, every coarse tile
// splits into the fine ones inside it as r goes from 0 to 1.
export function photoTiles(pen: Pen, f: Frame, r: number, coarse: Grid, fine?: Grid, alpha = 1) {
  const gc = pen.shade(...coarse), gf = fine ? pen.shade(...fine) : null;
  if (!gc || (fine && !gf)) return;
  const [cc, cr] = coarse, cs = B.PW / cc, bright = pen.dark ? 0.6 : 1;
  const put = (pt: number[], sz: number, c: Rgb, a: number) => { const m = (c[0] + c[1] + c[2]) / 3; pen.dot(pt[0], pt[1], pt[2], sz, c.map((v) => clamp(m + (v - m) * 1.2) * bright), a * alpha, 2); };
  const [c0, c1] = rowsOf(f.pic, cr);
  for (let j = c0; j < c1; j++) for (let i = 0; i < cc; i++) {
    const u = (i + 0.5) / cc, v = (j + 0.5) / cr, e = fine ? splitAt(f, r, u, v) : 0;
    if (e < 1) put(f.place(u, v), cs * 0.9 * (1 - 0.3 * e), rgbAt(gc, j * cc + i), 1 - e);
  }
  if (!fine || !gf) return;
  // Tiles too small to keep their gaps (past 45 across) touch, so the finer photo reads as a photo and not a weave.
  const [fc, fr] = fine, fs = B.PW / fc, fill = fc > 45 ? 1.04 : 0.9, [f0, f1] = rowsOf(f.pic, fr);
  for (let j = f0; j < f1; j++) for (let i = 0; i < fc; i++) {
    const u = (i + 0.5) / fc, v = (j + 0.5) / fr, pi = Math.min(cc - 1, Math.floor(u * cc)), pj = Math.min(cr - 1, Math.floor(v * cr));
    const pu = (pi + 0.5) / cc, pv = (pj + 0.5) / cr, e = splitAt(f, r, pu, pv);
    if (e > 0) put(mixV(f.place(pu, pv), f.place(u, v), e), mix(cs * 0.5, fs * fill, e), mixV(rgbAt(gc, pj * cc + pi), rgbAt(gf, j * fc + i), e), e);
  }
}
// The thing the question asks about, boxed on the photo.
export function boxOn(pen: Pen, f: Frame, a: number) {
  if (!f.pic.box) return;
  const [l, t, r, b] = f.pic.box, p0 = f.place(l, Math.max(t, f.pic.v0)), p1 = f.place(r, Math.min(b, f.pic.v1));
  const corners = [[p0[0], p0[1]], [p1[0], p0[1]], [p1[0], p1[1]], [p0[0], p1[1]]];
  corners.forEach((c, n) => { const d = corners[(n + 1) % 4], k = Math.max(2, Math.ceil(Math.hypot(d[0] - c[0], d[1] - c[1]) / 0.04)); for (let q = 0; q < k; q++) pen.dot(mix(c[0], d[0], q / k), mix(c[1], d[1], q / k), 0.03, 0.03, pen.ink, a); });
}
// The vision encoder: rings narrowing along the flow, a wave of light passing through them.
export function encoder(pen: Pen, s: number, a: number) {
  const wave = (s * 0.55) % 1.4 - 0.2;
  for (let l = 0; l < 8; l++) {
    const q = l / 7, x = mix(B.E0, B.E1, q), rad = mix(B.ER0, B.ER1, q), on = Math.max(0, 1 - Math.abs(q - wave) / 0.18);
    for (let n = 0; n < 72; n++) { const t = n / 72 * Math.PI * 2; pen.dot(x, B.cy + rad * Math.cos(t), rad * Math.sin(t), 0.03 + 0.02 * on, pen.ink, (0.18 + 0.5 * on) * a); }
  }
}
// The image tokens, 2 × 2 patches each, as smaller tiles in their patches' colour; lit where the step changed them.
export function tokens(pen: Pen, f: Frame, r: number, coarse: Grid, fine: Grid | undefined, alpha: number, lit: boolean) {
  const [tc, tr] = [coarse[0] / 2, coarse[1] / 2], gc = pen.shade(tc, tr), tile = (p: number[], sz: number, c: Rgb, a: number) => (lit ? tileLit(pen, p, sz, c, a * alpha) : pen.dot(p[0], p[1], p[2], sz, c, a * alpha, 2));
  for (let j = 0; j < tr; j++) for (let i = 0; i < tc; i++) {
    const u = (i + 0.5) / tc, v = (j + 0.5) / tr, e = fine ? splitAt(f, r, u, v) : 0;
    if (v < f.pic.v0 || v > f.pic.v1 || e >= 1) continue;
    tile(f.token(u, v), B.TW / tc * 0.88 * (1 - 0.3 * e), gc ? rgbAt(gc, j * tc + i) : pen.ink, 1 - e);
  }
  if (!fine) return;
  const [uc, ur] = [fine[0] / 2, fine[1] / 2], gf = pen.shade(uc, ur);
  for (let j = 0; j < ur; j++) for (let i = 0; i < uc; i++) {
    const u = (i + 0.5) / uc, v = (j + 0.5) / ur, pu = (Math.floor(u * tc) + 0.5) / tc, pv = (Math.floor(v * tr) + 0.5) / tr, e = splitAt(f, r, pu, pv);
    if (v < f.pic.v0 || v > f.pic.v1 || e <= 0) continue;
    tile(mixV(f.token(pu, pv), f.token(u, v), e), mix(B.TW / tc * 0.5, B.TW / uc * 0.88, e), gf ? rgbAt(gf, j * uc + i) : pen.ink, e);
  }
}
// The question's words, joining the image tokens below the sheet.
export const question = (pen: Pen, f: Frame, a: number) => { for (let n = 0; n < 10; n++) pen.dot(B.TX + (n - 4.5) * 0.17, B.cy - f.TH / 2 - 0.35, 0, 0.06, pen.ink, a); };
// A language model: rings round [y, z] along the flow, a wave of light through them; `lit` lights ring `ring` (or all).
export function model(pen: Pen, s: number, at: readonly number[], radius: number, a: number, phase = 0, dots = 64, ring = -1, layers = 6) {
  const wave = (s * 0.42 + 0.5 + phase) % 1.3 - 0.15;
  for (let l = 0; l < layers; l++) {
    const q = l / (layers - 1), x = mix(B.L0, B.L1, q), on = l === ring ? 1 : Math.max(0, 1 - Math.abs(q - wave) / 0.16);
    for (let n = 0; n < dots; n++) { const t = n / dots * Math.PI * 2; (l === ring ? pen.lit : pen.dot)(x, at[0] + radius * Math.cos(t), at[1] + radius * Math.sin(t), 0.03 + 0.018 * on, pen.ink, (0.16 + 0.45 * on) * a); }
  }
}
// Light flowing: patches through the encoder into their tokens, tokens on into the language models (centres `into`,
// each [y, z]) and along them to their ends.
export function flows(pen: Pen, s: number, f: Frame, count: number, into: readonly (readonly number[])[], a: number, spread = 1) {
  for (let n = 0; n < count; n++) {
    const q = (s * 0.36 + hash(n * 7.3)) % 1, u = hash(n * 3.1 + 0.7), v = mix(f.pic.v0, f.pic.v1, hash(n * 5.9 + 0.3));
    const pts = [f.place(u, v), f.inside(u, v, B.E0, B.ER0), f.inside(u, v, B.E1, B.ER1), f.token(u, v)];
    const at = cubic(pts, q);
    pen.dot(at[0], at[1], at[2], 0.036, pen.ink, 0.65 * a * Math.sin(Math.PI * q));
    const q2 = (q + 0.5) % 1, from = f.token(u, v), c = into[n % into.length], x = mix(from[0], B.OUT, q2);
    const entry = [B.L0, c[0] + (f.inside(u, v, B.L0, B.LR)[1] - B.cy) * spread, c[1] + f.inside(u, v, B.L0, B.LR)[2] * spread];
    const at2 = x < B.L0 ? mixV(from, entry, clamp((x - from[0]) / Math.max(B.L0 - from[0], 1e-3))) : mixV(entry, [B.OUT, c[0], c[1]], ease(clamp((x - B.L0) / (B.OUT - B.L0))));
    pen.dot(at2[0], at2[1], at2[2], 0.03, pen.ink, 0.45 * a * Math.sin(Math.PI * q2));
  }
}
// A line with lights running along it, as bright as `a`.
export function stream(pen: Pen, pts: number[][], _s: number, a: number, speed: number, offset = 0, lights = 1, bend?: number) {
  pen.route(pts, "data", { a: 0.6 * a, speed, offset, lights, bend });
}
// The question's own way: the answer's patch, through the encoder to its token, into the language model at [y, z], to
// its end and on to `to`.
export const way = (f: Frame, to: readonly number[]) => {
  const [u, v] = f.pic.key, t = f.token(u, v);
  return [f.place(u, v), t, [B.OUT, t[1], 0], [to[0], B.BY - 0.04, 0]];
};
// The language model's end, at the height the question's way runs through it.
const endOf = (f: Frame) => [B.OUT, f.token(...f.pic.key)[1], 0];
export const ringAt = (pen: Pen, f: Frame, s: number) => { const k = f.place(...f.pic.key), ring = 0.22 + 0.02 * Math.sin(s * 2.2); for (let n = 0; n < 32; n++) { const t = n / 32 * Math.PI * 2; pen.dot(k[0] + ring * Math.cos(t), k[1] + ring * Math.sin(t), 0.02, 0.028, pen.ink, 0.95); } };
// Where the four letters stand, and a column of tiles `height` tall at x.
export const slot = (m: number) => [B.BX + m * B.BG, B.BY, 0];
export const slotX = (m: number) => B.BX + m * B.BG;
export function column(pen: Pen, x: number, height: number, on: boolean, a = 1, z = 0) {
  const n = Math.max(1, Math.round(height / STEP));
  for (let k = 0; k < n; k++) { const at = [x, B.BY + STEP / 2 + k * STEP, z]; if (on) tileLit(pen, at, TILE, pen.ink, 0.95 * a); else pen.dot(at[0], at[1], at[2], TILE, pen.ink, (height > 0.3 ? 0.55 : 0.3) * a, 2); }
}
export const baseline = (pen: Pen) => pen.line([slotX(0) - 0.35, B.BY - 0.04, 0], [slotX(3) + 0.35, B.BY - 0.04, 0], pen.ink, 0.3);

/* ---------- Words ---------- */
export const LETTERS = ["a", "b", "c", "d"];
export const before = (s: number) => 1 - turn(s), after = (s: number) => turn(s);
// Before and after the step, crossing over in one place.
export const stateTags = (at: V3, was: ReactNode, now: ReactNode, cls = "vl-size"): Tag[] => [
  { text: was, at: () => at, fade: (s) => 1 - ease(clamp(raw(s) * 2.2 - 0.6)), cls },
  { text: now, at: () => at, fade: (s) => ease(clamp(raw(s) * 2.2 - 0.6)), cls },
];
export const state = (name: string, sub: string) => <><b>{name}</b><span>{sub}</span></>;
// The letters stay; each word stands under the place `place(s, m)` gives it (its own letter unless the step moves it).
export function choiceTags(words: string[], place: (s: number, m: number) => number = (_s, m) => m, dim: number[] = [], lift: (s: number, m: number) => number = () => 0): Tag[] {
  return [
    ...LETTERS.map((k, m): Tag => ({ text: <b>{k}</b>, at: () => [slotX(m), B.BY - 0.12, 0], align: "below", cls: "vl-letter", dim: dim.includes(m) })),
    ...words.map((w, m): Tag => ({ text: w, at: (s) => [mix(slotX(0), slotX(3), place(s, m) / 3), B.BY - 0.5 + lift(s, m), 0], align: "below", cls: "vl-word", dim: dim.includes(m) })),
  ];
}
export const mark = (text: ReactNode, at: (s: number) => number, fade: (s: number) => number, gold = false): Tag =>
  ({ text, at: (s) => [mix(slotX(0), slotX(3), at(s) / 3), B.BY - 1.12, 0], fade, align: "below", cls: gold ? "vl-mark is-gold" : "vl-mark" });
export const atop = (text: string, m: number, height: number, fade: (s: number) => number, dim = false): Tag =>
  ({ text, at: () => [slotX(m), B.BY + Math.max(1, Math.round(height / STEP)) * STEP + 0.12, 0], fade, align: "above", cls: "vl-chance", dim });
const shotOf = (f: Frame, top = 0): Shot => ({ target: [-0.6, 2.0, 0], yaw: -0.34, tilt: 0.2, bounds: [[B.cx - B.PW / 2 - 0.1, B.cy - f.PH / 2 - 0.7, 0], [B.cx - B.PW / 2 - 0.1, B.cy + f.PH / 2 + 0.8, 0], [B.BX + 3 * B.BG + 0.35, -0.75, 0], [B.BX + 3 * B.BG + 0.35, B.BY + B.BH + 0.45 + top, 0], [B.E0, B.cy + B.ER0, 0], [B.E0, B.cy - B.ER0 - 0.3, 0], [B.E0, B.cy, B.ER0], [B.L0, B.cy, -B.LR]] });
const BH = B.BH, pct = (p: number) => (p < 0.01 ? "<1%" : `${(p * 100).toFixed(1)}%`);

/* ---------- 02 OCR 추가 ---------- */
const P512 = [0.0168, 0.0007, 0.4912, 0.4912], POCR = [0.0066, 0.0009, 0.5272, 0.4653];
const OCR: { text: string; box: [number, number, number, number]; key?: boolean }[] = [
  { text: "H", box: [0.5708, 0.4427, 0.6417, 0.4906] }, { text: "수봉은사로", box: [0.2333, 0.5063, 0.3139, 0.5313] },
  { text: "·선릉역", box: [0.3375, 0.5063, 0.3958, 0.5292] }, { text: "강남세브란스병원", box: [0.4111, 0.5052, 0.4819, 0.5281] },
  { text: "주정차금지", box: [0.65, 0.4938, 0.7653, 0.524] }, { text: "언주로", box: [0.3208, 0.5406, 0.4014, 0.5708], key: true },
  { text: "Eonju-ro", box: [0.3306, 0.5719, 0.3917, 0.5875], key: true }, { text: "300m", box: [0.3347, 0.5958, 0.3861, 0.6115], key: true },
  { text: "견인지역", box: [0.6431, 0.5854, 0.775, 0.6156] }, { text: "341", box: [0.7986, 0.7802, 0.8458, 0.8063] }, { text: "R0", box: [0.7556, 0.8458, 0.8167, 0.8615] },
];
// The block of words, above the tokens where the language model's input begins.
const OCR_AT: V3 = [B.TX + 0.2, B.cy + 2.75, 0];
export const SIGN_WORDS = ["500m", "1km", "100m", "300m"];

function drawOcr(s: number, pen: Pen) {
  const f = F_SIGN, t = turn(s), pic = f.pic;
  photoTiles(pen, f, 0, [26, 36]);
  encoder(pen, s, 0.7); tokens(pen, f, 0, [26, 36], undefined, 0.5, false); question(pen, f, 0.45);
  model(pen, s, [B.cy, 0], B.LR, 1);
  flows(pen, s, f, 94, [[B.cy, 0]], 0.7);
  // Every line the OCR model read, boxed where it stands on the photo (two lie below the band), streaming past the
  // encoder to the block of words; from there, into the language model with the question.
  // Every line in the band boxed where it stands; from the top of each box a line up to its own track over the photo and
  // the encoder, along it and up into the block of words. The leftmost box takes the highest track and ends leftmost, so
  // no two lines cross. The two lines below the band (341, R0) stand in the block only.
  const lines = OCR.filter((line) => line.box[3] > pic.v0 && line.box[1] < pic.v1).sort((a, b) => a.box[0] - b.box[0]), under = OCR_AT[1] - 0.14;
  lines.forEach((line, i) => {
    const [l, top, r, bottom] = line.box, p0 = f.place(l, Math.max(top, pic.v0)), p1 = f.place(r, Math.min(bottom, pic.v1));
    const corners = [[p0[0], p0[1]], [p1[0], p0[1]], [p1[0], p1[1]], [p0[0], p1[1]]];
    corners.forEach((c, n) => { const d = corners[(n + 1) % 4], m = Math.max(2, Math.ceil(Math.hypot(d[0] - c[0], d[1] - c[1]) / 0.035)); for (let q = 0; q < m; q++) pen.lit(mix(c[0], d[0], q / m), mix(c[1], d[1], q / m), 0.03, 0.022, pen.ink, t); });
    const x = (p0[0] + p1[0]) / 2, track = under - 0.16 - i * 0.09, end = OCR_AT[0] - 0.9 + i * 0.2;
    pen.route([[x, p0[1], 0], [x, track, 0], [end, track, 0], [end, under, 0]], "data", { a: 0.5 * t, speed: 0.4, offset: i * 0.11 });
  });
  // From the block straight down into the language model, with the question.
  pen.route([[B.L0, under, 0], [B.L0, B.cy + B.LR * 0.55, 0]], "data", { a: 0.75 * t, speed: 0.5, lights: 2 });
  // The question's way to the letter it chose, c, both times.
  path(pen, way(f, slot(2)), pen.ink, s, 0.75, 0.22);
  for (let m = 0; m < 4; m++) if (m !== 2) pen.route([endOf(f), [slotX(m), B.BY - 0.04, 0]], "data", { a: 0.14, bend: 0 });
  ringAt(pen, f, s);
  const p = mixV(P512, POCR, t);
  for (let m = 0; m < 4; m++) column(pen, slotX(m), p[m] * BH, m === 2);
  baseline(pen);
}
const OCR_TAGS: Tag[] = [
  // Under the photo here, its two lines stacked: the OCR lines rise from it to their tracks above.
  ...stateTags([B.cx - B.PW / 2, B.cy - F_SIGN.PH / 2 - 0.55, 0], state("OCR 없이", "같은 4B · 512², 사진과 질문만"), state("OCR 글과 함께", "OCR 모델이 읽은 11줄을 질문과 함께 입력"), "vl-size is-stack"),
  { text: <p>{OCR.map((line, k) => <span key={k} className={line.key ? (line.text === "300m" ? "is-key is-gold" : "is-key") : "is-noise"} style={line.key ? undefined : { rotate: `${((hash(k + 3) * 2 - 1) * 7).toFixed(1)}deg`, animationDelay: `${(-hash(k + 31) * 2).toFixed(2)}s`, animationDuration: `${(0.9 + hash(k + 21) * 1.6).toFixed(2)}s` }}>{line.text}</span>)}</p>, at: () => OCR_AT, fade: after, align: "above", cls: "vl-ocr" },
  ...structureTags(F_SIGN.TH, false),
  ...choiceTags(SIGN_WORDS, undefined, [0, 1]),
  atop(pct(P512[2]), 2, P512[2] * BH, before), atop(pct(POCR[2]), 2, POCR[2] * BH, after),
  atop(pct(P512[3]), 3, P512[3] * BH, before), atop(pct(POCR[3]), 3, POCR[3] * BH, after),
  mark("고른 답", () => 2, () => 1), mark("정답", () => 3, () => 1, true),
];

/* ---------- 04 앙상블: the votes ---------- */
export const VOTES_FIRST = [0, 1, 0], VOTES_ADDED = [0, 1, 1, 1];
export const DOOR_WORDS = ["흡연금지", "출입금지", "휴대폰 사용금지", "음식물 반입금지"];

/* ---------- 05 BF16 · 순서 섞기 ---------- */
// The sixteen values of 4-bit NF4 (bitsandbytes), within a block scaled to its largest weight.
export const NF4 = [-1, -0.6962, -0.5251, -0.3949, -0.2844, -0.1848, -0.0911, 0, 0.0796, 0.1609, 0.2461, 0.3379, 0.4407, 0.5626, 0.723, 1];
export const nf4 = (v: number) => NF4.reduce((best, level) => (Math.abs(level - v) < Math.abs(best - v) ? level : best), NF4[0]);
// W's values: a smooth field about zero (an example, as on the step's other figure).
export const field = (a: number, w: number) => 0.55 * Math.sin(a * 1.9 + 0.4) * Math.cos(w * 1.5 - 0.3) + 0.3 * Math.sin((a + w) * 2.4 + 1.1) + 0.12 * Math.sin(a * 5.1 - w * 3.3);
// The choices trading places, calmly. Once the step has turned, the answer's word (d) trades places with one other word,
// waits, then trades with a second; on the way back the two trades undo in reverse. Only two words move at a time, along
// arcs below the words that stay, each in its own lane (the answer's the lower), so a moving word passes under the
// others and never over one; each loop picks other partners. Gives each word's place (0–3) and lift (scene units, up).
const PARTNERS = [[1, 0], [0, 2], [2, 1]];
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a)));
export function swapsAt(s: number) {
  const t = ((s % LOOP) + LOOP) % LOOP, [p1, p2] = PARTNERS[Math.floor(s / LOOP) % PARTNERS.length], a0 = 3;
  const e1 = t < 8.05 ? span(t, 4.2, 5.0) : 1 - span(t, 8.05, 8.55), e2 = t < 7.5 ? span(t, 5.7, 6.5) : 1 - span(t, 7.5, 8.0);
  const place = [0, 1, 2, 3], lift = [0, 0, 0, 0];
  place[a0] = e2 > 0 ? mix(p1, p2, e2) : mix(a0, p1, e1); lift[a0] = -0.52 * Math.sin(Math.PI * (e2 > 0 ? e2 : e1));
  place[p1] = mix(p1, a0, e1); lift[p1] = -0.27 * Math.sin(Math.PI * e1);
  place[p2] = mix(p2, p1, e2); lift[p2] = -0.27 * Math.sin(Math.PI * e2);
  return { place, lift };
}
export const shuffleAt = (s: number, m: number) => swapsAt(s).place[m];
export const shuffleLift = (s: number, m: number) => swapsAt(s).lift[m];
/* ---------- 06 불확실 문항: the clock's chances ---------- */
// The clock (test_2233): the three trained models' log-probability mean, as its normalised geometric mean, before and
// after scoring again; each model's own answer before (Qwen3.5 d, Qwen3.8 d, Gemma 4 b).
export const CLOCK_BASE = [0.1929, 0.3578, 0.0517, 0.3976], CLOCK_AGAIN = [0.2837, 0.4032, 0.0779, 0.2353], ANSWERS = [3, 3, 1];
export const CLOCK_WORDS = ["밤 8시 10분", "밤 10시 10분", "밤 7시 10분", "밤 9시 10분"];
// The four turns of the list, each word in each place once (order[slot] = the word standing there), one every 1.8 s.
export const ORDERS4 = [[0, 1, 2, 3], [3, 0, 1, 2], [2, 3, 0, 1], [1, 2, 3, 0]];
const ARIA = {
  ocr: "같은 표지판 사진을 같은 4B 모델에 512²로 넣는다. OCR 모델이 사진에서 읽은 글 11줄이 비전 인코더를 거치지 않고 글로 질문과 함께 입력에 더해진다. 질문과 관련된 글은 언주로 · Eonju-ro · 300m 3줄이고 나머지 8줄은 무관한 글이다. 확률은 c 100m 49.1% · d 300m 49.1%에서 c 52.7% · d 46.5%로, 틀린 c가 앞선다.",
};
const STEPS = {
  ocr: { draw: drawOcr, tags: OCR_TAGS, shot: shotOf(F_SIGN, 2.1) },
};

export function VqaStepLight({ step, src, fallback }: { step: keyof typeof STEPS; src: string; fallback: ReactNode }) {
  const { draw, tags, shot } = STEPS[step];
  return <LightFigure key={step} src={src} draw={draw} shot={shot} tags={tags} label={ARIA[step]} still={5.6} fallback={fallback} />;
}
