"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LightField, type Put, type Scene } from "@/components/light-field";

// The pitch model's step pictures, in the engine's light (src/components/light-field.tsx). Each is an example drawn
// from rules, not a recording: the numbers that matter are in the step's reasons.

// ---- 00 Template → distribution ----------------------------------------------------------------------------------
// Why the spectral template was dropped (engine records, 2026-05-18 ~ 20). Three runs follow the same score. Above,
// the score's melody played as a violin: its spectrum sits in the fixed template, and the follower keeps up with the
// singer. In the middle, a real voice: its harmonics move with vibrato and change height with the vowel, so they miss
// the template, and the follower stalls behind the singer. Below, the same voice read by the pitch model: every
// harmonic gathers into one point of the pitch distribution, and the follower keeps up again. Between sound and score,
// each run's reading stands on the score's pitch axis: the violin's climbs the melody in clean steps, the voice's by
// template jumps to neighbouring notes and fades, the voice's by the pitch model sways with the vibrato but stays on
// the note.

// The score: a melody (MIDI number, length in ms), each note sung on a vowel (two formants in Hz).
const MELODY = [
  { m: 64, d: 700, f: [800, 1200] }, { m: 67, d: 700, f: [450, 1900] }, { m: 69, d: 1300, f: [300, 2300] }, { m: 67, d: 700, f: [500, 900] },
  { m: 65, d: 700, f: [800, 1200] }, { m: 64, d: 1300, f: [350, 800] }, { m: 62, d: 700, f: [450, 1900] }, { m: 64, d: 1800, f: [800, 1200] },
];
const SONG = MELODY.reduce((s, n) => s + n.d, 0), LOOP = SONG + 1400;
const STARTS = MELODY.map((_, i) => MELODY.slice(0, i).reduce((s, n) => s + n.d, 0));
const HARMONICS = 8, FMAX = 3600, STEP = 10;
const hz = (cents: number) => 440 * 2 ** ((cents - 6900) / 1200);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// The template's comb: each harmonic of the note at its fixed place, with fixed heights. A violin's harmonics have
// these heights; a voice's follow its vowel.
const TEMPLATE = Array.from({ length: HARMONICS }, (_, k) => 1 / (k + 1) ** 0.8);
type Frame = { note: number; f0: number; amps: number[]; breath: number[] } | null;
function noteAt(ms: number) {
  if (ms < 0 || ms >= SONG) return -1;
  let i = 0;
  while (i < MELODY.length - 1 && ms >= STARTS[i + 1]) i++;
  return i;
}
// One frame of what comes in: the violin plays the note as written; the voice glides into it, sways with a vibrato
// that grows, and sounds each harmonic as loud as its vowel lets it, over a little breath.
function frame(ms: number, voice: boolean): Frame {
  const i = noteAt(ms);
  if (i < 0) return null;
  const n = MELODY[i], at = ms - STARTS[i];
  if (!voice) return { note: n.m, f0: hz(n.m * 100), amps: TEMPLATE.map((a) => a * (0.97 + 0.03 * Math.sin(at / 90))), breath: [] };
  const prev = MELODY[Math.max(0, i - 1)], glide = clamp(at / 110), depth = 75 * clamp((at - 200) / 500);
  const cents = prev.m * 100 + (n.m - prev.m) * 100 * glide + depth * Math.sin(2 * Math.PI * 5 * at / 1000);
  const f0 = hz(cents), res = (f: number, F: number) => 1 / (1 + ((f - F) / 190) ** 2);
  const raw = Array.from({ length: HARMONICS }, (_, k) => (0.18 + res((k + 1) * f0, n.f[0]) + 0.9 * res((k + 1) * f0, n.f[1])) / Math.sqrt(k + 1));
  const top = Math.max(...raw);
  const breath = Array.from({ length: 22 }, (_, j) => 0.05 + 0.07 * Math.abs(Math.sin(ms / 37 + j * 2.3) * Math.sin(ms / 53 + j * 1.7)));
  return { note: n.m, f0, amps: raw.map((a) => a / top), breath };
}
// How well a frame fills the template of a note (0..1); `fit` is the note being sung.
const TEMPLATE_SUM = TEMPLATE.reduce((s, t) => s + t, 0);
const fitTo = (f: NonNullable<Frame>, m: number) => TEMPLATE.reduce((s, t, k) => s + Math.min(f.amps[k], t) * Math.exp(-(((k + 1) * (f.f0 - hz(m * 100)) / 16) ** 2)), 0) / TEMPLATE_SUM;
const fit = (f: Frame) => f ? fitTo(f, f.note) : 0;
// The notes a template reading chooses among, a semitone apart around the melody.
const CANDIDATES = Array.from({ length: 12 }, (_, i) => 60 + i);

// The three runs: what comes in and how it is read. `sure` is how sure the reading is of the note at a moment.
const RUNS = [
  { voice: false, read: "template" as const },
  { voice: true, read: "template" as const },
  { voice: true, read: "distribution" as const },
];
const sureOf = (run: (typeof RUNS)[number], ms: number) => run.read === "distribution" ? (noteAt(ms) < 0 ? 0 : 0.92) : clamp((fit(frame(ms, run.voice)) - 0.5) / 0.2);
// Which pitch a run reads at a moment (MIDI number) and how strongly. By template, every candidate's template is held to
// the frame and the best fit wins: on the violin always the note played, so the reading climbs the melody in steps; on
// the voice the vibrato and the vowel often hand it to a neighbour, faintly. By the pitch model, the voice's own pitch,
// vibrato and all, which never leaves the note.
function readOf(run: (typeof RUNS)[number], ms: number) {
  const f = frame(ms, run.voice);
  if (!f) return null;
  if (run.read === "distribution") return { m: 69 + 12 * Math.log2(f.f0 / 440), light: 0.92 };
  let m = CANDIDATES[0], light = -1;
  for (const c of CANDIDATES) { const v = fitTo(f, c); if (v > light) { light = v; m = c; } }
  return { m, light };
}
const READ = RUNS.map((run) => Array.from({ length: Math.ceil(LOOP / STEP) + 1 }, (_, i) => readOf(run, i * STEP)));
const readAt = (r: number, ms: number) => READ[r][Math.floor((((ms % LOOP) + LOOP) % LOOP) / STEP)];
// The follower, played out once: it moves on at about the singer's pace while it is sure, catching up a little if
// behind, and stands still when it is not. Its place (ms of the score) every STEP ms of the loop.
const FOLLOW = RUNS.map((run) => {
  const out = new Float32Array(Math.ceil(LOOP / STEP) + 1);
  let pos = 0;
  for (let i = 0; i < out.length; i++) {
    const ms = i * STEP, sure = sureOf(run, ms);
    if (ms < SONG) pos = Math.min(SONG, pos + STEP * (sure > 0.5 ? clamp(1 + 0.5 * (ms - pos) / 1000, 0, 1.3) : 0));
    out[i] = pos;
  }
  return out;
});
const followAt = (r: number, ms: number) => FOLLOW[r][Math.min(FOLLOW[r].length - 1, Math.floor((((ms % LOOP) + LOOP) % LOOP) / STEP))];

