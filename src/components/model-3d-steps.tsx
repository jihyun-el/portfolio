"use client";

import * as THREE from "three";
import { CNN_ASPECT, GlowFigure, WATERFALL, cnnStack, pianoWave, wave, type Kit, type Made, type Shot, type Tag, type V3 } from "@/components/model-3d";
import { PHONE_ASPECT, phoneOutline } from "@/lib/phone-outline";
import { AXIS_HI, AXIS_LO, DUET_LOOP, PIANO_GAIN, PIANO_PARTIALS, VOICE_GAIN, VOICE_HARMONICS, pianoAt, voiceAt } from "@/components/model-figures";

// The pitch model's steps 02 to 07, drawn in the same light as 01 (src/components/model-3d.tsx): points and lines only,
// one relation per picture. Every picture is an example made from rules; only the numbers in its words are measured.

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (q: number) => q * q * q * (q * (q * 6 - 15) + 10);
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const loopMs = (ms: number) => ((ms % DUET_LOOP) + DUET_LOOP) % DUET_LOOP;
const lerp3 = (a: V3, b: V3, q: number): V3 => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
const bezier = (a: V3, c: V3, b: V3) => (q: number): V3 => [0, 1, 2].map((i) => (1 - q) ** 2 * a[i] + 2 * q * (1 - q) * c[i] + q * q * b[i]) as V3;

// The drawing tools every picture shares: a line, a point, a curve drawn as a line of light.
function pen(kit: Kit) {
  const root = new THREE.Group(), lines = kit.segments(9000), light = kit.cloud(12000);
  root.add(lines.object, light.object);
  let seg = 0, dot = 0;
  const line = (a: V3, b: V3, ca: number, cb = ca) => { if (seg < 9000) lines.set(seg++, a, b, ca, cb); };
  const put = (x: number, y: number, z: number, size: number, a: number) => { if (dot < 12000 && a > 0.002) light.set(dot++, x, y, z, size, a); };
  const strand = (at: (q: number) => V3, glow: (q: number) => number, size: number, gap = 0.022, steps = 120) => {
    let [px, py, pz] = at(0), run = gap;
    for (let i = 0; i <= steps; i++) {
      const q = i / steps, [x, y, z] = at(q);
      run += Math.hypot(x - px, y - py, z - pz); px = x; py = y; pz = z;
      if (run < gap) continue;
      run = 0; put(x, y, z, size, glow(q));
    }
  };
  return {
    root, line, put, strand,
    begin: () => { seg = 0; dot = 0; },
    end: () => { lines.clear(seg); light.hide(dot); lines.commit(); light.commit(); },
    dispose: () => { lines.dispose(); light.dispose(); },
  };
}
type Pen = ReturnType<typeof pen>;
const picture = (draw: (p: Pen, s: number) => void) => (kit: Kit): Made => {
  const p = pen(kit);
  return { root: p.root, dispose: p.dispose, update: (s) => { p.begin(); draw(p, s); p.end(); } };
};

// The engine's pitch distribution: one bar of light for each bin, as tall as it is likely.
const BIN_LO = 5600, BIN_HI = 8400, BIN = 50;
function bars(p: Pen, xa: number, xb: number, base: number, height: number, cents: number, amp: number, k: number, z = 0) {
  for (let c = BIN_LO; c <= BIN_HI; c += BIN) {
    const x = xa + (xb - xa) * (c - BIN_LO) / (BIN_HI - BIN_LO), dc = c - cents;
    const v = amp * (0.8 * Math.exp(-(dc * dc) / (2 * 70 * 70)) + 0.14 * Math.exp(-(dc * dc) / (2 * 260 * 260))) + 0.012 * hash(c * 0.071);
    p.line([x, base, z], [x, base + v * height, z], 0.03 * k, (0.1 + 0.9 * v) * k);
    p.put(x, base + v * height, z, 1.4 + 13 * v, k * (0.08 + 0.8 * v));
  }
  p.line([xa, base, z + 0.06], [xb, base, z + 0.06], 0.2 * k);
}
const barPeak = (xa: number, xb: number, base: number, height: number, cents: number, amp: number): V3 =>
  [xa + (xb - xa) * (cents - BIN_LO) / (BIN_HI - BIN_LO), base + 0.94 * amp * height, 0];

// The CNN as every picture draws it (src/components/model-3d.tsx, cnnStack).
const cnn = (p: Pen, xa: number, w: number, yc: number, k: number, s: number) => cnnStack(p.line, p.put, xa, w, yc, k, s);

// Small shapes the pictures share: an arc of a ring from 12 o'clock clockwise, a rounded outline (the score meter).
const arc = (cx: number, cy: number, z: number, r: number, from: number, to: number) => (q: number): V3 => {
  const a = 2 * Math.PI * (from + (to - from) * q);
  return [cx + r * Math.sin(a), cy + r * Math.cos(a), z];
};
const squircle = (cx: number, cy: number, z: number, w: number, h: number) => (q: number): V3 => {
  const a = 2 * Math.PI * q, c = Math.cos(a), s = Math.sin(a);
  return [cx + w / 2 * Math.sign(c) * Math.abs(c) ** (1 / 3), cy + h / 2 * Math.sign(s) * Math.abs(s) ** (1 / 3), z];
};
// The phone as the landing draws it (src/lib/phone-outline.ts), standing `h` tall.
function phone(p: Pen, cx: number, cy: number, z: number, h: number, k: number) {
  const pts = phoneOutline(cx, cy, h * PHONE_ASPECT, h, 0.035, 1);
  pts.forEach(([x, y], i) => {
    p.put(x, y, z, 3, 0.6 * k);
    // The same outline traced in a faint line as well, so it holds in the light theme.
    const [nx, ny] = pts[(i + 1) % pts.length];
    if (Math.hypot(nx - x, ny - y) < 0.1) p.line([x, y, z], [nx, ny, z], 0.035 * k);
  });
}
// Corner brackets round a box: the frame a card or a wall of channels is given in this screen's light.
function brackets(p: Pen, x0: number, x1: number, y0: number, y1: number, z: number, k: number, arm = 0.2) {
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ax = sx < 0 ? x0 : x1, ay = sy < 0 ? y0 : y1;
    p.line([ax, ay, z], [ax - sx * arm, ay, z], k); p.line([ax, ay, z], [ax, ay - sy * arm, z], k);
  }
}
// The pitch of a moment drawn on a strip: `y0` is where 6250 cents sits, `h` how tall 2100 cents stand.
const pitchOn = (y0: number, h: number) => (c: number) => y0 + (c - 6250) / 2100 * h;

