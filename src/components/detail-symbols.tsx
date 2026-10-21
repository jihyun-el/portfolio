"use client";

import { MirrorPoseThumb } from "@/components/mirror-pose-figure";

// One symbol for each part, the same wherever the part is named: beside a detail, and in the product's list of its
// parts. The engine's is its home figure small, the ring with the step being read lit, so the reader keeps hold of
// where the text sits in it. The others are marks drawn as the site draws the thing elsewhere, which read at any
// size; the words beside them carry the step. Line drawings in ink only, in four tones (lit, outline, ordinary,
// receding), and filled plates so nearer things hide farther.
export type SymbolKind = "engine" | "model" | "app" | "pipeline" | "vqa" | "mini" | "classicmate";
// `base` is the site's base path, for the links from a product's picture to its parts; `sign` the contest's photo.
export type SymbolAssets = { base: string; sign: string };
type Pick = { onPick?: (step: string) => void; onHover?: (step: string | null) => void };

const pad = (n: number) => String(n).padStart(2, "0");
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
        {step === entry && <circle className="edge entry" cx={x} cy={y} r={r + 3.4} />}
        <circle className="dot" cx={x} cy={y} r={r} />
        {!bare && <text x={x + (x - RING.cx) / away * reach} y={y + (y - RING.mid) / away * reach + 3} textAnchor="middle">{step}</text>}
        {!bare && <circle className="hit" cx={x} cy={y} r={Math.max(r + 3, 10)} />}
      </g>;
    })}
    {!bare && act && <text className="sy-act" x={RING.cx} y={RING.mid + 5} textAnchor="middle">{act.name}</text>}
  </>;
}

// The marks, in a box of 120 × 64 with strokes in its units, so they thicken with the picture.
// The pitch model: a sung line comes in at its pitch and stands up as the pitch distribution, the longest bar at it.
const MODEL_MARK = (() => {
  const base = 66, top = 8, step = 6, peak = 3, voice: string[] = [];
  for (let x = 6; x <= base - 3; x += 0.75) voice.push(`${x.toFixed(2)},${(top + peak * step + 3.2 * Math.sin((x - 6) / 2.3) * Math.min(1, (x - 6) / 16)).toFixed(2)}`);
  return { base, voice: voice.join(" "), bars: Array.from({ length: 9 }, (_, k) => ({ y: top + k * step, len: 2.5 + 42 * Math.exp(-((k - peak) ** 2) / 2), peak: k === peak })) };
})();
function ModelMark() {
  const { base, voice, bars } = MODEL_MARK;
  return <>
    <line className="lo" x1={base} y1="4" x2={base} y2="60" strokeWidth="1" />
    {bars.map((bar) => <line key={bar.y} className={`bar${bar.peak ? " hi" : ""}`} x1={base + 1.6} y1={bar.y} x2={base + 1.6 + bar.len} y2={bar.y} strokeWidth="3.4" />)}
    <polyline className="edge" points={voice} strokeWidth="1.8" />
  </>;
}

// The app: the phone, as the landing draws it, with the engine's ring of points inside.
const APP_MARK = Array.from({ length: 18 }, (_, k) => {
  const angle = k / 18 * 2 * Math.PI, scale = (1 - RING.near) / (1 - RING.near * Math.cos(angle));
  return { k, x: 60 + 12.5 * Math.sin(angle) * scale, y: 31 + 5.4 * Math.cos(angle) * scale, r: k === 0 ? 2.4 : 0.7 + 1.25 * scale, scale };
}).sort((a, b) => a.scale - b.scale);
function AppMark() {
  return <>
    <rect className="hi plate" x="44" y="2" width="32" height="60" rx="6.5" strokeWidth="1.8" />
    <line className="lo" x1="56" y1="6.6" x2="64" y2="6.6" strokeWidth="1.4" />
    {APP_MARK.map((dot) => <circle key={dot.k} className={dot.k === 0 ? "fill-hi" : "fill"} cx={dot.x} cy={dot.y} r={dot.r} />)}
  </>;
}