// Where things stand, in fractions of the box; the words over the picture use the same fractions.
const LANES = [0.03, 0.36, 0.69].map((y0) => ({ y0, y1: y0 + 0.27 }));
const AT = { spec: [0.03, 0.4] as const, read: 0.47, score: [0.57, 0.975] as const };
const EVERY = 34, TRAVEL = 520, SIZE = 1.6, LIGHT = 2;

function templateScene(raw: Put, t: number, w: number, h: number, dark: boolean) {
  const put: Put = (x, y, s, a) => raw(x, y, s * SIZE, a * LIGHT);
  const ms = ((t % LOOP) + LOOP) % LOOP, sx0 = AT.spec[0] * w, sx1 = AT.spec[1] * w, readX = AT.read * w, cx0 = AT.score[0] * w, cx1 = AT.score[1] * w;
  const fx = (f: number) => sx0 + f / FMAX * (sx1 - sx0), scoreX = (p: number) => cx0 + p / SONG * (cx1 - cx0);
  const bead = (ax: number, ay: number, bx: number, by: number, q: number, light: number) => {
    for (let j = 0; j < 3; j++) { const p = clamp(q - j * EVERY / TRAVEL / 3); put(ax + (bx - ax) * p, ay + (by - ay) * p, j ? 3 : 4, (j ? 0.3 : 0.5) * light); }
  };
  const lit = dark ? 1 : 0.92;

  RUNS.forEach((run, r) => {
    const lane = LANES[r], top = lane.y0 * h, bottom = lane.y1 * h, base = top + (bottom - top) * 0.88, tall = (bottom - top) * 0.72, mid = (top + bottom) / 2;
    const f = frame(ms, run.voice);
    // Pitch on the score's own scale, so every reading stands level with the note it reads.
    const noteY = (m: number) => mid - (m - 65.5) * (bottom - top) * 0.05;

    // The spectrum of the moment, over the template's comb where the run reads by template.
    if (run.read === "template") {
      const note = f?.note ?? MELODY[0].m;
      for (let k = 0; k < HARMONICS; k++) {
        const x = fx((k + 1) * hz(note * 100)), hgt = TEMPLATE[k] * tall;
        for (let y = 0; y <= hgt; y += 6) put(x, base - y, 2.2, 0.16);
        put(x, base - hgt, 4, 0.3);
      }
    }
    for (let x = sx0; x <= sx1; x += 7) put(x, base, 1.8, 0.05);
    if (f) {
      f.breath.forEach((b, j) => { const x = sx0 + (j + 0.5) / f.breath.length * (sx1 - sx0); for (let y = 0; y <= b * tall; y += 4) put(x, base - y, 2.4, 0.12); });
      for (let k = 0; k < HARMONICS; k++) {
        const x = fx((k + 1) * f.f0), hgt = f.amps[k] * tall;
        // Where the harmonic stands in the template's tooth it glows; where it misses, it stays faint.
        const hit = run.read === "template" ? Math.exp(-(((k + 1) * (f.f0 - hz(f.note * 100)) / 16) ** 2)) : 1;
        for (let y = 0; y <= hgt; y += 3.4) {
          const inTooth = run.read === "template" && y <= TEMPLATE[k] * tall ? hit : 0;
          put(x, base - y, 3, (0.18 + 0.45 * inTooth + (run.read === "distribution" ? 0.3 : 0)) * lit);
        }
        put(x, base - hgt, 5.5, 0.55 * lit);
      }
    }

    // How it is read, on the pitch axis. By template: one point per candidate note, as bright as its template fits, the
    // brightest being the reading. By the pitch model: every harmonic's light gathers into the peak of the pitch
    // distribution, at the voice's own pitch.
    const read = readAt(r, t);
    if (run.read === "template") {
      for (const c of CANDIDATES) {
        const v = f ? fitTo(f, c) : 0, best = !!read && c === read.m;
        put(readX, noteY(c), 3 + (best ? 5.4 : 1.4) * v, (0.2 + (best ? 0.8 : 0.5) * v ** 1.5) * lit);
      }
    } else {
      const py = read ? noteY(read.m) : mid;
      for (let k = -9; k <= 9; k++) put(readX, py + k * 4, 3 + 6 * Math.exp(-k * k / 6), (f ? 0.95 : 0) * Math.exp(-k * k / 8) + 0.05);
      const last = Math.floor(t / EVERY);
      for (let e = last; e >= last - Math.ceil(TRAVEL / EVERY); e--) {
        const sent = e * EVERY, q = (t - sent) / TRAVEL, g = frame(((sent % LOOP) + LOOP) % LOOP, true), at = readAt(r, sent);
        if (!g || !at || q < 0 || q > 1) continue;
        for (let k = 0; k < HARMONICS; k++) bead(fx((k + 1) * g.f0), base - g.amps[k] * tall, readX, noteY(at.m), q, 0.12 + 0.3 * g.amps[k]);
      }
    }

    // From the reading to the follower, light flows at the height it was read, as bright as the reading is sure (a weak
    // fit barely glows, so the voice's template reading breaks up), and climbs where the reading changed: steps on the
    // violin, jumps on the voice by template, a sway on the pitch model.
    const last = Math.floor(t / EVERY);
    let newer: { x: number; y: number; light: number } | null = null;
    for (let e = last; e >= last - Math.ceil(TRAVEL / EVERY); e--) {
      const sent = e * EVERY, q = (t - sent) / TRAVEL, at = readAt(r, sent);
      if (!at || q < 0 || q > 1) { newer = null; continue; }
      const y = noteY(at.m), light = 0.06 + 0.54 * clamp((at.light - 0.3) / 0.45), x = readX + (cx0 - 8 - readX) * q;
      bead(readX, y, cx0 - 8, y, q, light);
      if (newer && Math.abs(newer.y - y) > 1.5) {
        const rx = (x + newer.x) / 2, rl = 0.5 * Math.min(light, newer.light), dir = Math.sign(newer.y - y);
        for (let ry = y; dir * (newer.y - ry) > 0; ry += dir * 3) put(rx, ry, 3, rl);
      }
      newer = { x, y, light };
    }

    // The score: its notes along the lane, lit once the follower has passed them; the singer, faint; the follower,
    // bright, where it believes the singer is.
    const pos = followAt(r, t), singer = Math.min(ms, SONG);
    MELODY.forEach((n, i) => {
      const passed = STARTS[i] <= pos;
      for (let x = scoreX(STARTS[i]) + 4; x < scoreX(STARTS[i] + n.d) - 4; x += 4) put(x, noteY(n.m), passed ? 3.4 : 2.4, passed ? 0.42 : 0.08);
    });
    if (ms < SONG) {
      // The singer: a faint ring where they are in the score.
      for (let a = 0; a < 16; a++) put(scoreX(singer) + 12 * Math.cos(a * Math.PI / 8), noteY(MELODY[Math.max(0, noteAt(singer))].m) + 12 * Math.sin(a * Math.PI / 8), 2.4, 0.2);
      const ni = noteAt(Math.max(0, pos - 1));
      put(scoreX(pos), noteY(MELODY[Math.max(0, ni)].m), 11, 1.1);
    }
  });
}