// ---- 02 Measured before training ---------------------------------------------------------------------------------
// Skeletons before training, their weights random, are put into the phone one after another, each bigger than the one
// before, as the probe built them: L, 14 layers of 80 channels; XL, 16 of 128; XXL, 20 of 192. In the phone the sound
// comes in at the bottom, either the whole window the skeleton sees (27, 31, 39 frames) recomputed at every call or
// only the newest frame, and goes up into the CNN, drawn as every picture draws it, as big as the skeleton and unlit
// before training. Beside the phone each call's time rises as a column of light, as the engine draws an amount, under a
// ceiling of light at 10ms, the time before the next frame arrives. Recomputing the window, L and XL stay under it; XXL
// breaks through and runs on to 22.3ms, crossed out. The same XXL called frame by frame stays under again. At the end
// the phone holds L again and its CNN lights: L is the one trained. The measurements as recorded: iPhone 17, low power
// mode, the worst call once steady (the latency probe of 2026-06-12); iPhone 15 gave 8.19ms for the last.
type Run02 = { name: string; layers: number; ch: number; params: string; window: number; ms: number };
const RUNS02: Run02[] = [
  { name: "L", layers: 14, ch: 80, params: "116만", window: 27, ms: 3.603 },
  { name: "XL", layers: 16, ch: 128, params: "346만", window: 31, ms: 7.405 },
  { name: "XXL", layers: 20, ch: 192, params: "998만", window: 39, ms: 22.309 },
  { name: "XXL", layers: 20, ch: 192, params: "998만", window: 1, ms: 7.497 },
];
const SWAP02 = 0.8, FEED02 = 0.7, PER_MS02 = 0.11, HOLD02 = 1.1, REST02 = 3.4, BUDGET02 = 10;
const DUR02 = RUNS02.map((r) => SWAP02 + FEED02 + r.ms * PER_MS02 + HOLD02);
const START02 = DUR02.map((_, i) => DUR02.slice(0, i).reduce((a, b) => a + b, 0));
const RUNS_END02 = START02[RUNS02.length - 1] + DUR02[RUNS02.length - 1], LOOP02 = RUNS_END02 + REST02;
const PHONE02: V3 = [0, 0.05, 0], PH02 = 3.5, LENS_Y02 = 0.7;
const STRIP02 = { x0: -0.6, x1: 0.6, y0: -1.3, y1: -0.6, cw: 0.03 };
const COLS02 = { xs: [2.0, 2.95, 3.9, 4.85], floor: -1.45, unit: 0.16 }, CEIL02 = COLS02.floor + BUDGET02 * COLS02.unit;
// Where the loop stands: which run, how far into it, how many milliseconds it has computed, and the end after the runs.
const at02 = (s: number) => {
  const u = s % LOOP02;
  if (u >= RUNS_END02) return { i: 0, into: 0, ms: 0, done: true, end: u - RUNS_END02 };
  let i = 0;
  while (i < RUNS02.length - 1 && u >= START02[i + 1]) i++;
  const into = u - START02[i], run = RUNS02[i], t = into - SWAP02 - FEED02;
  return { i, into, ms: clamp(t / PER_MS02, 0, run.ms), done: t >= run.ms * PER_MS02, end: -1 };
};
// How far run k's column has risen (ms): full once it has finished, growing while it is timed, none before.
const msOf02 = (k: number, s: number) => {
  const a = at02(s);
  return a.end >= 0 || k < a.i ? RUNS02[k].ms : k === a.i ? a.ms : 0;
};
const cross02 = (p: Pen, x: number, y: number, d: number, k: number) => {
  p.line([x - d, y - d, 0], [x + d, y + d, 0], 0.9 * k); p.line([x - d, y + d, 0], [x + d, y - d, 0], 0.9 * k);
};
const ring02 = (p: Pen, cx: number, cy: number, r: number, to: number, c: number) => {
  const at = arc(cx, cy, 0, r, 0, to), n = Math.max(8, Math.ceil(96 * to));
  for (let i = 0; i < n; i++) p.line(at(i / n), at((i + 1) / n), c);
};
// A column of light as the engine draws an amount: stacked points, hotter above the ceiling, a spark at the top while
// it grows.
function column02(p: Pen, x: number, ms: number, k: number, live: boolean) {
  const top = COLS02.floor + ms * COLS02.unit;
  for (let y = COLS02.floor + 0.03; y <= top + 1e-6; y += 0.055) {
    const over = y > CEIL02;
    for (const dx of [-0.07, 0, 0.07]) for (const dz of [-0.07, 0.07]) p.put(x + dx, y, dz, over ? 5.2 : 4.4, k * (over ? 0.8 : 0.5));
  }
  if (live && ms > 0) { p.put(x, top, 0, 16, 0.9 * k); p.put(x, top, 0, 34, 0.14 * k); }
}
const yStrip02 = (c: number) => STRIP02.y0 + 0.05 + (c - AXIS_LO) / (AXIS_HI - AXIS_LO) * (STRIP02.y1 - STRIP02.y0 - 0.1);
const draw02 = (p: Pen, s: number) => {
  const a = at02(s), run = a.end >= 0 ? RUNS02[0] : RUNS02[a.i], end = a.end >= 0;
  const swap = end ? 1 : a.i > 0 && RUNS02[a.i - 1].ch === run.ch ? 1 : ease(clamp(a.into / SWAP02));
  const feed = end ? 0 : clamp((a.into - SWAP02) / FEED02), trained = end ? ease(clamp((a.end - 0.6) / 1.4)) : 0;
  // The phone.
  phone(p, PHONE02[0], PHONE02[1], 0, PH02, 1);
  // The sound coming in at the bottom, newest at the right: the voice's harmonics as lines, the piano as beads.
  const cols = Math.round((STRIP02.x1 - STRIP02.x0) / STRIP02.cw), win = end ? 0 : run.window;
  const prev: (V3 | null)[] = VOICE_HARMONICS.map(() => null);
  for (let j = 0; j <= cols; j++) {
    const x = STRIP02.x0 + j * STRIP02.cw, back = cols - j, inWin = back < win, t = loopMs((s - back * 0.03) * 1000), pa = pianoAt(t), va = voiceAt(t);
    const g = (inWin ? 1 : 0.35) * ease(clamp(j / 5));
    if (j % 2 === 0) pa.chord.forEach((m) => p.put(x, yStrip02(m * 100), 0, 2 + 2.5 * pa.ring, (0.1 + 0.3 * pa.ring) * g));
    VOICE_HARMONICS.forEach((dc, h) => {
      const c = va.cents + dc;
      if (c > AXIS_HI) { prev[h] = null; return; }
      const at: V3 = [x, yStrip02(c), 0];
      if (prev[h]) p.line(prev[h]!, at, 0.55 * VOICE_GAIN[h] * va.amp * g);
      prev[h] = at;
    });
  }
  // The CNN, as big as the skeleton; unlit before training, lit once trained.
  // Swapped in, it grows from the size of the skeleton before it.
  const width = (r: Run02) => 0.5 + 0.55 * r.ch / 192, before = end || a.i === 0 ? run : RUNS02[a.i - 1];
  const w = width(before) + (width(run) - width(before)) * swap, timing = !end && a.into > SWAP02 + FEED02 && !a.done;
  const net = cnn(p, PHONE02[0] - w / 2, w, LENS_Y02, (end ? 0.6 + 0.4 * trained : timing ? 0.85 : 0.6) * (0.4 + 0.6 * swap), s);
  if (!end && a.into < 0.4 && swap < 1) p.put(PHONE02[0], LENS_Y02, 0, 40, 0.14 * (1 - a.into / 0.4));
  // The window being fed, in brackets, and its columns going up into the CNN's first layer: many, or one.
  if (win > 0) {
    const xw = STRIP02.x1 - (win - 0.5) * STRIP02.cw, flow = (s / 0.8) % 1, flows = Math.max(1, Math.round(win / 4));
    brackets(p, xw - 0.03, STRIP02.x1 + 0.03, STRIP02.y0 - 0.05, STRIP02.y1 + 0.05, 0, 0.45, Math.min(0.12, (STRIP02.x1 - xw) / 2 + 0.02));
    for (let f = 0; f < flows; f++) {
      const x = flows === 1 ? STRIP02.x1 : xw + (STRIP02.x1 - xw) * f / (flows - 1);
      p.strand(bezier([x, STRIP02.y1 + 0.07, 0], [x, net.foot[1] - 0.15, 0], net.foot), (q) => (0.1 + 0.5 * Math.exp(-(((q - flow) / 0.14) ** 2)) * (feed > 0 ? 1 : 0.2)) * (flows === 1 ? 1.6 : 1), 2.2, 0.05);
    }
  }
  // The ceiling at 10ms: a sheet of light across the columns, its front edge a line.
  for (let x = COLS02.xs[0] - 0.45; x <= COLS02.xs[3] + 0.45 + 1e-6; x += 0.12) for (let z = -0.42; z <= 0.42 + 1e-6; z += 0.14) p.put(x, CEIL02, z, 2.4, 0.13);
  p.line([COLS02.xs[0] - 0.5, CEIL02, 0.45], [COLS02.xs[3] + 0.5, CEIL02, 0.45], 0.5);
  p.line([COLS02.xs[0] - 0.5, COLS02.floor, 0.45], [COLS02.xs[3] + 0.5, COLS02.floor, 0.45], 0.08);
  // The columns: each call's time; at the end the trained one, L, alone stays bright.
  RUNS02.forEach((r, k) => {
    const ms = msOf02(k, s), live = !end && k === a.i && !a.done, kk = end ? (k === 0 ? 1 : 0.4) : 1;
    column02(p, COLS02.xs[k], ms, kk, live);
    if (ms >= r.ms - 1e-6 && r.ms > BUDGET02) cross02(p, COLS02.xs[k], COLS02.floor + r.ms * COLS02.unit + 0.3, 0.11, kk);
  });
};
const SHOT02: Shot = {
  target: [2.3, 0.3, 0], yaw: -0.2, tilt: 0.14, bloom: 0.4, stretch: 1,
  bounds: [[PHONE02[0] - 1.15, 2.75, 0], [COLS02.xs[3] + 0.7, 2.75, 0], [PHONE02[0] - 1.15, -2.0, 0], [COLS02.xs[3] + 0.7, -2.0, 0]],
};
const runTag02 = (k: number) => (s: number) => { const a = at02(s); return a.end < 0 && a.i === k ? 1 : 0; };
const endTag02 = (on: boolean) => (s: number) => ((at02(s).end >= 0) === on ? 1 : 0);
const fmt02 = (ms: number) => ms.toFixed(ms >= 10 ? 1 : 2);
const TAGS02: Tag[] = [
  { text: <><b>학습 전 뼈대</b><span className="lf-sub">무작위 가중치</span></>, at: () => [PHONE02[0], PHONE02[1] + PH02 / 2 + 0.1, 0], align: "above", fade: endTag02(false) },
  { text: <><b>L로 학습</b><span className="lf-sub">14층 · 80채널</span></>, at: () => [PHONE02[0], PHONE02[1] + PH02 / 2 + 0.1, 0], align: "above", fade: endTag02(true) },
  ...RUNS02.slice(0, 3).map((r, k): Tag => ({ text: <><b>{r.name}</b>{r.layers}층 · {r.ch}채널</>, at: () => [PHONE02[0], LENS_Y02 + 0.9, 0], align: "center", fade: (s) => (k === 2 ? runTag02(2)(s) + runTag02(3)(s) : runTag02(k)(s)) })),
  ...RUNS02.map((r, k): Tag => ({ text: r.window > 1 ? <><b>창 전체 재계산</b>{r.window}프레임</> : <><b>프레임 단위</b>새 1프레임</>, at: () => [PHONE02[0], STRIP02.y0 - 0.3, 0], align: "center", fade: runTag02(k) })),
  { text: <><b>10ms</b><span className="lf-sub">다음 프레임 전까지</span></>, at: () => [COLS02.xs[0] - 0.55, CEIL02, 0.45], align: "end" },
  ...RUNS02.map((r, k): Tag => ({ text: <b>{fmt02(r.ms)}ms</b>, at: () => [COLS02.xs[k], COLS02.floor + r.ms * COLS02.unit + (r.ms > BUDGET02 ? 0.55 : 0.18), 0], align: "above", fade: (s) => (msOf02(k, s) >= r.ms - 1e-6 ? 1 : 0), dim: r.ms > BUDGET02 })),
  ...RUNS02.map((r, k): Tag => ({ text: <><b>{r.name}</b>{r.window > 1 ? "창" : "프레임"}</>, at: () => [COLS02.xs[k], COLS02.floor - 0.22, 0.45], align: "center", dim: r.ms > BUDGET02 })),
  { text: <>iPhone 17 실측 · 저전력 · 정상 상태 최악값</>, at: () => [(COLS02.xs[0] + COLS02.xs[3]) / 2, COLS02.floor - 0.55, 0.45], align: "center", dim: true, wide: true },
];
export function DeviceProbe3D() {
  return <GlowFigure make={picture(draw02)} shot={SHOT02} tags={TAGS02} still={LOOP02 - 0.5}
    label="학습 전의 무작위 가중치 뼈대를 휴대폰에 하나씩, 점점 큰 것으로 갈아 끼우며 잰다. 휴대폰 안에서 소리가 아래로 들어와 위의 CNN(작아지는 층 넷)으로 올라간다. CNN은 뼈대만큼 크게 그렸고(L 14층 80채널, XL 16층 128채널, XXL 20층 192채널), 학습 전이라 꺼져 있다. 입력은 매번 창 전체(27 · 31 · 39프레임)를 다시 계산하거나 새 1프레임만 넣는다. 휴대폰 옆에는 호출 한 번의 시간이 빛 기둥으로 자라고, 10ms 높이에 빛의 천장이 있다(다음 프레임이 오기 전까지). 창 전체를 다시 계산하면 L은 3.60ms, XL은 7.41ms로 천장 아래에 머물고, XXL은 22.3ms로 천장을 뚫고 올라가 가위표가 붙는다. 같은 XXL을 프레임 단위로 부르면 7.50ms로 다시 천장 아래다(iPhone 15에서 8.19ms). 마지막에 휴대폰에 L이 다시 들어가 CNN이 켜진다: L로 학습했다. 측정 조건은 iPhone 17, 저전력 모드, 정상 상태의 최악값이다." />;
}