// The pipeline: a staff with its notes, and under it the one time axis with a mark where each note is played.
const SCORE_MARK = { lines: [6, 10.5, 15, 19.5, 24], notes: [[14, 2], [27, 4], [40, 3], [60, 5], [73, 6], [86, 4], [104, 1]].map(([x, pos]) => ({ x, y: 24 - pos * 2.25 })) };
function ScoreMark() {
  return <>
    {SCORE_MARK.lines.map((y) => <line key={y} x1="4" y1={y} x2="116" y2={y} strokeWidth="0.8" />)}
    <line className="edge" x1="50" y1="6" x2="50" y2="24" strokeWidth="1" />
    {SCORE_MARK.notes.map(({ x, y }) => <g key={x}>
      <line className="lo" x1={x} y1={y + 3.5} x2={x} y2="46" strokeWidth="0.9" strokeDasharray="1.4 2.2" />
      <ellipse className="fill-hi" cx={x} cy={y} rx="3" ry="2.1" transform={`rotate(-20 ${x} ${y})`} />
      <line className="hi" x1={x + 2.7} y1={y - 0.6} x2={x + 2.7} y2={y - 12} strokeWidth="1.1" />
    </g>)}
    <line className="edge" x1="4" y1="52" x2="116" y2="52" strokeWidth="1.5" />
    {SCORE_MARK.notes.map(({ x }) => <line key={x} className="hi" x1={x} y1="47.5" x2={x} y2="56.5" strokeWidth="1.8" />)}
  </>;
}

// The contest: its photo (720 × 960, the sign at 156, 478, 214 × 116), cropped square on the sign, and beside it the
// four choices with one picked.
const SIGN = { size: [720, 960], middle: [263, 536] };
const VQA_MARK = { crop: [SIGN.middle[0] - 150, SIGN.middle[1] - 150, 300, 300].join(" "), rows: [6, 20.5, 35, 49.5], lens: [30, 22, 34, 18], pick: 2 };
function VqaMark({ sign }: { sign: string }) {
  return <>
    <svg x="2" y="4" width="56" height="56" viewBox={VQA_MARK.crop} preserveAspectRatio="xMidYMid slice"><image href={sign} x="0" y="0" width={SIGN.size[0]} height={SIGN.size[1]} /></svg>
    <rect className="edge" x="2" y="4" width="56" height="56" strokeWidth="1" />
    {VQA_MARK.rows.map((y, k) => k === VQA_MARK.pick
      ? <g key={y}><rect className="fill-hi" x="66" y={y} width="7" height="7" rx="1" /><line className="hi" x1="79" y1={y + 3.5} x2={79 + VQA_MARK.lens[k]} y2={y + 3.5} strokeWidth="2.4" /></g>
      : <g key={y}><rect className="edge" x="66.5" y={y + 0.5} width="6" height="6" rx="1" strokeWidth="1.2" /><line x1="79" y1={y + 3.5} x2={79 + VQA_MARK.lens[k]} y2={y + 3.5} strokeWidth="2" /></g>)}
  </>;
}

function Mark({ kind, sign }: { kind: "model" | "app" | "pipeline" | "vqa"; sign: string }) {
  return <svg className="sy-mark" viewBox="0 0 120 64" aria-hidden="true">
    {kind === "model" ? <ModelMark /> : kind === "app" ? <AppMark /> : kind === "pipeline" ? <ScoreMark /> : <VqaMark sign={sign} />}
  </svg>;
}

export function DetailSymbol({ kind, lit, entry = null, hover = null, empty, related = [], assets, onPick, onHover }: { kind: SymbolKind; lit: string | null; entry?: string | null; hover?: string | null; empty?: string[]; related?: string[]; assets: SymbolAssets } & Pick) {
  if (kind === "mini") return <div className="sy-mini" aria-hidden="true"><MirrorPoseThumb /></div>;
  if (kind === "engine") return <svg className="sy" viewBox="0 0 240 136" aria-hidden="true"><EngineRing lit={lit} entry={entry} hover={hover} empty={empty} onPick={onPick} onHover={onHover} /></svg>;
  if (kind !== "classicmate") return <Mark kind={kind} sign={assets.sign} />;
  // The product: its four parts, each with its own mark and leading to its own detail; the parts a card joins are lit.
  const on = (part: string) => (related.includes(part) ? WHOLE : null);
  const part = (id: Exclude<SymbolKind, "mini" | "classicmate">, name: string) => <li data-on={on(id) ? "" : undefined}><a href={`${assets.base}/projects/classicmate/#${id}`}>
    {id === "engine" ? <svg className="sy" viewBox="0 30 240 96" aria-hidden="true"><EngineRing lit={on(id)} bare /></svg> : <Mark kind={id} sign={assets.sign} />}<span>{name}</span>
  </a></li>;
  return <ol className="sy-parts">{part("engine", "반주 엔진")}{part("model", "음높이 모델")}{part("app", "모바일 앱")}{part("pipeline", "악보 파이프라인")}</ol>;
}