export function TemplateToDistribution() {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const names = ["악보 멜로디(바이올린) · 템플릿", "실제 목소리 · 템플릿", "실제 목소리 · 음높이 분포"];
  return <LightField scene={templateScene} still={5200}
    label="같은 악보를 세 번 따라간다. 위는 악보 멜로디를 바이올린으로 합성한 소리로, 스펙트럼이 고정 템플릿에 맞아 커서가 가수를 따라간다. 가운데는 실제 목소리로, 배음이 비브라토와 모음에 따라 움직여 템플릿에 맞지 않고 커서가 멈춰 뒤처진다. 아래는 같은 목소리를 음높이 모델로 읽은 것으로, 배음이 음높이 분포의 한 점으로 모이고 커서가 다시 따라간다. 가운데 칸은 그 순간 어느 음으로 읽혔는지를 악보와 같은 높이로 보인다. 위는 멜로디를 따라 계단처럼 옮겨 가고, 가운데는 옆 음으로 튀고 흐려지며, 아래는 비브라토만큼 흔들리면서도 음을 따라간다.">
    {LANES.map((lane, r) => <span key={r} className="lf-tag" data-dim={r === 1 ? "" : undefined} style={{ left: pct(AT.spec[0]), top: pct(lane.y0 - 0.005) }}><b>{names[r]}</b></span>)}
    <span className="lf-tag" style={{ left: pct(AT.score[0]), top: pct(LANES[0].y0 - 0.005) }}><b>악보 추종</b>○ 가수 · ● 추종 위치</span>
  </LightField>;
}

// ---- 01 Pitch only, not separation --------------------------------------------------------------------------------
// What the engine needs from the microphone is the singer's pitch, not the singer's sound (2026-06-12). Above, the
// pipeline as it was, kept only to make the training answers and run on recordings: Mel-RoFormer takes the vocal stem
// out of the mix, the piano falls away, and FCPE reads the stem's pitch. Below, what was built and runs live on the
// phone: one small CNN takes the same mix straight to the same pitch distribution. The distribution made above comes
// down as what the CNN learns.
//
// Sound is drawn as a spectrogram on the pitch axis the distribution stands on: time runs left to right, the voice's
// harmonics sway with its vibrato, the piano's partials hold still and ring away after each strike. Both rows read the
// same mix and give out the same moment, as the engine's no-future figure sets a recording over live
// (src/components/future-reach.tsx): above, a recording, the sound stands still and the frame being given out moves
// across it as a cursor, with sound on past it; below, live, the cursor stands still and the sound comes in to it, only
// 20ms past it, and what comes after is not there yet.
//
// Inside a model, across is depth (its layers in order) and up is pitch, as in the sound: Mel-RoFormer as band tokens
// joined by attention, FCPE as channels mixed at each of its layers, the CNN as bundles that fold the voice's harmonics
// onto its pitch. All are drawn at one size; no size reads as a model's scale. Under the sound, a band shows how far in
// time each model reaches for the frame it gives out, layer by layer: Mel-RoFormer attends across its whole chunk; FCPE's
// six depthwise convolutions (kernel 31, same padding, 10ms frames) widen 15 frames each way per layer, to about 900ms
// ahead (torchfcpe model_conformer_naive.py); the CNN's thirteen layers (kernel 3 in time) widen 2 frames back per layer,
// and only the one nearest the input looks 2 frames ahead (score-follower src/student/causal_conv_salience.py).