// ---- 03 Reference input ------------------------------------------------------------------------------------------
// The engine's VQT picture kept in its parts and drawn in this screen's light: two walls, the microphone's channels
// above and the reference's below, with the channels behind each wall shown by the brackets stacked behind it, and the
// CNN's window standing across both at the newest edge. In the walls the sound is drawn as 01's spectrogram: the voice
// as unbroken lines (its harmonics) swaying with vibrato, the piano as beads that flare where a note is struck. Above,
// the voice over the piano; below, the same piano, struck at the same moments, and no voice. Both come from the phone
// at the left: through the speaker and the air to the microphone, and straight in as the reference.
const PHONE03: V3 = [-0.45, 0, 0], X03 = 0.85, NOW03 = 5.0, PACE03 = 1.1, WIN03 = 0.4;
const WALLS03 = [{ y0: 0.5, y1: 2.0, mic: true }, { y0: -1.95, y1: -0.45, mic: false }] as const;
const LENS03 = [5.5, 6.6] as const, BARS03 = [6.85, 8.35] as const, SHEETS03 = 6, SHEET_DX03 = 0.045, SHEET_DY03 = 0.07;
const yWall03 = (w: (typeof WALLS03)[number], c: number) => w.y0 + (c - AXIS_LO) / (AXIS_HI - AXIS_LO) * (w.y1 - w.y0);
const draw03 = (p: Pen, s: number) => {
  const ms = loopMs(s * 1000), v = voiceAt(ms);
  WALLS03.forEach((w) => {
    // Six channels: six sheets, the front one in corner brackets, the five behind it showing their top and right edges.
    for (let layer = SHEETS03 - 1; layer >= 1; layer--) {
      // Both walls stack their sheets up and to the right; the walls stand far enough apart for the lower stack.
      const dx = layer * SHEET_DX03, dy = layer * SHEET_DY03, z = -layer * 0.06, a = 0.03 - 0.004 * layer;
      const x0 = X03 - 0.06 + dx, x1 = NOW03 + 0.06 + dx, y0 = w.y0 - 0.08 + dy, y1 = w.y1 + 0.08 + dy;
      p.line([x0, y1, z], [x1, y1, z], a); p.line([x1, y0, z], [x1, y1, z], a);
      p.line([x0, y1, z], [x0, y1 - 0.12, z], a); p.line([x1, y0, z], [x1 - 0.12, y0, z], a);
    }
    brackets(p, X03 - 0.06, NOW03 + 0.06, w.y0 - 0.08, w.y1 + 0.08, 0, 0.38, 0.2);
    const prev: (V3 | null)[] = VOICE_HARMONICS.map(() => null);
    let col = 0;
    for (let x = X03; x <= NOW03 + 1e-6; x += 0.035, col++) {
      const t = loopMs((s - (NOW03 - x) / PACE03) * 1000), edge = ease(clamp((x - X03) / 0.5)), pa = pianoAt(t);
      // The ground a spectrogram is never empty of.
      for (let g = 0; g < 2; g++) { const r = hash(Math.floor(t / 60) * 3.7 + g * 11.3 + (w.mic ? 0 : 5.1)); p.put(x, w.y0 + r * (w.y1 - w.y0), 0, 1.6, 0.05 * edge); }
      // The piano: beads, bright where a note is struck.
      if (col % 2 === 0) pa.chord.forEach((m) => PIANO_PARTIALS.forEach((dc, j) => p.put(x, yWall03(w, m * 100 + dc), 0, 2 + 5 * pa.ring * PIANO_GAIN[j], (0.08 + 0.5 * pa.ring) * PIANO_GAIN[j] * edge)));
      // The voice: unbroken lines, its harmonics, only in the microphone.
      if (w.mic) {
        const va = voiceAt(t);
        VOICE_HARMONICS.forEach((dc, h) => {
          const c = va.cents + dc;
          if (c > AXIS_HI) { prev[h] = null; return; }
          const at: V3 = [x, yWall03(w, c), 0.01], g = VOICE_GAIN[h] * va.amp * edge;
          if (prev[h]) p.line(prev[h]!, at, 0.65 * g);
          p.put(at[0], at[1], at[2], 2.6, 0.3 * g);
          prev[h] = at;
        });
      }
    }
  });
  // The CNN's window: a curtain of light standing across both walls at the newest edge.
  const y0 = WALLS03[1].y0 - 0.12, y1 = WALLS03[0].y1 + 0.12;
  for (let r = 0; r <= 22; r++) for (let c = 0; c <= 5; c++) p.put(NOW03 - WIN03 + WIN03 * c / 5, y0 + (y1 - y0) * r / 22, 0.05, 3, 0.07 + 0.05 * c / 5);
  p.line([NOW03, y0, 0.05], [NOW03, y1, 0.05], 0.75); p.line([NOW03 - WIN03, y0, 0.05], [NOW03 - WIN03, y1, 0.05], 0.25);
  // From the phone: through the speaker and the air to the microphone, the voice joining it; straight in as the reference.
  phone(p, PHONE03[0], PHONE03[1], 0, 1.3, 1);
  const flow = (s / 1.4) % 1, from: V3 = [PHONE03[0] + 0.36, PHONE03[1], 0], micY = (WALLS03[0].y0 + WALLS03[0].y1) / 2, refY = (WALLS03[1].y0 + WALLS03[1].y1) / 2;
  p.strand(bezier(from, [X03 - 0.55, micY, 0], [X03 - 0.12, micY, 0]), (q) => 0.2 + 0.4 * Math.exp(-(((q - flow) / 0.12) ** 2)), 2.6, 0.06);
  for (let i = 0; i < 3; i++) { const r = 0.14 + 0.1 * i + 0.1 * ((s * 1.2) % 1); p.strand((q) => [from[0] + r * Math.cos(-0.2 + 1.0 * q), from[1] + 0.1 + r * Math.sin(-0.2 + 1.0 * q), 0], () => 0.4 * (1 - (r - 0.14) / 0.4), 2.2, 0.03, 30); }
  p.strand((q) => [X03 - 0.72 + 0.6 * q, micY + 0.95 - 0.95 * ease(q) + 0.05 * Math.sin(q * 20 - s * 7), 0], (q) => 0.25 + 0.45 * q, 3.2, 0.03);
  p.strand(bezier(from, [X03 - 0.55, refY, 0], [X03 - 0.12, refY, 0]), (q) => 0.3 + 0.45 * Math.exp(-(((q - flow) / 0.12) ** 2)), 2.6, 0.035);
  // Out of the window into the CNN, then to the peak of the distribution: the voice alone.
  const net = cnn(p, LENS03[0], LENS03[1] - LENS03[0], 0, 1, s);
  for (const y of [micY, refY]) p.strand(bezier([NOW03 + 0.08, y, 0], [LENS03[0] - 0.25, y, 0], [net.input[0], y * 0.22, net.input[2]]), () => 0.2, 2.4, 0.05);
  const focus: V3 = [net.out[0] + 0.03, net.out[1], net.out[2]], peak = barPeak(BARS03[0], BARS03[1], -0.75, 1.5, v.cents, v.amp);
  p.strand(bezier(focus, [(focus[0] + peak[0]) / 2, Math.max(focus[1], peak[1]) + 0.15, 0], peak), (q) => (0.3 + 0.5 * Math.exp(-(((q - (s / 1.1) % 1) / 0.08) ** 2))) * ease(clamp(q / 0.08)), 3, 0.03);
  bars(p, BARS03[0], BARS03[1], -0.75, 1.5, v.cents, v.amp, 1);
};
const SHOT03: Shot = {
  target: [4.0, 0, -0.2], yaw: -0.1, tilt: 0.12, bloom: 0.4, stretch: 1.15,
  bounds: [[PHONE03[0] - 0.4, 2.82, 0], [BARS03[1] + 0.2, 2.82, 0], [PHONE03[0] - 0.4, -2.4, 0], [BARS03[1] + 0.2, -2.4, 0], [X03, 1.9, -0.4]],
};
const TAGS03: Tag[] = [
  { text: <><b>마이크 6채널</b><span className="lf-sub">목소리 + 반주</span></>, at: () => [X03, WALLS03[0].y1 + 0.62, 0] },
  { text: <><b>참조 6채널</b><span className="lf-sub">엔진이 재생한 반주 · 멜로디 없음</span></>, at: () => [X03, WALLS03[1].y0 - 0.3, 0] },
  { text: "CNN 입력 창", at: () => [NOW03 - WIN03 / 2, WALLS03[0].y1 + 0.62, 0], align: "center", dim: true, wide: true },
  { text: <b>CNN</b>, at: () => [(LENS03[0] + LENS03[1]) / 2, (LENS03[1] - LENS03[0]) * CNN_ASPECT / 2 + 0.14, 0], align: "above" },
  { text: "음높이 분포", at: () => [(BARS03[0] + BARS03[1]) / 2, -0.98, 0], align: "center" },
  { text: <><b>±2빈 정확도</b>0.609 → 0.661</>, at: () => [(BARS03[0] + BARS03[1]) / 2, -1.32, 0], align: "center", dim: true },
];
export function ReferenceInput3D() {
  return <GlowFigure make={picture(draw03)} shot={SHOT03} tags={TAGS03} still={1.4}
    label="엔진의 VQT 그림처럼 두 벽이 있다. 위는 마이크 6채널, 아래는 참조 6채널이고, 벽 뒤에 겹친 괄호가 채널이다. 벽 안의 소리는 스펙트로그램으로, 목소리는 비브라토로 흔들리는 끊김 없는 선(배음), 피아노는 칠 때 밝아지는 구슬 선이다. 위는 목소리와 피아노가 함께 있고, 아래는 같은 순간에 같은 피아노만 있으며 목소리는 없다. 둘 다 왼쪽 휴대폰에서 온다: 스피커로 나가 공기를 지나며 목소리와 섞여 마이크로, 그대로 참조로. CNN은 두 벽의 최신 쪽 창을 함께 읽어, 목소리에만 봉우리가 선 음높이 분포를 낸다. 같은 조건에서 ±2빈 정확도가 0.609에서 0.661로 올랐다." />;
}

