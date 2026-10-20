"use client";

import { useId, type ReactNode } from "react";
import example from "@/lib/pipeline-example.json";
import { MirrorPoseThumb } from "@/components/mirror-pose-figure";

// The home figures, small: a detail carries the picture of the screen it opened over, with the step being read lit,
// so the reader keeps hold of where the text sits in it. Line drawings in ink only: one thin stroke that keeps its
// width at any size, four tones (lit, outline, ordinary, receding), and filled plates so nearer things hide farther.
export type SymbolKind = "engine" | "model" | "app" | "pipeline" | "vqa" | "mini" | "classicmate";
// `base` is the site's base path, for the links from a product's picture to its parts.
export type SymbolAssets = { base: string; score: string; sign: string; vote: string; clock: string };
type Pick = { onPick?: (step: string) => void; onHover?: (step: string | null) => void };

const pad = (n: number) => String(n).padStart(2, "0");
const tone = (on: boolean, off = "") => (on ? "hi" : off);
const WHOLE = "전체";

// The engine: its ten stages round a ring seen from the front, 01 nearest and largest, as on the home.
const STAGES = 10, ACTS = [{ name: "듣는다", from: 1, to: 3 }, { name: "찾는다", from: 4, to: 5 }, { name: "친다", from: 6, to: 10 }];
const RING = { cx: 120, cy: 60, rx: 142, ry: 52, near: 0.42, mid: 75 };
function ringAt(share: number) {
  const angle = share * 2 * Math.PI, scale = (1 - RING.near) / (1 - RING.near * Math.cos(angle));
  return { x: RING.cx + RING.rx * Math.sin(angle) * scale, y: RING.cy + RING.ry * Math.cos(angle) * scale, scale };
}
const actOf = (step: string | null) => ACTS.find((act) => step !== null && Number(step) >= act.from && Number(step) <= act.to);

function EngineRing({ lit, entry, hover, empty = [], bare = false, onPick, onHover }: { lit: string | null; entry?: string | null; hover?: string | null; empty?: string[]; bare?: boolean } & Pick) {
  const act = actOf(hover ?? lit), whole = lit === WHOLE;
  const stages = Array.from({ length: STAGES }, (_, k) => ({ step: pad(k + 1), ...ringAt(k / STAGES) })).sort((a, b) => a.scale - b.scale);
  return <>
    {Array.from({ length: 90 }, (_, k) => {
      const share = k / 90, point = ringAt(share), stage = Math.round(share * STAGES) % STAGES + 1;
      return <circle key={k} className={`pt${whole || (act && stage >= act.from && stage <= act.to) ? " on" : ""}`} cx={point.x} cy={point.y} r={0.35 + 0.95 * point.scale} />;
    })}
    {stages.map(({ step, x, y, scale }) => {
      const r = 7 * scale ** 0.9, away = Math.hypot(x - RING.cx, y - RING.mid) || 1, reach = r + 8;
      const on = whole || step === lit, none = empty.includes(step);
      return <g key={step} className={`sy-stage${on ? " is-lit" : ""}${none ? " is-empty" : ""}${step === hover ? " is-hover" : ""}`}
        onClick={none || !onPick ? undefined : () => onPick(step)} onPointerEnter={onHover && (() => onHover(step))} onPointerLeave={onHover && (() => onHover(null))}>
        {step === entry && <circle className="edge" cx={x} cy={y} r={r + 3.4} />}
        <circle className="dot" cx={x} cy={y} r={r} />
        {!bare && <text x={x + (x - RING.cx) / away * reach} y={y + (y - RING.mid) / away * reach + 3} textAnchor="middle">{step}</text>}
        {!bare && <circle className="hit" cx={x} cy={y} r={Math.max(r + 3, 10)} />}
      </g>;
    })}
    {!bare && act && <text className="sy-act" x={RING.cx} y={RING.mid + 5} textAnchor="middle">{act.name}</text>}
  </>;
}