// The voice's notes (MIDI, ms) over the piano's chords, struck as each note starts and again halfway through it. One
// turn of the loop lasts as long as the stretch of recording on screen above (its 0.455 of the box at 0.12 a second), so
// the cursor there runs round it without a break.
export const DUET = [
  { m: 67, d: 950, chord: [55, 60, 64] }, { m: 69, d: 820, chord: [53, 57, 60] },
  { m: 71, d: 1075, chord: [55, 59, 62] }, { m: 69, d: 946 + 2 / 3, chord: [53, 57, 65] },
];
export const DUET_LOOP = DUET.reduce((s, n) => s + n.d, 0);
export const DUET_STARTS = DUET.map((_, i) => DUET.slice(0, i).reduce((s, n) => s + n.d, 0));
const ease = (q: number) => q * q * q * (q * (q * 6 - 15) + 10);
function duetAt(ms: number) {
  const at = ((ms % DUET_LOOP) + DUET_LOOP) % DUET_LOOP;
  let i = 0;
  while (i < DUET.length - 1 && at >= DUET_STARTS[i + 1]) i++;
  return { n: DUET[i], prev: DUET[(i + DUET.length - 1) % DUET.length], into: at - DUET_STARTS[i] };
}
// The voice glides into each note and sways with a vibrato that grows; its harmonics stand above it, fainter upward.
export const VOICE_HARMONICS = [0, 1200, 1902, 2400], VOICE_GAIN = [1, 0.78, 0.6, 0.42];
export function voiceAt(ms: number) {
  const { n, prev, into } = duetAt(ms), depth = 100 * clamp((into - 150) / 350);
  return {
    cents: prev.m * 100 + (n.m - prev.m) * 100 * ease(clamp(into / 170)) + depth * Math.sin(2 * Math.PI * 5.2 * into / 1000),
    amp: 0.55 + 0.45 * ease(clamp(into / 150)),
  };
}
// The piano's partials hold their pitch; struck, they ring away.
export const PIANO_PARTIALS = [0, 1200], PIANO_GAIN = [1, 0.45];
export function pianoAt(ms: number) {
  const { n, into } = duetAt(ms), since = into % (n.d / 2);
  return { chord: n.chord, ring: 0.16 + 0.84 * Math.exp(-since / 480) };
}
// The pitch axis every part of a row shares, in cents: from the piano's lowest note to the voice's fourth harmonic.
export const AXIS_LO = 5100, AXIS_HI = 9700;
// A fixed scatter of faint grains under the lines, the ground a spectrogram is never empty of.
const hash01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Where things stand, in fractions of the box. Each row is the spectrogram and, under it, the band of reaches. The two
// rows share the moment of computing (`now`); above, the three parts of the old pipeline stand in a row after the mix;
// below, the CNN stands at the moment itself. The two distributions stand one over the other.
const ROW01 = [{ y0: 0.08, y1: 0.43 }, { y0: 0.58, y1: 0.93 }] as const;
type Row01 = (typeof ROW01)[number];
const SPEC01 = [0.02, 0.74] as const, BAND01 = [0.8, 1] as const;
const COL01 = {
  input: 0.075, now: 0.4, roformer: [0.53, 0.605] as const, stem: [0.605, 0.64] as const, fcpe: [0.64, 0.715] as const,
  cnn: [0.42, 0.495] as const, axis: 0.755, spread: 0.115, answer: 0.93,
};
const PACE01 = 0.12; // how far sound moves in a second, in widths of the box
// Each model's reach in time, row by row of its band (ms back and ahead of the frame it gives out, after `j` layers).
// The CNN's 20ms ahead is about 2px on this time axis, too little to see, so it alone is drawn wider than its share
// (STUB01, in widths of the box), still well short of its 240ms back; its label says 20ms.
const FCPE_LAYERS = 6, CNN_LAYERS = 13, STUB01 = 0.014;
const fcpeReach = (j: number) => ({ back: 150 * j, ahead: 150 * j });
const cnnReach = (j: number) => ({ back: 20 * Math.min(j, CNN_LAYERS - 1), ahead: j >= CNN_LAYERS ? STUB01 / PACE01 * 1000 : 0 });
const rowAxis = (row: Row01) => {
  const span = row.y1 - row.y0, top = row.y0 + SPEC01[0] * span, bottom = row.y0 + SPEC01[1] * span;
  return { top, bottom, band: [row.y0 + BAND01[0] * span, row.y1] as const, at: (c: number) => bottom - (c - AXIS_LO) / (AXIS_HI - AXIS_LO) * (bottom - top) };
};

// Above, a recording: the mix stands still, whole, and the frame being given out moves across it like a cursor, at the
// pace of the sound below. The stretch on screen is one turn of the example's loop, so the cursor runs round it without
// a break and always stands on the same moment as the row below: both rows give out the same pitch. Below, live, the
// cursor stands still and the sound comes in to it. Only the vocal stem, between Mel-RoFormer and FCPE, flows.
export const CURSOR01 = { start: 400 };
function cursor01(t: number) {
  const q = ((((t - CURSOR01.start) % DUET_LOOP) + DUET_LOOP) % DUET_LOOP) / DUET_LOOP;
  return { q, on: ease(clamp(q / 0.03)) * ease(clamp((1 - q) / 0.03)), line: COL01.input + q * (COL01.roformer[0] - COL01.input) };
}
// A trial, chosen by the page address (?v=2, 2026-10-19, unjudged): above, each model takes a whole stretch at once (the
// stretch flashes, the model lights, and the result goes out as one packet); below, the CNN gives out a frame every
// tick, a steady stream of small beads.
type Variant01 = 0 | 2;
const BATCH01 = 3000, TICK01 = 140;
const flashAt = (ph: number, at: number, decay: number) => ph < at ? 0 : ease(clamp((ph - at) / 70)) * Math.exp(-(ph - at) / decay);

// A column (fraction of the box) and the moment of sound (ms) standing at it. Along a timeline later sound stands to the
// right and the sound moves left as time goes; along a pipe (`flow`) later sound stands to the left and the sound moves
// right, out of one model into the next.
type Clock01 = { x: number; ms: number; flow?: boolean };