// ---- 04 Training data --------------------------------------------------------------------------------------------
// One recording, left: its sound, dim, and its answer, the voice's pitch, a bright line. Card after card is copied from
// it, laid out side by side: each keeps the answer line exactly as it was, glowing in step with the others, while its
// sound is remade under another condition (a long echo smearing every note, noise scattered over it, the piano far
// louder or softer). Then the cards are remade again, and again.
const CARD_W = 1.95, CARD_H = 1.4, WIN04 = 1900, CARD_S = 0.9, SRC04: V3 = [1.0, 0, 0];
const GRID04 = [0, 1, 2, 3, 4, 5].map((i): V3 => [4.0 + (i % 3) * 2.25, i < 3 ? 0.85 : -0.85, 0]);
type Make = { echo: number; noise: number; piano: number };
const MAKES: Make[] = [
  { echo: 1, noise: 0, piano: 1 }, { echo: 0, noise: 1, piano: 1 }, { echo: 0, noise: 0, piano: 2.8 }, { echo: 0, noise: 0, piano: 0.15 },
  { echo: 0.7, noise: 0.6, piano: 1 }, { echo: 0, noise: 0.5, piano: 2.2 }, { echo: 1, noise: 0, piano: 0.3 }, { echo: 0.5, noise: 1, piano: 1.6 },
  { echo: 0, noise: 0, piano: 1.9 }, { echo: 0.8, noise: 0.3, piano: 0.6 }, { echo: 0.3, noise: 0.8, piano: 0.4 }, { echo: 1, noise: 0.4, piano: 2.4 },
];
const CLEAN: Make = { echo: 0, noise: 0, piano: 1 };
const yCard = (cy: number) => pitchOn(cy - 0.05, CARD_H * 0.62);
function card(p: Pen, cx: number, cy: number, z: number, make: Make, k: number, answer: number, salt: number, s: number) {
  const x0 = cx - CARD_W / 2, y = yCard(cy);
  for (let x = x0 + 0.05; x <= x0 + CARD_W - 0.05; x += 0.045) {
    const ms = (x - x0) / CARD_W * WIN04, pa = pianoAt(ms), va = voiceAt(ms);
    const marks: [number, number][] = [[y(va.cents), 0.26 * va.amp], ...pa.chord.map((m): [number, number] => [y(m * 100), Math.min(0.8, (0.05 + 0.24 * pa.ring) * make.piano)])];
    for (const [my, a] of marks) {
      p.put(x, my, z, 1.8 + 3 * Math.min(1, a * 2), a * k);
      for (let j = 1; j <= 6 && make.echo > 0; j++) if (x + j * 0.055 < x0 + CARD_W) p.put(x + j * 0.055, my + 0.012 * j * (hash(j + my) - 0.5), z, 2.5 + 2.4 * j, a * k * make.echo * 0.3 * (1 - j / 7));
    }
    for (let j = 0; j < Math.round(make.noise * 4); j++) {
      const r = hash(x * 91.7 + j * 13.1 + salt);
      p.put(x + (hash(r * 7.3) - 0.5) * 0.05, cy - CARD_H / 2 + 0.06 + r * (CARD_H - 0.12), z, 2.4, 0.38 * k);
    }
  }
  brackets(p, cx - CARD_W / 2, cx + CARD_W / 2, cy - CARD_H / 2, cy + CARD_H / 2, z, 0.35 * k);
  // The answer, the same on every card, its glow running along it in step with all the others.
  if (answer > 0) p.strand((q) => [x0 + 0.05 + q * (CARD_W - 0.1), y(voiceAt(q * WIN04).cents) + 0.02, z + 0.03], (q) => answer * (0.55 + 0.4 * Math.exp(-(((q - (s / 1.6) % 1) / 0.07) ** 2))), 3.6, 0.02, 220);
}

const draw04 = (p: Pen, s: number) => {
  const round = Math.floor(s / (CARD_S * 8)), u = s % (CARD_S * 8);
  card(p, SRC04[0], SRC04[1], 0, CLEAN, 1, 1, 0, s);
  GRID04.forEach((slot, i) => {
    const born = i * CARD_S, f = ease(clamp((u - born) / 0.5)), dress = ease(clamp((u - born - 0.45) / 0.3)), make = MAKES[(i + 6 * round) % MAKES.length];
    if (u < born) {
      // Not made yet this round: the last round's card still stands, fading.
      if (round > 0) card(p, slot[0], slot[1], 0, MAKES[(i + 6 * (round - 1)) % MAKES.length], 0.5 * (1 - clamp((u - born + 0.3) / 0.3)), 0.5, i * 5.1 + round - 1, s);
      return;
    }
    const pos = lerp3(SRC04, slot, f), lift = 0.4 * Math.sin(Math.PI * f);
    const blend: Make = { echo: make.echo * dress, noise: make.noise * dress, piano: 1 + (make.piano - 1) * dress };
    card(p, pos[0], pos[1] + lift, pos[2], blend, 0.9, 1, i * 5.1 + round, s);
  });
};
const SHOT04: Shot = {
  target: [5.3, 0, 0], yaw: -0.06, tilt: 0.08, bloom: 0.4, stretch: 1,
  bounds: [[SRC04[0] - CARD_W / 2 - 0.2, 2.0, 0], [GRID04[2][0] + CARD_W / 2 + 0.2, 2.0, 0], [SRC04[0] - CARD_W / 2 - 0.2, -1.9, 0], [GRID04[2][0] + CARD_W / 2 + 0.2, -1.9, 0]],
};
const TAGS04: Tag[] = [
  { text: <b>실연 녹음 140개</b>, at: () => [SRC04[0] - CARD_W / 2, CARD_H / 2 + 0.25, 0] },
  { text: <><b>표본마다 새로 합성</b><span className="lf-sub">방 응답 · 음량 비율 · 잡음 · 정답은 그대로</span></>, at: () => [GRID04[0][0] - CARD_W / 2, 0.85 + CARD_H / 2 + 0.25, 0] },
];
export function TrainingData3D() {
  return <GlowFigure make={picture(draw04)} shot={SHOT04} tags={TAGS04} still={7}
    label="왼쪽은 실연 녹음 하나로, 흐린 소리(목소리와 피아노) 위에 밝은 정답 음높이 선이 있다. 이 녹음에서 카드가 한 장씩 복사되어 옆에 늘어선다. 카드마다 정답 선은 그대로이고 다른 카드들과 함께 같은 박자로 빛나며, 소리만 다른 조건으로 다시 만들어진다: 긴 잔향이 모든 음을 번지게 하거나, 잡음이 흩뿌려지거나, 피아노가 훨씬 크거나 작아진다. 카드는 계속 새로 만들어진다. 실제 휴대폰 녹음은 학습에 쓰지 않고 검증에만 쓴다." />;
}

