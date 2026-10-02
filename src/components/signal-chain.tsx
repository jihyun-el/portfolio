"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CnnGlyph } from "@/components/showcase-parts";
import { BEAT, STATES, TOTAL, CHORDS, hash, modBeat, singerU, accompTempo, accompU, confirmedIndex, predictedIndex, beliefFrozen, prepareFollower, anchorU, centOf, C_LO, C_HI, salience, observationAt, schedulerLead, belief, voiceSignal, accompSignal, vqtParts, tempoLayers, phraseFactor, playheadU } from "@/lib/example-score";

/* ---------- Drawing ---------- */
type Palette = { ink: string; ink2: string; ink3: string; line: string; wash: string; paper: string; inkRgb: number[]; paperRgb: number[]; font: string };
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: Palette) => void;
const rgb = (hex: string) => { const v = hex.replace("#", ""); const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v; return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)); };

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color = p.ink2, align: CanvasTextAlign = "left", weight = 500, size = 11) {
  ctx.font = `${weight} ${size}px ${p.font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(text, x, y);
}
function path(ctx: CanvasRenderingContext2D, points: [number, number][], color: string, width = 1, dash: number[] = []) {
  ctx.beginPath(); points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
}

function waveLane(ctx: CanvasRenderingContext2D, p: Palette, w: number, top: number, height: number, t: number, signal: (tau: number) => number, color: string, name: string) {
  const mid = top + height / 2 + 6;
  path(ctx, [[16, mid], [w - 16, mid]], p.line);
  const points: [number, number][] = [];
  for (let x = 16; x <= w - 16; x += 2) points.push([x, mid + signal(t - (1 - (x - 16) / (w - 32)) * 0.6) * height * 0.34]);
  path(ctx, points, color, 1.2);
  label(ctx, p, name, 16, top + 8, p.ink2, "left", 700);
}

const drawAudio: Draw = (ctx, w, h, t, p) => {
  const lane = (h - 30) / 2;
  waveLane(ctx, p, w, 12, lane, t, (tau) => 0.85 * voiceSignal(tau) + 0.3 * accompSignal(tau - 0.02) + 0.04 * (hash(tau * 900) - 0.5), p.ink, "마이크 · 가수 + 스피커에서 샌 반주");
  waveLane(ctx, p, w, 18 + lane, lane, t, (tau) => accompSignal(tau - 0.02), p.ink2, "되먹임 · 직전 블록에 낸 반주");
};

let offscreen: HTMLCanvasElement | null = null;
const VQT_COLS = 120, VQT_ROWS = 90;
const ROW_CENTS = Array.from({ length: VQT_ROWS }, (_, r) => C_HI - (C_HI - C_LO) * (r + 0.5) / VQT_ROWS);
const drawVQT: Draw = (ctx, w, h, t, p) => {
  offscreen ??= document.createElement("canvas");
  offscreen.width = VQT_COLS; offscreen.height = VQT_ROWS;
  const off = offscreen.getContext("2d")!;
  const lanes = [{ name: "마이크 · 6채널", parts: (tau: number) => vqtParts(tau, "mic") }, { name: "되먹임 · 6채널", parts: (tau: number) => vqtParts(tau, "ref") }];
  const laneH = (h - 46) / 2;
  lanes.forEach((lane, li) => {
    const img = off.createImageData(VQT_COLS, VQT_ROWS);
    for (let col = 0; col < VQT_COLS; col++) {
      const parts = lane.parts(t - (1 - (col + 1) / VQT_COLS) * 2.4);
      for (let row = 0; row < VQT_ROWS; row++) {
        let value = 0;
        for (const [cent, amp] of parts) value += amp * Math.exp(-((ROW_CENTS[row] - cent) ** 2) / (2 * 40 * 40));
        const k = 1 - Math.exp(-2.4 * value), i = (row * VQT_COLS + col) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[i + ch] = p.paperRgb[ch] + (p.inkRgb[ch] - p.paperRgb[ch]) * k;
        img.data[i + 3] = 255;
      }
    }
    off.putImageData(img, 0, 0);
    const x = 24, y = 26 + li * (laneH + 14), width = w - 48;
    for (let s = 2; s >= 1; s--) { ctx.strokeStyle = p.line; ctx.lineWidth = 1; ctx.strokeRect(x + s * 4, y - s * 4, width, laneH); }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(offscreen!, x, y, width, laneH);
    ctx.strokeStyle = p.ink3; ctx.strokeRect(x, y, width, laneH);
    label(ctx, p, lane.name, x + 6, y + 10, p.ink, "left", 700, 10);
  });
  label(ctx, p, "시간 →", w - 24, h - 9, p.ink3, "right");
  label(ctx, p, "피치 ↑", 24, h - 9, p.ink3);
};

const drawSalience: Draw = (ctx, w, h, t, p) => {
  const frames = [salience(t - 0.01), salience(t)], x0 = 24, width = w - 48, rowH = (h - 70) / 2;
  frames.forEach((sal, fi) => {
    const base = 30 + rowH * (fi + 1) + fi * 10;
    path(ctx, [[x0, base], [x0 + width, base]], p.line);
    ctx.fillStyle = fi ? p.ink : p.ink3;
    sal.forEach((v, b) => { const bh = v * (rowH - 10); ctx.fillRect(x0 + width * b / 360, base - bh, Math.max(1, width / 360), bh); });
    const sum = sal.reduce((a, v) => a + v, 0), max = Math.max(...sal);
    label(ctx, p, fi ? "프레임 n+1" : "프레임 n", x0, base - rowH + 6, p.ink2, "left", 700);
    label(ctx, p, `최대 ${max.toFixed(2)} · 합 ${sum.toFixed(1)}`, x0 + width, base - rowH + 6, p.ink2, "right");
  });
  [36, 48, 60, 72, 84].forEach((m) => { const b = (centOf(m) - C_LO) / (C_HI - C_LO) * 359; label(ctx, p, `C${m / 12 - 1}`, x0 + width * b / 360, h - 14, p.ink3, "center"); });
};

function stateColumns(w: number) { const x0 = 24, width = w - 48, step = width / STATES.length; return STATES.map((_, j) => x0 + step * (j + 0.5)); }
function notePills(ctx: CanvasRenderingContext2D, p: Palette, w: number, top: number, height: number, color: string) {
  const xs = stateColumns(w), step = xs[1] - xs[0];
  STATES.forEach((s, j) => {
    if (s.pitch === null) { ctx.setLineDash([2, 2]); ctx.strokeStyle = p.ink3; ctx.strokeRect(xs[j] - step * 0.35, top + height - 6, step * 0.7, 5); ctx.setLineDash([]); return; }
    const y = top + height - 6 - (s.pitch - 62) / 12 * (height - 10);
    ctx.fillStyle = color; ctx.fillRect(xs[j] - step * 0.4, y, step * 0.8, 5);
  });
}

const drawObservation: Draw = (ctx, w, h, t, p) => {
  const obs = observationAt(t), xs = stateColumns(w), step = xs[1] - xs[0], top = 40, base = h - 34, barH = base - top - 70;
  label(ctx, p, `악보 상태 ${STATES.length}개 · 음표와 쉼표`, 24, 14, p.ink2, "left", 700);
  notePills(ctx, p, w, 26, 56, p.ink2);
  path(ctx, [[24, base], [w - 24, base]], p.line);
  obs.forEach((o, j) => {
    const bh = o.score * barH;
    ctx.fillStyle = o.rest ? p.ink3 : p.ink; ctx.fillRect(xs[j] - step * 0.3, base - bh, step * 0.6, bh);
  });
  label(ctx, p, "음높이가 같은 음표는 같은 점수 — 위치는 아직 하나로 정해지지 않습니다", 24, h - 14, p.ink3);
};

const drawBelief: Draw = (ctx, w, h, t, p) => {
  const bel = belief(t), xs = stateColumns(w), step = xs[1] - xs[0], base = h - 40, top = 92, max = Math.max(...bel);
  label(ctx, p, "악보 위치별 확률", 24, 14, p.ink2, "left", 700);
  notePills(ctx, p, w, 26, 56, p.ink3);
  path(ctx, [[24, base], [w - 24, base]], p.line);
  const pts: [number, number][] = [];
  bel.forEach((v, j) => { const bh = v / max * (base - top); ctx.fillStyle = p.wash; ctx.fillRect(xs[j] - step * 0.42, base - bh, step * 0.84, bh); pts.push([xs[j], base - bh]); });
  path(ctx, pts, p.ink, 2);
  const arg = predictedIndex(t), conf = confirmedIndex(t);
  label(ctx, p, "예측", xs[arg], base - bel[arg] / max * (base - top) - 10, p.ink, "center", 800);
  label(ctx, p, "▲ 확정 · 지나간 음", xs[conf], base + 14, p.ink2, "center", 700);
  if (beliefFrozen(t)) label(ctx, p, "무정보 · 갱신 멈춤", w - 24, 14, p.ink, "right", 800);
  label(ctx, p, "Poisson 지속시간 prior로 머문 길이까지 반영", w - 24, h - 12, p.ink3, "right");
};

function timePlot(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: Palette, lines: { f: (tau: number) => number; color: string; width: number; dash?: number[]; name: string }[]) {
  const x0 = 34, x1 = w - 20, y0 = 22, y1 = h - 30, span = 3.2, cur = singerU(t), lo = cur - 9, hi = cur + 1;
  path(ctx, [[x0, y0], [x0, y1], [x1, y1]], p.line);
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  lines.forEach((line) => {
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1; x += 2) { const tau = t - (1 - (x - x0) / (x1 - x0)) * span; pts.push([x, y1 - (line.f(tau) - lo) / (hi - lo) * (y1 - y0)]); }
    path(ctx, pts, line.color, line.width, line.dash);
  });
  ctx.restore();
  lines.forEach((line, i) => { path(ctx, [[x0 + 10, y0 + 8 + i * 16], [x0 + 28, y0 + 8 + i * 16]], line.color, line.width, line.dash); label(ctx, p, line.name, x0 + 34, y0 + 8 + i * 16, p.ink2); });
  label(ctx, p, "연주 시간 →", x1, h - 12, p.ink3, "right");
  label(ctx, p, "악보 위치 ↑", x0, h - 12, p.ink3);
}

const drawAnchors: Draw = (ctx, w, h, t, p) => timePlot(ctx, w, h, t, p, [
  { f: anchorU, color: p.ink3, width: 2, name: "앵커 · 예측 음의 시작" },
  { f: playheadU, color: p.ink, width: 2, name: "플레이헤드 · 연속 곡선" },
]);

const drawTempo: Draw = (ctx, w, h, t, p) => {
  const x0 = 30, x1 = w - 30, top = 30, laneH = h * 0.5, layers = tempoLayers(t, 1), layer = layers[layers.length - 1], since = t - layer.time;
  const xOf = (v: number) => x0 + (v - 0.65) / 0.7 * (x1 - x0);
  path(ctx, [[x0, top + laneH], [x1, top + laneH]], p.line);
  [0.8, 1.0, 1.2].forEach((v) => label(ctx, p, `${v.toFixed(1)}×`, xOf(v), top + laneH + 12, p.ink3, "center"));
  ctx.globalAlpha = 0.35;
  layer.cloud.forEach((v, i) => { ctx.beginPath(); ctx.arc(xOf(v), top + laneH / 2 + (hash(i * 5.5) - 0.5) * laneH * 0.75, 2.4, 0, Math.PI * 2); ctx.fillStyle = p.ink; ctx.fill(); });
  ctx.globalAlpha = 1;
  path(ctx, [[xOf(layer.observed), top + 4], [xOf(layer.observed), top + laneH]], p.ink3, since < 0.45 ? 3 : 1.5, [3, 3]);
  path(ctx, [[xOf(layer.median), top], [xOf(layer.median), top + laneH]], p.ink, 1.5);
  label(ctx, p, `중앙값 ${layer.median.toFixed(2)}×`, xOf(layer.median) + 6, top + 6, p.ink, "left", 800);
  label(ctx, p, "입자 템포 · 앵커를 넘을 때만 다시 뽑음 · 점선 = 이번에 잰 템포", x0, 12, p.ink2, "left", 700);
  const ay0 = top + laneH + 34, ay1 = h - 14, xb = (b: number) => x0 + b / TOTAL * (x1 - x0), yv = (m: number) => ay1 - (m - 0.7) / 0.5 * (ay1 - ay0);
  const pts: [number, number][] = [];
  for (let k = 0; k <= 180; k++) { const b = TOTAL * k / 180; pts.push([xb(b), yv(phraseFactor(b))]); }
  path(ctx, [[x0, yv(1)], [x1, yv(1)]], p.line, 1, [2, 3]);
  path(ctx, pts, p.ink2, 1.5);
  const at = xb(modBeat(playheadU(t)));
  path(ctx, [[at, ay0], [at, ay1]], p.ink, 1);
  label(ctx, p, "× 프레이즈 밀당 · 평균 1", x0, ay0 + 2, p.ink2, "left", 700);
};

const drawAccomp: Draw = (ctx, w, h, t, p) => timePlot(ctx, w, h, t, p, [
  { f: singerU, color: p.ink3, width: 1.2, dash: [3, 3], name: "가수의 실제 진행" },
  { f: playheadU, color: p.ink2, width: 1, name: "플레이헤드" },
  { f: accompU, color: p.ink, width: 3, name: "반주 위치 · 멈추거나 뒤로 가지 않음" },
]);

const drawSchedule: Draw = (ctx, w, h, t, p) => {
  const a = accompU(t), lo = a - 1.5, hi = a + 4.5, x0 = 24, x1 = w - 24, y0 = 24, y1 = h - 30, look = schedulerLead(t);
  const xOf = (b: number) => x0 + (b - lo) / (hi - lo) * (x1 - x0), yOf = (m: number) => y1 - (m - 40) / 18 * (y1 - y0);
  ctx.fillStyle = p.wash; ctx.fillRect(xOf(a), y0, Math.max(2, xOf(a + look) - xOf(a)), y1 - y0);
  for (let k = Math.floor(lo / 2) - 1; k <= Math.ceil(hi / 2); k++) {
    const start = k * 2, [root, steps] = CHORDS[((k % CHORDS.length) + CHORDS.length) % CHORDS.length];
    steps.forEach((step) => {
      const x = xOf(start), wd = xOf(start + 1.9) - x, y = yOf(root + step) - 3;
      if (start <= a + look) { ctx.fillStyle = p.ink; ctx.fillRect(x, y, wd, 6); }
      else { ctx.strokeStyle = start <= a + look + 0.2 ? p.ink : p.ink3; ctx.lineWidth = 1; ctx.strokeRect(x, y, wd, 6); }
    });
  }
  path(ctx, [[xOf(a), y0 - 6], [xOf(a), y1]], p.ink, 2);
  label(ctx, p, "반주 위치", xOf(a) + 6, y0 - 4, p.ink, "left", 800);
  label(ctx, p, "음표 시작을 처음 넘는 틱에 발화 · 회색 띠 = 50ms 앞당김", x0, h - 12, p.ink3);
};

const drawOutput: Draw = (ctx, w, h, t, p) => {
  waveLane(ctx, p, w, 12, h * 0.48, t, (tau) => accompSignal(tau), p.ink, "반주 오디오 · 장치 샘플레이트");
  const y = h * 0.66, x0 = 24, x1 = w - 24, xb = (b: number) => x0 + b / TOTAL * (x1 - x0);
  STATES.forEach((s) => { if (s.pitch !== null) { ctx.fillStyle = p.ink3; ctx.fillRect(xb(s.start), y + 22 - (s.pitch - 62) * 2.2, xb(s.start + s.dur * 0.9) - xb(s.start), 4); } });
  const at = xb(modBeat(accompU(t)));
  path(ctx, [[at, y - 4], [at, y + 34]], p.ink, 2);
  label(ctx, p, "화면 커서", at + 6, y - 2, p.ink, "left", 800);
  label(ctx, p, `반주 속도 ${accompTempo(t).toFixed(2)}×`, x1, h - 14, p.ink, "right", 800);
  label(ctx, p, "↺ 이 소리가 다음 블록의 되먹임 입력", x0, h - 14, p.ink2);
};

const OBJECTS: { title: string; data: string; draw: Draw }[] = [
  { title: "라이브 오디오", data: "마이크 + 직전 반주 · 장치 SR 모노 f32 → 32 kHz", draw: drawAudio },
  { title: "피치 특징 (VQT)", data: "배음 6 × 마이크·되먹임 = 12채널 × 360빈 · 10ms마다 컬럼 1개", draw: drawVQT },
  { title: "음높이 salience", data: "CNN 로짓 360 → sigmoid · 한 창에서 2프레임 · 칸마다 0~1 독립", draw: drawSalience },
  { title: "음표별 관측 점수", data: "음표마다 폭 75 cent 종 모양 창 · 쉼표 = 1 − 최대 salience", draw: drawObservation },
  { title: "지금 악보 어디쯤인가", data: "HSMM Forward · Poisson 지속시간 · 소리가 없으면 그대로 멈춤", draw: drawBelief },
  { title: "계단을 매끄러운 위치로", data: "예측 음이 바뀌면 앵커 · 확정마다 템포 갱신 · 0.5초에 걸쳐 수렴", draw: drawAnchors },
  { title: "얼마나 빠르게 따라갈까", data: "입자필터: 음이 지날 때만 후보 갱신 · 중앙값 × 프레이즈 밀당(평균 1)", draw: drawTempo },
  { title: "반주 위치 곡선", data: "템포로 밀고 위치로 천천히 보정 · 실연 tau 1.5", draw: drawAccomp },
  { title: "음 발화 일정", data: "위치가 음표 시작을 처음 넘는 틱에 발화 · 50ms 앞당김", draw: drawSchedule },
  { title: "반주 오디오와 커서", data: "44.1 kHz 합성 → 장치 SR · 위치·배속 → 화면 커서", draw: drawOutput },
];
const STEPS = ["VQT 앞단 · 새 컬럼만 계산", "CNN 본체 · 인과 2D 합성곱 14층", "관측 모델 · 종 모양 창", "HSMM Forward", "확정 규칙 · 템포 에이전트 · 플레이헤드", "입자필터 템포", "결합 · 상보 필터", "스케줄러", "합성", "되먹임 · 다음 블록의 입력"];
const ITEMS = [...OBJECTS, OBJECTS[0], OBJECTS[1]];
const AUTOPLAY_MS = 6000;
// The example plays at half speed so each view can be read before it changes.
const TIME_SCALE = 0.5;
const pad = (n: number) => String(n).padStart(2, "0");

// "Process · detail" labels: the process name reads first, the detail sits underneath.
function StepLabel({ text }: { text: string }) {
  const [head, ...rest] = text.split(" · ");
  return <><b>{head}</b>{rest.length > 0 && <small>{rest.join(" · ")}</small>}</>;
}

export function SignalChain() {
  const n = OBJECTS.length;
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [reduce, setReduce] = useState(false);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const posRef = useRef(0), held = useRef(false), visible = useRef(true), reduceRef = useRef(false), rootRef = useRef<HTMLElement>(null);
  posRef.current = pos;

  const jump = useCallback((to: number) => { setAnimate(false); setPos(to); }, []);
  const go = useCallback((delta: number) => {
    // Without motion there is no transition to finish on the clones, so wrap directly.
    if (reduceRef.current) { setAnimate(false); setPos((value) => (value + delta + n) % n); return; }
    if (delta < 0 && posRef.current === 0) {
      jump(n);
      requestAnimationFrame(() => requestAnimationFrame(() => { setAnimate(true); setPos(n - 1); }));
      return;
    }
    setAnimate(true); setPos((value) => Math.min(n, value + delta));
  }, [jump, n]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceRef.current = reduced; setReduce(reduced); if (reduced) setPlaying(false);
    const seen = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; });
    seen.observe(rootRef.current!);
    let palette: Palette | null = null;
    const theme = new MutationObserver(() => { palette = null; });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const read = (): Palette => {
      const style = getComputedStyle(document.body), token = (name: string) => style.getPropertyValue(name).trim();
      return { ink: token("--ink"), ink2: token("--ink-2"), ink3: token("--ink-3"), line: token("--line"), wash: token("--wash"), paper: token("--paper"), inkRgb: rgb(token("--ink")), paperRgb: rgb(token("--paper")), font: style.fontFamily };
    };
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible.current) return;
      palette ??= read();
      const t = reduced ? 2.1 : (now - start) / 1000 * TIME_SCALE;
      for (let i = Math.max(0, posRef.current - 1); i <= Math.min(ITEMS.length - 1, posRef.current + 2); i++) {
        const canvas = canvases.current[i];
        if (!canvas) continue;
        const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        ITEMS[i].draw(ctx, w, h, t, palette);
      }
    };
    frame = requestAnimationFrame(tick);
    const warm = window.setTimeout(prepareFollower, 300);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(warm); seen.disconnect(); theme.disconnect(); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => { if (!held.current && visible.current) go(1); }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, go]);

  useEffect(() => {
    if (animate) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const left = pos % n, right = (pos + 1) % n;
  return <section className="chain" ref={rootRef} aria-label="소리가 반주가 되기까지 열 단계"
    onMouseEnter={() => { held.current = true; }} onMouseLeave={() => { held.current = false; }} onFocus={() => { held.current = true; }} onBlur={() => { held.current = false; }}>
    <div className="chain-head">
      <div><p className="eyebrow">Signal chain</p><h2><span className="thin">소리가 들어와</span> <span className="black">반주가 되기까지</span></h2></div>
      <div className="ctrl">
        <button type="button" aria-label="이전 단계" onClick={() => go(-1)}>←</button>
        <p className="counter num">{pad(left + 1)} <span>→ {pad(right + 1)}</span></p>
        <button type="button" aria-label="다음 단계" onClick={() => go(1)}>→</button>
        <button type="button" className="chain-play" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "자동 재생"}</button>
      </div>
    </div>
    <div className="chain-viewport">
      <div className={`chain-track${animate && !reduce ? " animate" : ""}`} style={{ transform: `translateX(calc(${-pos} * (50cqw + var(--gap) / 2)))` }}
        onTransitionEnd={(event) => { if (event.target === event.currentTarget && pos >= n) jump(pos - n); }}>
        {ITEMS.map((item, i) => <Fragment key={i}>
          <article className="chain-card" aria-hidden={i !== pos && i !== pos + 1}>
            <header><span className="num">{pad((i % n) + 1)}</span><strong>{item.title}</strong></header>
            <canvas ref={(el) => { canvases.current[i] = el; }} role="img" aria-label={`${item.title}: ${item.data}`} />
            <p>{item.data}</p>
          </article>
          {i < ITEMS.length - 1 && <div className={`chain-arrow${i % n === 1 ? " is-cnn" : ""}`} aria-hidden="true">{i % n === 1 ? <CnnGlyph /> : <span>→</span>}<StepLabel text={STEPS[i % n]} /></div>}
        </Fragment>)}
      </div>
    </div>
    <div className="chain-segs">{OBJECTS.map((item, i) => <button type="button" key={item.title} className={i === left ? "on" : undefined} aria-label={`${i + 1}번 ${item.title}부터 보기`} onClick={() => { setAnimate(true); setPos(i); }} />)}</div>
    <p className="figure-note">예시 멜로디 하나로 그린 설명용 도식입니다. 실제 입력값이 아니며, 각 오브젝트 아래 줄이 실제 데이터의 형태입니다. 전주 · 긴 숨 · 옥타브 실수 · 느려짐이 들어간 예시 연주입니다. 5번 확률 분포만 실제 규칙을 따르도록 그린 설명용 모형이고, 그 뒤의 템포 · 플레이헤드 · 입자필터 · 밀당 · 결합 · 스케줄러는 실제 식으로 계산합니다. {AUTOPLAY_MS / 1000}초마다 다음 단계로 넘어가고, 마우스를 올리면 멈춥니다.</p>
  </section>;
}