function pitchOnlyScene(raw: Put, t: number, w: number, h: number, dark: boolean, variant: Variant01 = 0) {
  const put: Put = (x, y, s, a) => raw(x, y, s * SIZE, a * LIGHT);
  const X = (v: number) => v * w, lit = dark ? 1 : 0.92, pace = w * PACE01 / 1000;
  // The renderer grows its points with the box; spacings grow with them so a line keeps its weight at every size.
  // Past 900px wide, the spacings grow with the box too, so a larger box does not draw more points than the renderer
  // holds.
  const u = clamp(w / 900, 0.65, 1.15), d = Math.max(u, w / 900);
  const axis = (row: Row01) => {
    const a = rowAxis(row);
    return { top: a.top * h, bottom: a.bottom * h, band: [a.band[0] * h, a.band[1] * h] as const, y: (c: number) => a.at(c) * h };
  };

  // Sound between two columns, on a clock that stands one moment at one column. The voice's harmonics are drawn as
  // unbroken threads, the piano's partials as beads, brightest where struck: the two read apart before any word does.
  // The sound after the moment of computing (`after`), which the models above take as their future reference, is lit.
  const sound = (row: Row01, xa: number, xb: number, clock: Clock01, piano: boolean, k: number, first: boolean, after?: { x: number; on: number }) => {
    const { y } = axis(row), a = X(xa), b = X(xb), c = X(clock.x), fine = 1.8 * d, bead = 4.6 * d, f = after ? X(after.x) : Infinity;
    const dir = clock.flow ? -1 : 1, when = (x: number) => clock.ms + dir * (x - c) / pace;
    const edge = (x: number) => ease(clamp((x - a) / (first ? 0.05 * w : 6))) * ease(clamp((b - x) / 3.5))
      * (after && x > f ? 1 + 0.75 * after.on * ease(clamp((x - f) / 6)) : 1);
    // The ground: grains fixed in the sound, so they move with it, a little brighter where the piano is struck.
    const { top, bottom } = axis(row), grainEvery = 42;
    for (let g = Math.ceil(Math.min(when(a), when(b)) / grainEvery); g * grainEvery <= Math.max(when(a), when(b)); g++) {
      const x = c + dir * (g * grainEvery - clock.ms) * pace;
      for (let j = 0; j < (piano ? 3 : 2); j++) {
        const r = hash01(g * 7 + j), gy = top + (bottom - top) * hash01(g * 13 + j * 5 + 1);
        put(x + (r - 0.5) * 6, gy, 1.8, (0.035 + 0.05 * r * (piano ? pianoAt(g * grainEvery).ring : 0.4)) * edge(x) * k * lit);
      }
    }
    // Each thread is sampled by its own length, so its steep parts stay as unbroken as its flat ones.
    const last = VOICE_HARMONICS.map(() => ({ x: a, y: NaN, run: fine }));
    for (let x = a; x <= b; x += fine / 3) {
      const v = voiceAt(when(x)), e = edge(x) * v.amp * k * lit;
      VOICE_HARMONICS.forEach((dc, i) => {
        const p = last[i], yy = y(v.cents + dc);
        p.run += Number.isNaN(p.y) ? fine : Math.hypot(x - p.x, yy - p.y); p.x = x; p.y = yy;
        if (p.run < fine) return;
        p.run = 0;
        put(x, yy, i ? 2.2 : 2.8, (i ? 0.31 : 0.5) * VOICE_GAIN[i] * e);
      });
    }
    if (!piano) return;
    for (let x = a + bead / 2; x <= b; x += bead) {
      const p = pianoAt(when(x)), e = edge(x) * p.ring * k * lit;
      for (const m of p.chord) PIANO_PARTIALS.forEach((dc, i) => put(x, y(m * 100 + dc), (i ? 1.7 : 2) + 1.6 * p.ring, (i ? 0.32 : 0.46) * PIANO_GAIN[i] * e));
    }
  };

  // A model's reach in time, in the band under the sound: one row of beads per layer, the frame given out at the top
  // (on the moment of computing) and the sound's frames at the bottom, each row as wide as that many layers reach.
  // Before the moment the beads are quiet; after it, the future reference, they are bright. A reach that runs past the
  // sound fades out there. `rows` 0 draws a single row, for a reach that is the same at every layer.
  const reach = (moment: number, y0: number, y1: number, rows: number, of: (j: number) => { back: number; ahead: number }, limit: readonly [number, number], k: number) => {
    const f = X(moment), lo = X(limit[0]), hi = X(limit[1]);
    for (let j = 0; j <= rows; j++) {
      const yy = rows ? y0 + (y1 - y0) * j / rows : y0, r = of(rows ? j : 1), from = f - r.back * pace, to = f + r.ahead * pace;
      const step = 2.4 * d, open = (x: number) => ease(clamp((x - lo) / 24)) * ease(clamp((hi - x) / 24));
      for (let x = Math.max(lo, f - Math.floor((f - from) / step) * step); x <= Math.min(hi, to) + 0.01; x += step) {
        const ahead = x > f + 0.5;
        put(x, yy, ahead ? 2.3 : 1.9, (ahead ? 0.42 : 0.17) * open(x) * k * lit);
      }
    }
    put(f, y0, 3.8, 0.6 * k * lit);
  };
  // The moment of computing: a thin line up through the sound and its band.
  const moment = (row: Row01, x: number, k: number, pulse = 0) => {
    const { top, band } = axis(row);
    for (let y = top - 8; y <= band[1]; y += 2.4 * d) put(X(x), y, 1.7, 0.2 * (1 + 0.9 * pulse) * k * lit);
  };
  // What leaves a model: its pitch distribution for the frame, a beam glowing at the voice's pitch. By default the work
  // runs along it as a soft highlight; given beads, it carries them instead, each at a fraction of the way along.
  const beam = (row: Row01, xa: number, xb: number, k: number, ms: number, beads?: { q: number; size: number; light: number }[]) => {
    const { top, bottom, y } = axis(row), a = X(xa), b = X(xb), spread = 0.07 * (bottom - top), cy = y(voiceAt(ms).cents);
    for (let x = a; x <= b; x += 1.6 * d) {
      const q = (x - a) / (b - a), grow = ease(clamp((x - a) / 12));
      const run = beads ? 0.55 : 0.7 + 0.6 * Math.exp(-(((q - (t / 1000) % 1) / 0.14) ** 2));
      put(x, cy, 2.6, 0.3 * run * grow * k * lit);
      for (const j of [-1, 1]) for (const g of [0.45, 0.95]) put(x, cy + j * g * spread, 5, 0.07 * Math.exp(-g * g) * grow * k * lit);
    }
    for (const bead of beads ?? []) if (bead.q >= 0 && bead.q <= 1) put(a + (b - a) * bead.q, cy, bead.size, bead.light * k * lit);
  };
  // The distribution standing up the row, each bin reaching out as far as it is likely: a body and a peak at the voice.
  const distribution = (row: Row01, k: number, ms: number) => {
    const { top, bottom } = axis(row), ax = X(COL01.axis), reach = X(COL01.spread);
    const peak = (voiceAt(ms).cents - AXIS_LO) / (AXIS_HI - AXIS_LO), bins = 46;
    for (let i = 0; i < bins; i++) {
      const q = i / (bins - 1), y = bottom - q * (bottom - top), d = (q - peak) / 0.07, p = 0.04 + 0.96 * Math.exp(-d * d);
      for (let x = ax; x <= ax + p * reach; x += 2.6 * Math.max(1, w / 900)) put(x, y, 2.6, (0.16 + 0.55 * p * (1 - 0.5 * (x - ax) / reach)) * k);
      put(ax, y, 2.4, 0.22 * k);
    }
  };
  // How much of the voice (or the piano) stands at a pitch, for the models to light what they read.
  const voiceNear = (ms: number, c: number, width: number) => {
    const v = voiceAt(ms);
    return VOICE_HARMONICS.reduce((s, dc, i) => Math.max(s, VOICE_GAIN[i] * Math.exp(-(((v.cents + dc - c) / width) ** 2))), 0);
  };
  const pianoNear = (ms: number, c: number, width: number) => {
    const p = pianoAt(ms);
    return p.chord.reduce((s, m) => PIANO_PARTIALS.reduce((r, dc, i) => Math.max(r, PIANO_GAIN[i] * p.ring * Math.exp(-(((m * 100 + dc - c) / width) ** 2))), s), 0);
  };

  // A curve drawn as an unbroken line of light: `at(q)` gives its point for q from 0 to 1, `light(q)` its brightness.
  // Points are spaced by length, so a curve keeps its weight wherever it bends.
  const strand = (at: (q: number) => [number, number], light: (q: number) => number, size: number, gap = 2) => {
    let [px, py] = at(0), run = 0;
    const step = gap * d;
    for (let i = 1; i <= 160; i++) {
      const q = i / 160, [x, y] = at(q);
      run += Math.hypot(x - px, y - py); px = x; py = y;
      if (run < step) continue;
      run = 0;
      put(x, y, size, light(q));
    }
  };

  // Mel-RoFormer: the spectrum cut into bands, one token each, and attention joining the tokens. Drawn as a nest of
  // half-rings of one shape, each joining two tokens: the tokens that hold the voice's harmonics are joined to one
  // another and glow, the piano's stay dim, and one token at a time, sweeping up the column, reaches out to all the
  // others. Light runs along the rings.
  const roformer = (row: Row01, xa: number, xb: number, k: number, ms: number) => {
    const { top, bottom } = axis(row), a = X(xa), sw = X(xb) - a, N = 11, band = (AXIS_HI - AXIS_LO) / N;
    const ny = (i: number) => bottom - (i + 0.5) / N * (bottom - top), nx = a + sw * 0.1, reachX = sw * 0.84 / (N - 1);
    const voice = Array.from({ length: N }, (_, i) => voiceNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.55));
    const piano = Array.from({ length: N }, (_, i) => pianoNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.55));
    const flow = (t / 1600) % 1, query = (t / 3200) % 1 * (N + 2) - 1;
    const ring = (i: number, j: number, light: number) => {
      const y0 = ny(i), y1 = ny(j), cy = (y0 + y1) / 2, ry = Math.abs(y1 - y0) / 2, rx = reachX * Math.abs(j - i);
      strand((q) => { const th = -Math.PI / 2 + Math.PI * q; return [nx + rx * Math.cos(th), cy + ry * Math.sin(th) * Math.sign(y1 - y0)]; },
        (q) => light * (0.65 + 0.7 * Math.exp(-((((q - flow + 1) % 1 - 0.5) * 5) ** 2))), 2, 2.2);
    };
    for (let i = 0; i < N - 1; i++) ring(i, i + 1, 0.09 * k);
    for (let i = 0; i < N; i++) for (let j = i + 2; j < N; j++) {
      const both = Math.sqrt(voice[i] * voice[j]), asked = Math.exp(-((i - query) ** 2) / 0.5) + Math.exp(-((j - query) ** 2) / 0.5);
      const light = 0.26 * both + 0.07 * asked * (0.4 + voice[i] + voice[j]);
      if (light > 0.015) ring(i, j, light * k);
    }
    for (let i = 0; i < N; i++) {
      for (let x = a + 2; x < nx - 3; x += 3) put(x, ny(i), 1.8, 0.08 * k);
      put(nx, ny(i), 4 + 1.5 * voice[i], (0.15 + 0.5 * voice[i] + 0.12 * piano[i] + 0.25 * Math.exp(-((i - query) ** 2) / 0.5)) * k);
    }
  };
  // FCPE: the stem's spectrum taken as channels. Its depthwise kernels work inside each channel along time (its band
  // below shows how far), so the channels run side by side like strings and never cross, each held at both ends and
  // swaying a little; each of its six layers then mixes all the channels at once, a band of light across every string,
  // passing from front to back. The strings that carry the voice's harmonics are lit.
  const fcpe = (row: Row01, xa: number, xb: number, k: number, ms: number) => {
    const { top, bottom } = axis(row), a = X(xa), b = X(xb), L = 8, band = (AXIS_HI - AXIS_LO) / L;
    const work = (t / 1400) % 1 * (FCPE_LAYERS + 2) - 1, layerX = (l: number) => a + (b - a) * (l + 0.5) / FCPE_LAYERS;
    const glow = (l: number) => Math.exp(-((l - work) ** 2) / 0.5);
    const passing = (x: number) => {
      let s = 0;
      for (let l = 0; l < FCPE_LAYERS; l++) s = Math.max(s, glow(l) * Math.exp(-(((x - layerX(l)) / (0.07 * (b - a))) ** 2)));
      return s;
    };
    for (let i = 0; i < L; i++) {
      const ly = bottom - (i + 0.5) / L * (bottom - top), e = voiceNear(ms, AXIS_LO + (i + 0.5) * band, band * 0.6);
      const sway = (0.6 + 0.9 * e) * u, phase = i * 0.9;
      strand((q) => [a + (b - a) * q, ly + sway * Math.sin(2 * Math.PI * (1.5 * q - t / 1800) + phase) * Math.sin(Math.PI * q)],
        (q) => (0.07 + 0.3 * e + 0.25 * passing(a + (b - a) * q)) * k, 1.9 + 0.8 * e, 1.8);
    }
    for (let l = 0; l < FCPE_LAYERS; l++) for (let y = top; y <= bottom; y += 3 * d) put(layerX(l), y, 1.8, (0.06 + 0.22 * glow(l)) * k);
  };
  // The CNN: its input stacks the spectrum shifted by the harmonic ratios (HCQT), so each harmonic of the voice lands on
  // the voice's own pitch, and its layers of small kernels (5 bins in pitch) look only near each pitch, about ±520 cents
  // after all of them. Drawn as a lens: one bundle round each of the voice's first four harmonics bends onto its pitch;
  // the rest of the spectrum sends nothing. Its fourteen layers are faint marks along the strands, light runs through
  // them to the focus, and what comes out is a narrow distribution, not a point. `tick` swells it.
  const cnn = (row: Row01, xa: number, xb: number, k: number, ms: number, tick = 0) => {
    const { y } = axis(row), a = X(xa), b = X(xb), L = CNN_LAYERS + 1, f0 = voiceAt(ms).cents, flow = (t / 1100) % 1;
    const bend = (q: number) => 0.5 - 0.5 * Math.cos(Math.PI * q);
    VOICE_HARMONICS.forEach((dc, hi) => {
      for (let r = -2; r <= 2; r++) {
        const from = f0 + dc + r * 260;
        if (from < AXIS_LO || from > AXIS_HI) continue;
        const ey = y(from), ty = y(f0 + r * 60), light = VOICE_GAIN[hi] * (1 - 0.2 * Math.abs(r));
        const at = (q: number): [number, number] => [a + (b - a) * q, ey + (ty - ey) * bend(q)];
        strand(at, (q) => light * (0.13 + 0.17 * q) * (0.75 + 0.6 * Math.exp(-(((q - flow) / 0.1) ** 2))) * k, 1.9, 2.3);
        for (let i = 0; i < L; i++) { const [x, yy] = at((i + 0.5) / L); put(x, yy, 2.1, light * 0.12 * k); }
      }
    });
    for (let j = -4; j <= 4; j++) put(b, y(f0 + j * 55), 3 + (j ? 0 : 2.5 * tick), (0.55 * Math.exp(-j * j / 5) + 0.2 * tick * Math.exp(-j * j / 3)) * k);
    put(b, y(f0), 9, 0.12 * k);
  };

  const OLD = 0.72, NEW = 1.2, [top, bottom] = ROW01, topBand = axis(top).band, bottomBand = axis(bottom).band;
  const mix = [COL01.input, COL01.roformer[0]] as const;

  // Above: the pipeline as it was, run on recordings, clear but quieter. The mix goes into Mel-RoFormer; out of it comes
  // the voice alone (the vocal stem), which goes into FCPE; FCPE gives the distribution. Its band holds two reaches:
  // Mel-RoFormer's, the whole chunk, as one row; FCPE's, widening layer by layer, under it.
  const s = cursor01(t);
  const ph = ((t % BATCH01) + BATCH01) % BATCH01, batch = variant === 2;
  const flashR = batch ? flashAt(ph, 0, 320) : 0, flashF = batch ? flashAt(ph, 450, 320) : 0, flashD = batch ? flashAt(ph, 1150, 500) : 0;
  const dim = batch ? 0.8 : 1, on = s.on;
  // The cursor is the frame being given out, the same moment in both rows. The models above reach past it into the
  // recording; below, live, the sound has come in only 20ms past it (the two frames the CNN's first layer looks ahead),
  // so that is all the CNN reaches, and after that there is nothing yet.
  const line = s.line, ms = t;
  const clock: Clock01 = { x: COL01.input, ms: CURSOR01.start };
  const fcpeBand: [number, number] = [topBand[0] + 0.28 * (topBand[1] - topBand[0]), topBand[1]];
  sound(top, mix[0], mix[1], clock, true, OLD * (dim + 1.2 * flashR), true, { x: line, on });
  // The vocal stem flows out of Mel-RoFormer into FCPE; what reaches FCPE is the moment it computes, so the pitch that
  // goes in is the pitch that comes out.
  sound(top, COL01.stem[0], COL01.stem[1], { x: COL01.stem[1], ms, flow: true }, false, OLD * (dim + 1.2 * flashF), false);
  if (on > 0.01) {
    moment(top, line, OLD * on);
    reach(line, topBand[0], topBand[0], 0, () => ({ back: Infinity, ahead: Infinity }), mix, OLD * on);
    reach(line, fcpeBand[0], fcpeBand[1], FCPE_LAYERS, fcpeReach, mix, OLD * on);
  }
  roformer(top, COL01.roformer[0], COL01.roformer[1], OLD * (dim + 0.9 * flashR), ms);
  fcpe(top, COL01.fcpe[0], COL01.fcpe[1], OLD * (dim + 0.9 * flashF), ms);
  const packet = (ph - 700) / 450;
  beam(top, COL01.fcpe[1], COL01.axis, OLD, ms, batch ? [0, 0.08, 0.16].map((lag, i) => ({ q: packet - lag, size: 9 - 2.5 * i, light: 0.9 - 0.25 * i })) : undefined);
  distribution(top, OLD * (dim + 0.5 * flashD), ms);

  // Below: what was built, run live. The same mix has come in up to 20ms past the frame, where the CNN stands: after
  // that there is nothing yet, drawn as empty frames in its band. In variant 2 it gives out a frame every tick.
  const tick = batch ? Math.exp(-(((t % TICK01) + TICK01) % TICK01) / 45) : 0, newest = COL01.now + STUB01;
  sound(bottom, COL01.input, newest, { x: COL01.now, ms: t }, true, 1, true, { x: COL01.now, on: 1 });
  moment(bottom, COL01.now, NEW, tick);
  reach(COL01.now, bottomBand[0], bottomBand[1], CNN_LAYERS, cnnReach, [COL01.input, newest], NEW);
  for (let x = X(newest) + 5 * d; x <= X(0.56); x += 5 * d) put(x, bottomBand[1], 2, 0.13 * lit);
  cnn(bottom, COL01.cnn[0], COL01.cnn[1], NEW, t, tick);
  const stream = batch ? Array.from({ length: Math.ceil(700 / TICK01) + 1 }, (_, n) => ({ q: ((((t % TICK01) + TICK01) % TICK01) + n * TICK01) / 700, size: 4.6, light: 0.55 })) : undefined;
  beam(bottom, COL01.cnn[1], COL01.axis, NEW, t, stream);
  distribution(bottom, NEW, t);

  // The training answer: an arc outside the two distributions, from the one above down to the one below, sparse and
  // set apart from the distributions' own axis, with its head at the bottom.
  const mid = (row: Row01) => { const a = axis(row); return (a.top + a.bottom) / 2; };
  const ax = X(COL01.answer), y0 = mid(top), y1 = mid(bottom), bulge = X(0.035);
  for (let i = 0; i <= 26; i++) {
    const q = i / 26, run = Math.exp(-(((q - (t / 2200) % 1) * 9) ** 2));
    put(ax + bulge * Math.sin(q * Math.PI), y0 + (y1 - y0) * q, 3.2, 0.14 + 0.4 * run);
  }
  for (const [dx, dy] of [[-5, -7], [5, -7], [0, 0]]) put(ax + dx, y1 + dy, 3, 0.4);
}