// ---- 05 Measured echo --------------------------------------------------------------------------------------------
// Two rooms seen from the front, each with a graph of its response under it. Left, the measuring app as it ran
// (echo-capture): the phone plays an exponential sine sweep from its own speaker, drawn as round waves leaving it ever
// closer together as the pitch rises, and they bounce off the walls. Then the response worked back from the sweep is
// shown as one click: its wave and the waves the walls send back reach the microphone, a few centimetres from the
// speaker, and each arrival raises a stem in the graph below. The first, straight from the speaker, towers over the
// rest. Right, the public reverbs training used, measured with the source across the room from the microphone: the
// same click, and the walls' arrivals stand as tall as the first and keep coming. The reflections are worked out from
// mirror images of the source; the stems' heights are drawn by rule, not measured, and only the words carry numbers.
type Room05 = { x0: number; x1: number; y0: number; y1: number; src: [number, number]; mic: [number, number]; order: number; wall: number };
const ROOMS05: Room05[] = [
  { x0: 0, x1: 3.7, y0: 0, y1: 2.25, src: [1.2, 0.72], mic: [1.2, 1.22], order: 2, wall: 0.55 },
  { x0: 4.7, x1: 8.4, y0: 0, y1: 2.25, src: [5.25, 1.25], mic: [7.65, 0.95], order: 3, wall: 0.88 },
];
const C05 = 1.9, SWEEP_T05 = 3.0, PULSE0_05 = SWEEP_T05 + 1.3, PULSE_T05 = 3.6, HOLD05 = 1.6, LOOP05 = PULSE0_05 + PULSE_T05 + HOLD05;
const GRAPH05 = { base: -1.45, h: 1.15, dmax: 6.6 };
// The source mirrored in the walls, up to the room's order of reflection: each image is where a reflected wave seems to
// come from. Its strength falls with each bounce.
const images05 = (r: Room05) => {
  const out: { x: number; y: number; order: number }[] = [];
  const lx = r.x1 - r.x0, ly = r.y1 - r.y0, sx = r.src[0] - r.x0, sy = r.src[1] - r.y0;
  for (let m = -1; m <= 1; m++) for (const a of [1, -1]) for (let n = -1; n <= 1; n++) for (const b of [1, -1]) {
    const ox = Math.abs(2 * m - (a < 0 ? 1 : 0)), oy = Math.abs(2 * n - (b < 0 ? 1 : 0)), order = ox + oy;
    if (order > r.order) continue;
    out.push({ x: r.x0 + 2 * m * lx + a * sx, y: r.y0 + 2 * n * ly + b * sy, order });
  }
  return out;
};
const IMAGES05 = ROOMS05.map(images05);
// What reaches the microphone and when: one arrival per image, the direct one first. Heights by rule: in the phone's
// room the direct sound towers over the walls'; in the public reverbs' room the walls' arrivals stand as tall as the
// first, with a dense tail after them.
const ARRIVALS05 = ROOMS05.map((r, ri) => {
  const list = IMAGES05[ri].map((im, i) => {
    const d = Math.hypot(im.x - r.mic[0], im.y - r.mic[1]), wob = 0.75 + 0.5 * hash(i * 7.3 + ri * 3.1);
    const h = im.order === 0 ? (ri ? 0.55 : 1) : (ri ? 0.7 * 0.86 ** im.order : 0.13 * 0.7 ** im.order) * wob;
    return { d, h, direct: im.order === 0 };
  }).filter((a) => a.d < GRAPH05.dmax);
  if (ri) for (let j = 0; j < 26; j++) { const d = 3.0 + j * 0.13 + 0.05 * hash(j * 2.9); list.push({ d, h: 0.55 * Math.exp(-(d - 3.0) / 2.2) * (0.45 + 0.55 * hash(j * 5.7)), direct: false }); }
  return list.sort((a, b) => a.d - b.d);
});
const gx05 = (r: Room05, d: number) => r.x0 + 0.1 + (r.x1 - r.x0 - 0.2) * d / GRAPH05.dmax;
// A round wave of radius r about (cx, cy), drawn as a line, only where it is inside the room.
function wave05(p: Pen, room: Room05, cx: number, cy: number, r: number, a: number) {
  if (r <= 0.03 || a < 0.004) return;
  const n = Math.max(24, Math.ceil(2 * Math.PI * r / 0.06)), inside = (x: number, y: number) => x > room.x0 + 0.02 && x < room.x1 - 0.02 && y > room.y0 + 0.02 && y < room.y1 - 0.02;
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = 2 * Math.PI * i / n, x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    if (!inside(x, y)) { prev = null; continue; }
    const at: V3 = [x, y, 0];
    if (prev) p.line(prev, at, a);
    prev = at;
  }
}
// The sweep: the k-th crest leaves when the rising pitch has run k cycles (drawn slowed, the pitch rising sixfold).
const SWEEP_F05 = 1.5, SWEEP_R05 = 6;
const CRESTS05 = (() => {
  const t: number[] = [], lnR = Math.log(SWEEP_R05);
  for (let k = 0; ; k++) { const tk = SWEEP_T05 * Math.log(1 + k * lnR / (SWEEP_F05 * SWEEP_T05)) / lnR; if (tk > SWEEP_T05) break; t.push(tk); }
  return t;
})();
const draw05 = (p: Pen, s: number) => {
  const u = s % LOOP05, pulse = u - PULSE0_05, ebb = clamp((PULSE0_05 - u) / 0.7);
  ROOMS05.forEach((room, ri) => {
    // The walls, the graph's floor.
    for (const [a, b] of [[[room.x0, room.y0], [room.x1, room.y0]], [[room.x1, room.y0], [room.x1, room.y1]], [[room.x1, room.y1], [room.x0, room.y1]], [[room.x0, room.y1], [room.x0, room.y0]]] as [number, number][][])
      p.line([a[0], a[1], 0], [b[0], b[1], 0], 0.16);
    p.line([room.x0 + 0.05, GRAPH05.base, 0], [room.x1 - 0.05, GRAPH05.base, 0], 0.3);
    // The sound source and the microphone: in the phone's room both are on the phone.
    if (ri === 0) phone(p, room.src[0], (room.src[1] + room.mic[1]) / 2, 0, 0.82, 1);
    else { brackets(p, room.src[0] - 0.13, room.src[0] + 0.13, room.src[1] - 0.17, room.src[1] + 0.17, 0, 0.7, 0.08); }
    p.put(room.src[0], room.src[1], 0, 7, 0.75); p.put(room.mic[0], room.mic[1], 0, 7, 0.75);
    if (ri === 1) p.strand(arc(room.mic[0], room.mic[1], 0, 0.11, 0, 1), () => 0.5, 1.8, 0.02, 30);
    // The sweep, in the phone's room only: crests ever closer together, each with the walls' first reflections.
    if (ri === 0 && u < PULSE0_05) for (const tk of CRESTS05) {
      const r = C05 * (u - tk);
      if (r <= 0 || r > 4.2) continue;
      for (const im of IMAGES05[0]) if (im.order <= 1) wave05(p, room, im.x, im.y, r, (im.order ? 0.035 : 0.22) * Math.exp(-r / 2.4) * ebb);
    }
    // The click worked back from the sweep: its wave and every reflection, as far as each has travelled.
    if (pulse > 0 && pulse < PULSE_T05 + HOLD05) {
      const r = C05 * pulse;
      for (const im of IMAGES05[ri]) {
        wave05(p, room, im.x, im.y, r, (im.order ? 0.1 * room.wall ** im.order : 0.4) * Math.exp(-r / 3.6) * (pulse < PULSE_T05 ? 1 : 1 - (pulse - PULSE_T05) / HOLD05));
      }
    }
    // The response: a stem for each arrival that has reached the microphone, bright as it lands.
    const reached = pulse > 0 ? C05 * pulse : -1;
    for (const a of ARRIVALS05[ri]) {
      if (a.d > reached) continue;
      const x = gx05(room, a.d), y1 = GRAPH05.base + a.h * GRAPH05.h, land = Math.exp(-((reached - a.d) / 0.25));
      p.line([x, GRAPH05.base, 0], [x, y1, 0], 0.08, 0.85 * Math.min(1, a.h + 0.3));
      p.put(x, y1, 0, (a.direct ? 9 : 3.4) + 10 * land, (a.direct ? 0.9 : 0.45) + 0.4 * land);
    }
  });
};
const SHOT05: Shot = {
  target: [4.2, 0.35, 0], yaw: -0.03, tilt: 0.05, bloom: 0.4, stretch: 1,
  bounds: [[ROOMS05[0].x0 - 0.15, 2.75, 0], [ROOMS05[1].x1 + 0.15, 2.75, 0], [ROOMS05[0].x0 - 0.15, GRAPH05.base - 0.45, 0], [ROOMS05[1].x1 + 0.15, GRAPH05.base - 0.45, 0]],
};
const inSweep05 = (s: number) => ((s % LOOP05) < SWEEP_T05 + 0.6 ? 1 : 0);
const firstIn05 = (ri: number) => (s: number) => (C05 * ((s % LOOP05) - PULSE0_05) >= ARRIVALS05[ri][0].d ? 1 : 0);
const TAGS05: Tag[] = [
  { text: <><b>같은 휴대폰</b><span className="lf-sub">스피커로 재생 · 마이크로 녹음</span></>, at: () => [ROOMS05[0].x0, ROOMS05[0].y1 + 0.28, 0] },
  { text: <><b>지수 사인 스윕</b>12초 · 50Hz → 20kHz</>, at: () => [ROOMS05[0].src[0] + 0.5, ROOMS05[0].src[1] - 0.42, 0], fade: inSweep05 },
  { text: <><b>학습에 쓰던 공개 잔향</b><span className="lf-sub">음원과 마이크가 떨어진 방</span></>, at: () => [ROOMS05[1].x0, ROOMS05[1].y1 + 0.28, 0] },
  { text: "음원", at: () => [ROOMS05[1].src[0], ROOMS05[1].src[1] - 0.28, 0], align: "center", dim: true },
  { text: "마이크", at: () => [ROOMS05[1].mic[0], ROOMS05[1].mic[1] - 0.28, 0], align: "center", dim: true },
  ...ROOMS05.map((room, ri): Tag => ({ text: <b>직접음</b>, at: () => [gx05(room, ARRIVALS05[ri][0].d) - 0.08, GRAPH05.base + ARRIVALS05[ri][0].h * GRAPH05.h, 0], align: "end", fade: firstIn05(ri) })),
  { text: <><b>9개 공간 실측</b>직접음 비율 +5~+12dB</>, at: () => [ROOMS05[0].x0, GRAPH05.base - 0.28, 0] },
  { text: <><b>공개 잔향</b>직접음 비율 −5.3dB</>, at: () => [ROOMS05[1].x0, GRAPH05.base - 0.28, 0] },
];
export function EchoMeasured3D() {
  return <GlowFigure make={picture(draw05)} shot={SHOT05} tags={TAGS05} still={PULSE0_05 + PULSE_T05}
    label="방 두 개를 정면에서 보고, 각 방 아래에 그 방의 응답 그래프가 있다. 왼쪽은 직접 만든 측정 앱 그대로다. 휴대폰이 자기 스피커로 지수 사인 스윕(50Hz에서 20kHz로 오르는 소리)을 내고, 동그란 파동이 점점 촘촘해지며 퍼져 벽에서 되돌아온다. 이어서 스윕에서 역으로 계산한 응답을 박수 한 번처럼 보인다: 파동과 벽이 돌려보낸 파동이 몇 cm 옆 마이크에 닿을 때마다 아래 그래프에 막대가 선다. 스피커에서 곧장 온 첫 막대(직접음)가 나머지보다 훨씬 높다. 9개 공간을 이렇게 쟀고 직접음 비율은 +5~+12dB였다. 오른쪽은 학습에 쓰던 공개 잔향으로, 음원과 마이크가 떨어진 방이다. 같은 박수에 벽에서 온 막대들이 첫 막대만큼 높고 계속 이어진다(직접음 비율 −5.3dB). 막대 높이는 규칙으로 그린 것이고 숫자는 글에만 있다." />;
}