// The app: its four MVVM layers as planes pulled apart over the server, the iOS engine apart, one purchase through them.
const AP = { w: 96, d: 56, ux: 0.92, uy: 0.31, vx: -0.92, vy: 0.31, gap: 19, x0: 132, y0: 12 };
const apAt = (u: number, v: number, level: number, x0 = AP.x0) => [x0 + u * AP.ux + v * AP.vx, AP.y0 + u * AP.uy + v * AP.vy + level * AP.gap];
const poly = (points: number[][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const apPlane = (w: number, d: number, level: number, x0 = AP.x0) => poly([apAt(0, 0, level, x0), apAt(w, 0, level, x0), apAt(w, d, level, x0), apAt(0, d, level, x0)]);
// What a step of the app's screen lights: the structure and the handover are the whole stack, handwriting the View
// layer, payment the purchase's path to the server, the account incident the two layers that kept the old data.
const AP_LIT: Record<string, number[]> = { "00": [0, 1, 2, 3], "01": [0], "03": [2, 3], "04": [0, 1, 2, 3], [WHOLE]: [0, 1, 2, 3] };

function AppStack({ lit }: { lit: string | null }) {
  const planes = lit ? AP_LIT[lit] ?? [] : [], pay = lit === "02" || lit === WHOLE, server = 4.25;
  const u = AP.w * 5 / 6, v = AP.d * 0.52, top = apAt(u, v, 0), bottom = apAt(u, v, server);
  const native = { w: 30, d: 24, level: 3, x0: 40 }, port = apAt(AP.w / 6, AP.d * 0.74, 3), edge = apAt(native.w, native.d * 0.55, native.level, native.x0);
  return <>
    <polygon className={`plate ${tone(pay, "edge")}`} points={poly([apAt(-4, -4, server), apAt(AP.w + 4, -4, server), apAt(AP.w + 4, AP.d + 4, server), apAt(-4, AP.d + 4, server)])} />
    <polyline className={tone(pay, "edge")} points={poly([apAt(-4, AP.d + 4, server), apAt(-4, AP.d + 4, server + 0.2), apAt(AP.w + 4, AP.d + 4, server + 0.2), apAt(AP.w + 4, -4, server + 0.2), apAt(AP.w + 4, -4, server)])} />
    <line className={tone(pay, "edge")} x1={apAt(AP.w + 4, AP.d + 4, server)[0]} y1={apAt(AP.w + 4, AP.d + 4, server)[1]} x2={apAt(AP.w + 4, AP.d + 4, server + 0.2)[0]} y2={apAt(AP.w + 4, AP.d + 4, server + 0.2)[1]} />
    {[3, 2, 1, 0].map((level) => <g key={level}>
      <polygon className={`plate ${tone(planes.includes(level), "edge")}`} points={apPlane(AP.w, AP.d, level)} />
      {[1, 2].map((m) => <line key={m} className="lo" x1={apAt(m * AP.w / 3, 0, level)[0]} y1={apAt(m * AP.w / 3, 0, level)[1]} x2={apAt(m * AP.w / 3, AP.d, level)[0]} y2={apAt(m * AP.w / 3, AP.d, level)[1]} />)}
    </g>)}
    <line className={tone(pay)} x1={top[0]} y1={top[1]} x2={bottom[0]} y2={bottom[1]} />
    {[0, 1, 2, 3].map((level) => { const [x, y] = apAt(u, v, level); return <circle key={level} className={`node${pay ? " on" : ""}`} cx={x} cy={y} r="1.9" />; })}
    <polygon className="plate edge" points={apPlane(native.w, native.d, native.level, native.x0)} />
    <ellipse className="lo" cx={apAt(native.w / 2, native.d / 2, native.level, native.x0)[0]} cy={apAt(native.w / 2, native.d / 2, native.level, native.x0)[1]} rx="13" ry="4.4" />
    <line className="lo" x1={edge[0]} y1={edge[1]} x2={port[0]} y2={port[1]} />
  </>;
}

// The pitch model, as the landing draws it: the singer's voice comes in from the left as a trace of its pitch, the
// played accompaniment from the right as the reference, both into the phone, where the column of pitch bins stands
// with the sung bin lit. What a step lights: the column for the output and the training, the voice for the problem
// and the data, the reference for its input, the phone for the device, the echo for the measured room.
const MD = { left: 6, right: 234, phone: [102, 8, 36, 94] as const, col: { x: 120, top: 30, bottom: 82, peak: 50 } };
const MD_LIT: Record<string, ("column" | "voice" | "reference" | "phone" | "echo")[]> = {
  "00": ["column"], "01": ["voice", "column"], "02": ["phone"], "03": ["reference"], "04": ["voice"], "05": ["echo"], "06": ["column"],
  "07": ["voice", "reference", "column"], [WHOLE]: ["voice", "reference", "column", "phone", "echo"],
};
const voicePath = (() => {
  const points: string[] = [];
  for (let x = MD.left; x <= MD.col.x; x += 2) points.push(`${x},${(MD.col.peak + 2.2 * Math.sin(x / 3.2) * Math.min(1, (x - MD.left) / 30)).toFixed(1)}`);
  return points.join(" ");
})();

function ModelColumn({ lit }: { lit: string | null }) {
  const on = (part: (typeof MD_LIT)[string][number]) => !!lit && (MD_LIT[lit] ?? []).includes(part);
  const [px, py, pw, ph] = MD.phone, ticks = Array.from({ length: 14 }, (_, k) => MD.col.top + k * (MD.col.bottom - MD.col.top) / 13);
  return <>
    <rect className={`plate ${tone(on("phone"), "edge")}`} x={px} y={py} width={pw} height={ph} rx="7" />
    <path className={tone(on("echo"), "lo")} d={`M${px + pw} ${py + ph - 10} C ${px + pw + 26} ${py + ph + 4}, ${px + pw + 26} ${py + ph - 34}, ${px + pw} ${py + ph - 22}`} fill="none" />
    <polyline className={tone(on("voice"), "edge")} points={voicePath} fill="none" />
    <line className={tone(on("reference"), "edge")} x1={MD.right} y1={MD.col.top - 8} x2={px + pw} y2={MD.col.top - 8} />
    <line className={tone(on("reference"), "lo")} x1={px + pw} y1={MD.col.top - 8} x2={MD.col.x + 4} y2={MD.col.top - 2} />
    {ticks.map((y) => { const peak = Math.abs(y - MD.col.peak) < 3; return <line key={y} className={tone(on("column"), "edge")} x1={MD.col.x - (peak ? 7 : 3)} y1={y} x2={MD.col.x + (peak ? 7 : 3)} y2={y} />; })}
  </>;
}

// The pipeline: the first line of the song it engraved, the cursor's stops on it, and the one time axis under it.
const [DOC_W] = example.page.doc, [SYSTEM_TOP, SYSTEM_BOTTOM] = example.page.systems[0];
const LINE = { top: SYSTEM_TOP - 700, height: SYSTEM_BOTTOM - SYSTEM_TOP + 1200 };
const STOPS = example.notes.map(([t0, , x0, y0, x1, y1]) => ({ t0, x0, y0, x1, y1 })).filter((note) => (note.y0 + note.y1) / 2 < SYSTEM_BOTTOM + 500);

function ScoreLine({ lit, score, width = 240 }: { lit: string | null; score: string; width?: number }) {
  const clip = useId(), height = width * LINE.height / DOC_W, whole = lit === "00" || lit === WHOLE, time = whole || lit === "01";
  const end = Math.max(...STOPS.map((note) => note.t0)), k = width / 240, axis = height + 12 * k;
  return <>
    <svg x="0" y="0" width={width} height={height} viewBox={`0 ${LINE.top} ${DOC_W} ${LINE.height}`} overflow="hidden">
      <clipPath id={clip}><rect x="0" y={LINE.top} width={DOC_W} height={LINE.height} /></clipPath>
      <rect className="paper" x="0" y={LINE.top} width={DOC_W} height={LINE.height} />
      <image href={score} x="0" y="0" width={DOC_W} height={example.page.doc[1]} clipPath={`url(#${clip})`} opacity={lit === null || whole || time ? 1 : 0.55} />
      {STOPS.map((note) => <rect key={note.t0} className={`stop${time ? " on" : ""}`} x={note.x0 - 60} y={note.y0 - 60} width={note.x1 - note.x0 + 120} height={note.y1 - note.y0 + 120} />)}
    </svg>
    <rect className={tone(whole, "edge")} x="0.5" y="0.5" width={width - 1} height={height - 1} />
    <line className={tone(time, "edge")} x1="0" y1={axis} x2={width} y2={axis} />
    {STOPS.map((note) => <line key={note.t0} className={tone(time)} x1={4 * k + note.t0 / end * (width - 8 * k)} y1={axis - 3 * k} x2={4 * k + note.t0 / end * (width - 8 * k)} y2={axis + 3 * k} />)}
    {/* The commentary: lines of text beside it. */}
    {[0, 1, 2].map((row) => <line key={row} className={tone(lit === "02" || whole)} x1={50 * k} y1={axis + (14 + row * 5.5) * k} x2={(row === 2 ? 118 : 150) * k} y2={axis + (14 + row * 5.5) * k} />)}
  </>;
}

// The contest: one cell per step, each holding a piece of that step's picture.
const SIGN = { size: [720, 960], box: [156, 478, 214, 116] }, CELL = { w: 55.5, h: 60, gap: 6 };
const VQA_SIZES = [{ b: 4, right: 338 }, { b: 8, right: 351 }, { b: 32, right: 368 }];

function VqaCells({ lit, entry, hover, assets, onPick, onHover }: { lit: string | null; entry?: string | null; hover?: string | null; assets: SymbolAssets } & Pick) {
  const clip = useId(), whole = lit === WHOLE;
  // The sign, as large as the cell: the photo is placed so its sign fills the cell's width.
  const zoom = (CELL.w - 6) / SIGN.box[2];
  const far = (href: string) => <image href={href} x="0" y="0" width={CELL.w} height={CELL.h} preserveAspectRatio="xMidYMid slice" />;
  const near = <image href={assets.sign} x={3 - SIGN.box[0] * zoom} y={(CELL.h - SIGN.box[3] * zoom) / 2 - SIGN.box[1] * zoom} width={SIGN.size[0] * zoom} height={SIGN.size[1] * zoom} />;
  const curve = (b: number) => [6 + b / 130 * (CELL.w - 12), CELL.h - 10 - (318 + 14.43 * Math.log(b) - 325) / 75 * (CELL.h - 22)];
  const cells: ReactNode[] = [
    far(assets.sign),
    near,
    <>{near}{[0.36, 0.54, 0.72].map((y) => <line key={y} className="hi" x1="10" y1={CELL.h * y} x2={CELL.w - 14} y2={CELL.h * y} />)}</>,
    <>
      <line className="lo" x1="6" y1={curve(4)[1] - (400 - 338) / 75 * (CELL.h - 22)} x2={CELL.w - 6} y2={curve(4)[1] - (400 - 338) / 75 * (CELL.h - 22)} strokeDasharray="1.5 2" />
      <polyline className="edge" points={poly(Array.from({ length: 30 }, (_, k) => curve(3 + k * 123 / 29)))} />
      {VQA_SIZES.map((size) => <circle key={size.b} className="node on" cx={curve(size.b)[0]} cy={curve(size.b)[1]} r="1.9" />)}
      <circle className="plate edge" cx={curve(122)[0]} cy={curve(122)[1]} r="2.2" />
    </>,
    far(assets.vote),
    <>{[0, 1, 2, 3].map((k) => <g key={k}>
      <rect className="edge" x={7 + k * 11.2} y="13" width="7" height="7" /><rect className="edge" x={7 + k * 11.2} y={CELL.h - 20} width="7" height="7" />
      <line className="lo" x1={10.5 + k * 11.2} y1="20" x2={10.5 + [2, 0, 3, 1][k] * 11.2} y2={CELL.h - 20} />
    </g>)}</>,
    far(assets.clock),
    <>
      <polyline className="edge" points={poly([[12, CELL.h - 14], [CELL.w - 14, 18]])} />
      <circle className="plate edge" cx="12" cy={CELL.h - 14} r="2.2" /><circle className="node on" cx={CELL.w - 14} cy="18" r="2.4" />
    </>,
  ];
  return <>
    <clipPath id={clip}><rect x="0" y="0" width={CELL.w} height={CELL.h} /></clipPath>
    {cells.map((cell, k) => {
      const step = pad(k), on = whole || step === lit;
      return <g key={step} transform={`translate(${(k % 4) * (CELL.w + CELL.gap)} ${Math.floor(k / 4) * (CELL.h + CELL.gap)})`} className={`sy-cell${on ? " is-lit" : ""}${step === hover ? " is-hover" : ""}`}
        onClick={onPick && (() => onPick(step))} onPointerEnter={onHover && (() => onHover(step))} onPointerLeave={onHover && (() => onHover(null))}>
        <g clipPath={`url(#${clip})`} className="sy-cell-in">{cell}</g>
        <rect className="frame" x="0" y="0" width={CELL.w} height={CELL.h} />
        <rect className="tag" x="0" y="0" width="14" height="10" /><text x="7" y="7.6" textAnchor="middle">{step}</text>
        {step === entry && <polygon className="mark" points={poly([[CELL.w - 9, 0], [CELL.w, 0], [CELL.w, 9]])} />}
        <rect className="hit" x="0" y="0" width={CELL.w} height={CELL.h} />
      </g>;
    })}
  </>;
}

export function DetailSymbol({ kind, lit, entry = null, hover = null, empty, related = [], assets, onPick, onHover }: { kind: SymbolKind; lit: string | null; entry?: string | null; hover?: string | null; empty?: string[]; related?: string[]; assets: SymbolAssets } & Pick) {
  if (kind === "mini") return <div className="sy-mini" aria-hidden="true"><MirrorPoseThumb /></div>;
  if (kind === "engine") return <svg className="sy" viewBox="0 0 240 136" aria-hidden="true"><EngineRing lit={lit} entry={entry} hover={hover} empty={empty} onPick={onPick} onHover={onHover} /></svg>;
  if (kind === "model") return <svg className="sy" viewBox="0 0 240 110" aria-hidden="true"><ModelColumn lit={lit} /></svg>;
  if (kind === "app") return <svg className="sy" viewBox="0 0 240 148" aria-hidden="true"><AppStack lit={lit} /></svg>;
  if (kind === "pipeline") return <svg className="sy" viewBox="0 0 240 118" aria-hidden="true"><ScoreLine lit={lit} score={assets.score} /></svg>;
  if (kind === "vqa") return <svg className="sy" viewBox="0 0 240 126" aria-hidden="true"><VqaCells lit={lit} entry={entry} hover={hover} assets={assets} onPick={onPick} onHover={onHover} /></svg>;
  // The product: its four parts, each with its own picture and leading to its own detail; the parts a card joins are lit.
  const on = (part: string) => (related.includes(part) ? WHOLE : null);
  return <ol className="sy-parts">
    <li data-on={on("engine") ? "" : undefined}><a href={`${assets.base}/projects/classicmate/#engine`}><svg className="sy" viewBox="0 30 240 96" aria-hidden="true"><EngineRing lit={on("engine")} bare /></svg><span>반주 엔진</span></a></li>
    <li data-on={on("model") ? "" : undefined}><a href={`${assets.base}/projects/classicmate/#model`}><svg className="sy" viewBox="0 0 240 110" aria-hidden="true"><ModelColumn lit={on("model")} /></svg><span>음높이 모델</span></a></li>
    <li data-on={on("app") ? "" : undefined}><a href={`${assets.base}/projects/classicmate/#app`}><svg className="sy" viewBox="0 4 240 144" aria-hidden="true"><AppStack lit={on("app")} /></svg><span>모바일 앱</span></a></li>
    <li data-on={on("pipeline") ? "" : undefined}><a href={`${assets.base}/projects/classicmate/#pipeline`}><svg className="sy" viewBox="0 0 240 84" aria-hidden="true"><ScoreLine lit={on("pipeline")} score={assets.score} /></svg><span>악보 파이프라인</span></a></li>
  </ol>;
}