export function PitchOnly() {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const [variant, setVariant] = useState<Variant01>(0);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v");
    setVariant(v === "2" ? 2 : 0);
  }, []);
  const scene = useCallback<Scene>((put, t, w, h, dark) => pitchOnlyScene(put, t, w, h, dark, variant), [variant]);
  // The words above go with the cursor: its name ends at the line, the future reference starts after it and fades as
  // the recording runs out, the far end of FCPE's reach is named where it ends, and the mix's name makes way while the
  // future reference passes over it.
  const moving = useRef<(HTMLSpanElement | null)[]>([]);
  const onFrame = (t: number) => {
    const s = cursor01(t), end = Math.min(COL01.roformer[0], s.line + 0.9 * PACE01);
    const place = (i: number, left: number, opacity: number) => { const el = moving.current[i]; if (el) { el.style.left = pct(left); el.style.opacity = String(opacity); } };
    place(0, s.line, s.on);
    place(1, s.line, s.on * clamp((COL01.roformer[0] - s.line) / 0.06));
    place(2, end, s.on * clamp((COL01.roformer[0] - s.line) / 0.03));
    const first = moving.current[0];
    if (first?.parentElement) first.style.transform = s.line * first.parentElement.clientWidth < first.offsetWidth + 8 ? "translateX(5px)" : "";
    const a = moving.current[1], b = moving.current[3];
    if (a && b) {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), apart = Math.max(rb.left - ra.right, ra.left - rb.right);
      b.style.opacity = String(Number(a.style.opacity) > 0.05 ? 0.12 + 0.88 * clamp(apart / 16) : 1);
    }
  };
  const hold = (i: number) => (el: HTMLSpanElement | null) => { moving.current[i] = el; };

  const [top, bottom] = ROW01, topBand = rowAxis(top).band, bottomBand = rowAxis(bottom).band;
  const fcpeMid = topBand[0] + 0.64 * (topBand[1] - topBand[0]);
  const modelName = (text: string, x0: number, x1: number, row: Row01, dim: boolean) => <span className="lf-tag" data-center="" data-dim={dim ? "" : undefined} style={{ left: pct((x0 + x1) / 2), top: pct(row.y0 - 0.05) }}><b>{text}</b></span>;
  // Names in the left margin: the voice and the piano at their pitch, each reach at its row of the band.
  const margin = (text: string, y: number, dim: boolean) => <span className="lf-tag lf-lane" data-dim={dim ? "" : undefined} style={{ left: "0%", top: pct(y) }}>{text}</span>;
  const tag = (text: ReactNode, left: number, y: number, how: { dim?: boolean; wide?: boolean; align?: "start" | "end" | "center" }, ref?: (el: HTMLSpanElement | null) => void) =>
    <span ref={ref} className="lf-tag" data-dim={how.dim ? "" : undefined} data-wide={how.wide ? "" : undefined}
      data-start={how.align === "start" ? "" : undefined} data-end={how.align === "end" ? "" : undefined} data-center={how.align === "center" ? "" : undefined}
      style={{ left: pct(left), top: pct(y) }}>{text}</span>;
  return <LightField scene={scene} still={2600} onFrame={onFrame}
    label="위는 원래 파이프라인으로, 녹음에서 학습 정답을 만든다. 섞인 소리에서 Mel-RoFormer가 피아노를 걸러 보컬 스템을 만들고, 그 보컬을 FCPE가 읽어 음높이 분포를 낸다. 아래는 우리가 만든 것으로, 휴대폰에서 실시간으로 같은 섞인 소리를 CNN 하나가 바로 같은 음높이 분포로 바꾼다. 소리는 음높이 축 위의 스펙트로그램이다. 위는 녹음이라 소리는 멈춰 있고 계산하는 프레임이 커서처럼 그 위를 지나가며, 아래는 실시간이라 커서는 서 있고 소리가 흘러 들어온다. 두 커서는 늘 같은 순간에 있다. 위는 커서 뒤에도 소리가 이어지고, 두 모델이 그 뒤의 소리까지 쓴다: Mel-RoFormer는 구간 전체, FCPE는 층마다 앞뒤로 넓어져 약 900ms를 미래 참조한다. 아래는 실시간이라 그 프레임 뒤 20ms까지만 소리가 들어와 있고, 그 뒤는 아직 없다. CNN은 층마다 과거 쪽으로 넓어지고, 입력에 가장 가까운 층만 20ms를 미래 참조한다. CNN은 목소리 기본음과 배음 주변의 소리만 모아 음높이 하나로 접는다. 위의 분포가 바깥쪽 호를 따라 내려와 CNN이 배우는 학습 정답이 된다.">
    {tag(<><b>원래 파이프라인</b>학습 정답 생성</>, 0, 0, { dim: true })}
    {tag(<><b>우리가 만든 것</b>휴대폰에서 실행</>, 0, 0.5, {})}
    {ROW01.map((row, r) => [["목소리", 6900], ["반주", 5750]].map(([name, c]) => <span key={`${r}${name}`}>{margin(name as string, rowAxis(row).at(c as number), r === 0)}</span>))}
    {margin("Mel-RoFormer", topBand[0], true)}
    {margin("FCPE", fcpeMid, true)}
    {margin("CNN", (bottomBand[0] + bottomBand[1]) / 2, false)}
    {modelName("Mel-RoFormer", COL01.roformer[0], COL01.roformer[1], top, true)}
    {modelName("FCPE", COL01.fcpe[0], COL01.fcpe[1], top, true)}
    {modelName("CNN", COL01.cnn[0], COL01.cnn[1], bottom, false)}
    {tag("계산하는 프레임", COL01.now, top.y0 - 0.015, { align: "end", wide: true }, hold(0))}
    {tag("계산하는 프레임", COL01.now, bottom.y0 - 0.015, { align: "end" })}
    {tag("섞인 소리", COL01.input, top.y1 + 0.012, { dim: true, wide: true }, hold(3))}
    {tag(<><b>미래 참조</b></>, COL01.now, top.y1 + 0.012, { align: "start" }, hold(1))}
    {tag("약 900ms", Math.min(COL01.roformer[0], COL01.now + 0.9 * PACE01), fcpeMid - 0.012, { dim: true, align: "start", wide: true }, hold(2))}
    {tag("구간 전체", COL01.roformer[0], topBand[0] - 0.012, { dim: true, align: "start", wide: true })}
    {tag("보컬 스템", (COL01.stem[0] + COL01.stem[1]) / 2, top.y1 + 0.012, { dim: true, align: "center", wide: true })}
    {tag("음높이 분포", COL01.axis + COL01.spread / 2, top.y1 + 0.012, { dim: true, align: "center" })}
    {tag("섞인 소리", COL01.input, bottom.y1 + 0.012, {})}
    {tag(<><b>미래 참조</b>20ms</>, COL01.now, bottom.y1 + 0.012, { align: "start" })}
    {tag("아직 없음", 0.515, bottom.y1 + 0.012, { align: "start", dim: true })}
    {tag("음높이 분포", COL01.axis + COL01.spread / 2, bottom.y1 + 0.012, { align: "center" })}
    {tag("학습 정답", COL01.answer - 0.085, 0.488, {})}
  </LightField>;
}