// ---- 06 Loss and score (option A, kept for the gallery) -------------------------------------------------------------------------------------------
// A voice that sings and rests, and under it two checkpoints as two rows of lamps, one lamp per frame, lit where the
// checkpoint is sure there is singing. Above, sure in every frame, rests and all; below, sure only where the voice is. A
// lamp lit in a rest is crossed out. As the cursor passes, each row fills two scores at the right: the detection rate
// alone, and the detection rate less the false-detection rate. The first ends full for both, a tie; the second ends
// empty above and full below. Every number here follows from the definitions; none is measured.
const SING06 = [[0.5, 2.1], [2.8, 4.4], [5.1, 6.7]] as const, T06 = [0.4, 7.0] as const, LAMP06 = 0.15;
const ROWS06 = [{ y: 0.25, always: true }, { y: -1.15, always: false }] as const, VOICE06 = 1.55;
const COLS06 = [{ x: 7.75, fair: false }, { x: 10.05, fair: true }] as const, BAR06 = { len: 1.7, h: 0.32 };
const LOOP06 = 9.5, SCAN06 = 5.4;
const sung06 = (x: number) => SING06.some(([a, b]) => x >= a && x <= b);
const LAMPS06 = (() => { const xs: number[] = []; for (let x = T06[0]; x <= T06[1] + 1e-6; x += LAMP06) xs.push(x); return xs; })();
const SUNG06 = LAMPS06.filter(sung06).length, REST06 = LAMPS06.length - SUNG06;
// A score bar: a rounded outline, filled solid (lines, not dots) as far as the score has come.
function bar06(p: Pen, x0: number, y: number, fill: number, k: number) {
  const { len, h } = BAR06, x1 = x0 + len * clamp(fill);
  p.strand(squircle(x0 + len / 2, y, 0, len + 0.12, h + 0.12), () => 0.3 * k, 2.2, 0.035, 220);
  if (fill < 0.005) return;
  for (let j = 0; j < 8; j++) { const yy = y - h / 2 + 0.035 + j * (h - 0.07) / 7; p.line([x0, yy, 0], [x1, yy, 0], 0.75 * k); }
  p.line([x1, y - h / 2, 0], [x1, y + h / 2, 0], k);
}
const draw06 = (p: Pen, s: number) => {
  const u = s % LOOP06, cursor = T06[0] + clamp(u / SCAN06) * (T06[1] - T06[0]), done = u >= SCAN06;
  for (const [a, b] of SING06) p.strand((q) => { const x = a + (b - a) * q, c = voiceAt(x * 600).cents; return [x, VOICE06 + (c - 6900) / 500 * 0.35, 0]; }, () => 0.7, 3.4, 0.025, 200);
  ROWS06.forEach((row) => {
    let found = 0, wrong = 0;
    for (const x of LAMPS06) {
      const sings = sung06(x), on = row.always || sings, passed = x <= cursor, flare = done ? 0 : Math.exp(-(((x - cursor) / 0.12) ** 2));
      if (on) { p.put(x, row.y, 0, 9 + 6 * flare, 0.6 + 0.35 * flare); p.put(x, row.y, 0, 20, 0.06); } else p.put(x, row.y, 0, 4, 0.16);
      if (on && !sings) {
        const g = passed ? 0.8 : 0.3, d = 0.065, yc = row.y + 0.24;
        p.line([x - d, yc - d, 0], [x + d, yc + d, 0], g); p.line([x - d, yc + d, 0], [x + d, yc - d, 0], g);
      }
      if (passed && on) { if (sings) found++; else wrong++; }
    }
    const detect = found / SUNG06, fair = detect - wrong / REST06;
    COLS06.forEach((col) => bar06(p, col.x, row.y, col.fair ? Math.max(0, fair) : detect, 1));
  });
  if (!done) p.line([cursor, ROWS06[1].y - 0.4, 0.02], [cursor, VOICE06 + 0.5, 0.02], 0.35);
  // Done: the first score cannot tell the two apart; the second can.
  if (done) {
    const t = ease(clamp((u - SCAN06) / 0.6)), x = COLS06[1].x - 0.1;
    if (t < 0.99) p.put(COLS06[1].x + 0.05, ROWS06[0].y, 0, 30 * (1 - t), 0.5 * (1 - t));
    brackets(p, x, x + BAR06.len + 0.2, ROWS06[1].y - 0.38, ROWS06[0].y + 0.38, 0, 0.55 * t, 0.18);
  }
};
const SHOT06: Shot = {
  target: [6.0, 0.2, 0], yaw: -0.04, tilt: 0.06, bloom: 0.42, stretch: 1.1,
  bounds: [[T06[0] - 0.2, VOICE06 + 0.75, 0], [COLS06[1].x + BAR06.len + 0.75, VOICE06 + 0.75, 0], [T06[0] - 0.2, ROWS06[1].y - 0.75, 0], [COLS06[1].x + BAR06.len + 0.75, ROWS06[1].y - 0.75, 0]],
};
const after06 = (s: number) => ((s % LOOP06) >= SCAN06 + 0.3 ? 1 : 0);
const TAGS06: Tag[] = [
  { text: <b>모든 프레임 확신</b>, at: () => [T06[0], ROWS06[0].y + 0.48, 0] },
  { text: <b>노래에서만 확신</b>, at: () => [T06[0], ROWS06[1].y + 0.48, 0] },
  { text: <b>검출률</b>, at: () => [COLS06[0].x + BAR06.len / 2, VOICE06 - 0.1, 0], align: "center" },
  { text: <b>검출률 − 오검출률</b>, at: () => [COLS06[1].x + BAR06.len / 2, VOICE06 - 0.1, 0], align: "center" },
  ...ROWS06.flatMap((row, r) => COLS06.map((col): Tag => ({
    text: <b>{col.fair && r === 0 ? "0" : "1.0"}</b>, at: () => [col.x + BAR06.len + 0.16, row.y, 0], fade: after06,
  }))),
  { text: "둘 다 만점 · 구분 못 함", at: () => [COLS06[0].x + BAR06.len / 2, ROWS06[1].y - 0.55, 0], align: "center", dim: true, fade: after06 },
  { text: <b>둘을 구분</b>, at: () => [COLS06[1].x + BAR06.len / 2, ROWS06[1].y - 0.55, 0], align: "center", fade: after06 },
];
export function SelectionScore3D() {
  return <GlowFigure make={picture(draw06)} shot={SHOT06} tags={TAGS06} still={8.5}
    label="위에는 노래하다 쉬는 목소리가 있고, 그 아래 두 체크포인트가 두 줄의 등으로 있다. 등은 프레임마다 노래가 있다고 확신하면 켜진다. 위 줄은 쉼까지 모든 프레임에서 켜지고, 아래 줄은 목소리가 있는 곳에서만 켜진다. 쉼에서 켜진 등에는 가위표가 붙는다. 커서가 지나가며 오른쪽 점수 막대가 찬다. 검출률만 보면 두 줄 모두 1.0으로 끝나 구분하지 못한다. 검출률에서 오검출률을 빼면 위 줄은 0, 아래 줄은 1.0으로 갈린다." />;
}

// ---- 06 Loss: three terms, one of them an auxiliary output ---------------------------------------------------------
// Laid out as 02 lays out the phone: the sound comes in at the bottom and goes up into the CNN, drawn as every picture
// draws it, and the pitch distribution, drawn as every picture draws an inferred pitch, stands above it. While it is
// trained: a dotted line marks the answer, the peak lands a semitone off and then an octave off, and a ruler measures
// how far. Beside it the charges rise as columns of light, as the engine draws an amount: the loss by bins, the same
// for either miss, and the pitch distance term, as tall as the ruler is long. Out to the side, the auxiliary output: a
// lamp per frame, lit where the voice sings. Then the phone closes round the CNN and the distribution; the lamps'
// branch, left outside, is cut, and the charges go: in the phone the model runs with the distribution only. Heights are
// drawn by rule, not measured.
const PH06L: V3 = [0, 0.15, 0], PHH06L = 4.5, LENS_Y06L = -0.55;
const LENS06L = [-0.45, 0.45] as const, BARS06L = { xa: -0.85, xb: 0.85, base: 0.6, h: 1.1 };
const STRIP06L = { x0: -0.8, x1: 0.8, y0: -1.8, y1: -1.2 }, ANS06L = 6300, MISS06L = [100, 1200] as const;
const CHARGE06L = { xs: [1.45, 2.4], floor: BARS06L.base, max: 1.35 }, LAMPS06L = { x0: 1.4, n: 8, dx: 0.21, y: LENS_Y06L };
const TRAIN06L = 6.6, CLOSE06L = 1.3, LOOP06L = 11.6, MISS_T06L = 2.2;
const sings06L = (t: number) => ((t % 2.3) + 2.3) % 2.3 < 1.6;
const missAt06L = (s: number) => MISS06L[Math.floor((s % LOOP06L) / MISS_T06L) % 2];
const cx06L = (c: number) => BARS06L.xa + (BARS06L.xb - BARS06L.xa) * (c - BIN_LO) / (BIN_HI - BIN_LO);
const yIn06L = (c: number) => STRIP06L.y0 + 0.05 + (c - AXIS_LO) / (AXIS_HI - AXIS_LO) * (STRIP06L.y1 - STRIP06L.y0 - 0.1);
// A charge as a column of light, as the engine draws an amount.
function charge06L(p: Pen, x: number, height: number, k: number) {
  for (let y = CHARGE06L.floor + 0.03; y <= CHARGE06L.floor + height + 1e-6; y += 0.055)
    for (const dx of [-0.07, 0, 0.07]) for (const dz of [-0.07, 0.07]) p.put(x + dx, y, dz, 4.4, 0.6 * k);
  if (height > 0.05) p.put(x, CHARGE06L.floor + height, 0, 12, 0.6 * k);
}
const draw06L = (p: Pen, s: number) => {
  const u = s % LOOP06L, close = ease(clamp((u - TRAIN06L) / CLOSE06L)), cut = ease(clamp((u - TRAIN06L - CLOSE06L * 0.5) / 0.9)), train = 1 - cut;
  const sing = sings06L(s), v = voiceAt(loopMs(s * 1000)), miss = missAt06L(s), grow = ease(clamp(((u % MISS_T06L) / MISS_T06L) / 0.35));
  // The sound coming in at the bottom: the voice's harmonics as lines where it sings, the piano as beads.
  const cols = Math.round((STRIP06L.x1 - STRIP06L.x0) / 0.03), prev: (V3 | null)[] = VOICE_HARMONICS.map(() => null);
  for (let j = 0; j <= cols; j++) {
    const x = STRIP06L.x0 + j * 0.03, t = s - (cols - j) * 0.025, g = ease(clamp(j / 5)), pa = pianoAt(loopMs(t * 1000));
    if (j % 2 === 0) pa.chord.forEach((m) => p.put(x, yIn06L(m * 100), 0, 2 + 2.5 * pa.ring, (0.1 + 0.3 * pa.ring) * g));
    if (!sings06L(t)) { prev.fill(null); continue; }
    const va = voiceAt(loopMs(t * 1000));
    VOICE_HARMONICS.forEach((dc, h) => {
      const c = va.cents + dc;
      if (c > AXIS_HI) { prev[h] = null; return; }
      const at: V3 = [x, yIn06L(c), 0];
      if (prev[h]) p.line(prev[h]!, at, 0.55 * VOICE_GAIN[h] * va.amp * g);
      prev[h] = at;
    });
  }
  // The CNN, and its main output, the pitch distribution, above it.
  const net = cnn(p, LENS06L[0], LENS06L[1] - LENS06L[0], LENS_Y06L, sing ? 1 : 0.5, s);
  p.strand(bezier([0, STRIP06L.y1 + 0.07, 0], [net.foot[0], net.foot[1] - 0.15, 0], net.foot), (q) => 0.2 + 0.45 * Math.exp(-(((q - (s / 0.9) % 1) / 0.12) ** 2)), 2.2, 0.05);
  const peak = train > 0.5 ? ANS06L + miss : v.cents, top: V3 = [cx06L(peak), BARS06L.base - 0.03, 0], focus: V3 = [net.out[0] + 0.03, net.out[1], net.out[2]];
  // From the CNN's output up to the distribution's peak, as 03 draws it.
  p.strand(bezier(focus, [focus[0] + 0.35, (focus[1] + top[1]) / 2, 0], top), (q) => (0.25 + 0.5 * Math.exp(-(((q - (s / 1.1) % 1) / 0.08) ** 2))) * ease(clamp(q / 0.08)), 2.6, 0.03);
  bars(p, BARS06L.xa, BARS06L.xb, BARS06L.base, BARS06L.h, peak, sing || train > 0.5 ? 0.95 : 0.05, 1);
  if (train > 0.01) {
    // The answer's line, and the ruler from it to where the peak landed.
    const xa = cx06L(ANS06L), x1 = cx06L(ANS06L + miss), xm = xa + (x1 - xa) * grow, yb = BARS06L.base - 0.14;
    for (let y = BARS06L.base - 0.04; y <= BARS06L.base + BARS06L.h + 0.15; y += 0.05) p.put(xa, y, 0.02, 2.6, 0.55 * train);
    p.line([xa, yb, 0], [xm, yb, 0], 0.8 * train); p.line([xa, yb - 0.05, 0], [xa, yb + 0.05, 0], 0.8 * train);
    if (grow > 0.98) p.line([x1, yb - 0.05, 0], [x1, yb + 0.05, 0], 0.8 * train);
    // The charges: by bins the same for either miss; by distance as tall as the ruler is long.
    charge06L(p, CHARGE06L.xs[0], 0.6 * grow, train);
    charge06L(p, CHARGE06L.xs[1], CHARGE06L.max * miss / 1200 * grow, train);
    p.line([CHARGE06L.xs[0] - 0.25, CHARGE06L.floor, 0], [CHARGE06L.xs[1] + 0.25, CHARGE06L.floor, 0], 0.1 * train);
  }
  // The auxiliary output: a branch out to the side, a lamp per frame, lit where the voice sings; cut once in the phone.
  const edge = PH06L[0] + PHH06L * PHONE_ASPECT / 2;
  if (train > 0.01) {
    for (let i = 0; i < 20; i++) { const xa = LENS06L[1] + 0.1 + (LAMPS06L.x0 - 0.2 - LENS06L[1] - 0.1) * i / 20, xb = LENS06L[1] + 0.1 + (LAMPS06L.x0 - 0.2 - LENS06L[1] - 0.1) * (i + 1) / 20; p.line([xa, LAMPS06L.y, 0], [xb, LAMPS06L.y, 0], 0.35 * (xa > edge ? train : 1)); }
    for (let i = 0; i < LAMPS06L.n; i++) {
      const x = LAMPS06L.x0 + i * LAMPS06L.dx, on = sings06L(s - (LAMPS06L.n - 1 - i) * 0.12);
      ring02(p, x, LAMPS06L.y, 0.07, 1, 0.3 * train);
      if (on) { p.put(x, LAMPS06L.y, 0, 11, 0.85 * train); p.put(x, LAMPS06L.y, 0, 24, 0.1 * train); }
    }
  }
  if (cut > 0.01) cross02(p, edge + 0.15, LAMPS06L.y, 0.1, Math.min(1, cut * 2));
  // The phone closing round the CNN and the distribution.
  if (close > 0.01) phone(p, PH06L[0], PH06L[1], 0, PHH06L, close);
};
const SHOT06L: Shot = {
  target: [0.6, 0.3, 0], yaw: -0.08, tilt: 0.06, bloom: 0.4, stretch: 1,
  bounds: [[-2.0, 2.95, 0], [CHARGE06L.xs[1] + 0.9, 2.95, 0], [-2.0, -2.2, 0], [CHARGE06L.xs[1] + 0.9, -2.2, 0]],
};
const train06L = (on: boolean) => (s: number) => (((s % LOOP06L) < TRAIN06L + CLOSE06L * 0.5) === on ? 1 : 0);
const TAGS06L: Tag[] = [
  { text: <><b>학습</b><span className="lf-sub">손실 = 분포 + 음높이 거리 + 노래 유무</span></>, at: () => [-1.95, 2.75, 0], fade: train06L(true) },
  { text: <><b>배포</b><span className="lf-sub">휴대폰에서는 분포만 실행</span></>, at: () => [-1.95, 2.75, 0], fade: train06L(false) },
  { text: <b>CNN</b>, at: () => [LENS06L[0] - 0.12, LENS_Y06L, 0], align: "end" },
  { text: <><b>음높이 분포</b><span className="lf-sub">주 출력</span></>, at: () => [BARS06L.xa - 0.12, BARS06L.base + 0.4, 0], align: "end" },
  { text: <b>정답</b>, at: () => [cx06L(ANS06L), BARS06L.base + BARS06L.h + 0.2, 0], align: "above", fade: train06L(true) },
  ...MISS06L.map((m): Tag => ({ text: m === 100 ? "반음 옆" : "옥타브 위", at: () => [(cx06L(ANS06L) + cx06L(ANS06L + m)) / 2, BARS06L.base - 0.34, 0], align: "center", dim: true, fade: (s) => train06L(true)(s) * (missAt06L(s) === m ? 1 : 0) })),
  { text: <b>빈별 손실</b>, at: () => [CHARGE06L.xs[0], CHARGE06L.floor - 0.22, 0], align: "center", fade: train06L(true) },
  { text: <b>음높이 거리</b>, at: () => [CHARGE06L.xs[1], CHARGE06L.floor - 0.22, 0], align: "center", fade: train06L(true) },
  { text: <><b>노래 유무</b><span className="lf-sub">보조 출력 · 프레임마다</span></>, at: () => [LAMPS06L.x0, LAMPS06L.y + 0.32, 0], fade: train06L(true) },
  { text: <b>배포에서 뗌</b>, at: () => [LAMPS06L.x0, LAMPS06L.y + 0.32, 0], fade: train06L(false) },
];
export function LossTerms3D() {
  return <GlowFigure make={picture(draw06L)} shot={SHOT06L} tags={TAGS06L} still={TRAIN06L - 0.3}
    label="아래에서 소리(노래하다 쉬는 목소리와 피아노)가 들어와 가운데 CNN(작아지는 층 넷)으로 올라가고, 그 위에 음높이 분포가 선다. 학습할 때는 점선이 정답 자리를 표시하고, 분포의 봉우리가 정답에서 반음 옆, 다음에는 한 옥타브 위에 서며, 자가 그 거리를 잰다. 옆에 벌점이 빛 기둥으로 자란다: 빈별 손실은 두 경우가 같고, 음높이 거리는 자만큼 높아져 옥타브일 때 훨씬 크다. 옆으로 뻗은 가지 끝에는 프레임마다 등이 하나씩 있어 노래가 들리면 켜진다(노래 유무, 보조 출력). 그다음 휴대폰이 CNN과 분포를 감싸고, 휴대폰 밖에 남은 등의 가지에는 가위표가 붙고 사라지며 기둥도 사라진다. 휴대폰에서는 분포만 실행한다. 높이는 규칙으로 그린 것이다." />;
}

// ---- 07 Evaluation -----------------------------------------------------------------------------------------------
// A real sung recording has no answer a person wrote down: the answer is itself a model's estimate, FCPE's. So first
// FCPE's output stands alone, drawn as every picture draws an inferred pitch (the distribution's bars of light, as the
// engine and 01 draw it), marked as only an estimate. Then four models built on other principles (two signal processing,
// two networks) give theirs in their own rows, each peak on the line through FCPE's, swaying with the voice together;
// then the rows slide together and lie on FCPE's as one: the answer is checked before it is used. Right, a phone and a
// hundred frames of a song kept out of training: 96 lit where the pitch is within a semitone of the answer, 4 left empty.
const X07 = [0.3, 6.9] as const, ROW07 = 0.8, H07 = 0.62, PHONE07 = 9.4, LOOP07 = 11.5;
const ALONE07 = 2.2, JOIN07 = 0.8, GATHER07 = 3.8, GRID07 = 6.0;
const MISS07 = new Set([13, 47, 58, 86]), BIAS07 = [-9, 12, 0, 7, -11];
const others07 = (s: number) => ease(clamp(((s % LOOP07) - ALONE07) / JOIN07));
const gather07 = (s: number) => ease(clamp(((s % LOOP07) - GATHER07) / 1.8));
const draw07 = (p: Pen, s: number) => {
  const together = gather07(s), join = others07(s), v = voiceAt(loopMs(s * 1000));
  // Each model's output as a pitch distribution in its own row; once together, the four lie inside FCPE's.
  for (let m = 0; m < 5; m++) {
    const lead = m === 2, show = lead ? 1 : join;
    if (show < 0.01) continue;
    const off = (2 - m) * ROW07 * (1 - together), gain = (lead ? 1 : 0.75 * (1 - 0.85 * together)) * show;
    const h = H07 * (1 + 0.9 * together);
    bars(p, X07[0], X07[1], off - h / 2, h, v.cents + BIAS07[m], v.amp, gain);
  }
  // The answer's line through FCPE's peak, across the rows while they stand apart.
  const xa = X07[0] + (X07[1] - X07[0]) * (v.cents - BIN_LO) / (BIN_HI - BIN_LO), span = 2 * ROW07 * (1 - together) * join + 0.05;
  for (let y = -span - H07 / 2; y <= span + H07 / 2 + 0.25; y += 0.06) p.put(xa, y, 0.02, 2.4, 0.4);
  phone(p, PHONE07, 0, 0, 2.9, 0.85);
  const fill = clamp(((s % LOOP07) - GRID07) / 2.5) * 100;
  for (let i = 0; i < 100; i++) {
    const x = PHONE07 - 0.5 + (i % 10) * 0.111, y = 0.9 - Math.floor(i / 10) * 0.2, shown = i < fill;
    if (!shown) { p.put(x, y, 0, 2, 0.08); continue; }
    if (MISS07.has(i)) p.strand(arc(x, y, 0, 0.035, 0, 1), () => 0.35, 1.6, 0.02, 20);
    else p.put(x, y, 0, 6, 0.7);
  }
};
const SHOT07: Shot = {
  target: [5.0, 0, 0], yaw: -0.05, tilt: 0.06, bloom: 0.42, stretch: 1,
  bounds: [[X07[0] - 1.75, 2.35, 0], [PHONE07 + 1.9, 2.35, 0], [X07[0] - 1.75, -2.2, 0], [PHONE07 + 1.9, -2.2, 0]],
};
const NAMES07 = [["pYIN", "신호 처리"], ["Harvest", "신호 처리"], ["FCPE", "신경망"], ["CREPE", "신경망"], ["PESTO", "신경망"]] as const;
const TAGS07: Tag[] = [
  { text: <><b>정답 = FCPE의 추정</b><span className="lf-sub">실제 성악 녹음에는 사람이 단 정답이 없다</span></>, at: () => [X07[0], 2.15, 0], fade: (s) => 1 - gather07(s) },
  { text: <><b>원리가 다른 다섯이 합의 · 정답부터 검증</b><span className="lf-sub">깨끗한 보컬 18곡 · 차이 중앙값 8~13센트</span></>, at: () => [X07[0], 2.15, 0], fade: (s) => clamp((gather07(s) - 0.6) / 0.4) },
  ...NAMES07.map(([name, kind], m): Tag => ({
    text: m === 2 ? <><b>{name}</b><span className="lf-sub">{kind}</span></> : <>{name}<span className="lf-sub">{kind}</span></>,
    at: () => [X07[0] - 0.1, (2 - m) * ROW07, 0], align: "end", dim: m !== 2, fade: (s) => (m === 2 ? 1 : others07(s)) * (1 - gather07(s)),
  })),
  { text: <><b>학습에서 뺀 곡 「Halt!」</b>실제 휴대폰 녹음</>, at: () => [PHONE07, 1.62, 0], align: "above" },
  { text: <><b>96%</b>이 모델 · 100프레임 중 96 · 반음 이내</>, at: () => [PHONE07, -1.62, 0], align: "center", fade: (s) => ((s % LOOP07) >= GRID07 + 2.5 ? 1 : 0) },
];
export function Evaluation3D() {
  return <GlowFigure make={picture(draw07)} shot={SHOT07} tags={TAGS07} still={LOOP07 - 0.5}
    label="실제 성악 녹음에는 사람이 단 정답이 없어서, 정답도 모델(FCPE)이 만든 추정이다. 그래서 먼저 FCPE가 깨끗한 보컬에서 낸 음높이 분포(빛 막대)가 혼자 선다. 이어서 원리가 다른 네 모델(신호 처리의 pYIN · Harvest, 신경망의 CREPE · PESTO)의 분포가 각자의 줄에 서고, 봉우리가 모두 FCPE 봉우리를 지나는 세로선 위에 함께 흔들린다. 그다음 줄들이 모여 FCPE의 분포 위에 하나로 포개진다. 정답을 쓰기 전에 정답부터 검증한 것이다(18곡에서 차이 중앙값 8~13센트). 오른쪽은 학습에서 뺀 곡 「Halt!」의 실제 휴대폰 녹음으로, 프레임 100개 중 96개가 정답과 반음 이내라 켜지고 4개는 비어 있다." />;
}
