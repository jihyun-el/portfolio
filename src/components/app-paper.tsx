"use client";

import { useId, type ReactNode } from "react";
import example from "@/lib/pipeline-example.json";

// The app's four decision steps drawn on the paper a classical-music student works with: the pipeline's own engraving
// of Debussy's "L'âme évaporée" (OpenScore Lieder, CC0) with pencil marks on it, two store receipts, a ledger, a
// library folder, the handover documents. Pencil and stamp textures are SVG filters; stamps are in the app's navy.
// Facts: the app repository (ARCHITECTURE §5-2 · §5-5 · §7, migration notes_wallet_schema, bug_004).
// The pipeline's steps are drawn on the same paper with these tools (src/components/pipeline-paper.tsx).

const [DOC_W, DOC_H] = example.page.doc;
export const f1 = (v: number) => v.toFixed(1);

// A repeatable wobble, so a hand-drawn mark looks the same on every render.
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Points to one smooth path (quadratic through the midpoints).
export function smooth(points: number[][]) {
  let d = `M${f1(points[0][0])} ${f1(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [nx, ny] = points[i + 1];
    d += ` Q${f1(x)} ${f1(y)} ${f1((x + nx) / 2)} ${f1((y + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${f1(last[0])} ${f1(last[1])}`;
}
// A loop drawn by hand around a point: a little more than one turn, slightly tilted, never quite closing.
export function handLoop(cx: number, cy: number, rx: number, ry: number, seed: number) {
  const r = rng(seed), a0 = -2.4 + r() * 0.5, tilt = -0.14, wob = r() * 6, n = 54;
  return smooth(Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + 2.25 * Math.PI * k / n, m = 1 + 0.05 * Math.sin(3 * a + wob) + 0.07 * k / n;
    const x = rx * m * Math.cos(a), y = ry * m * Math.sin(a);
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
  }));
}
// A line drawn by hand from a to b, bowed by `bow` (a fraction of its length).
export function handLine(a: number[], b: number[], seed: number, bow = 0) {
  const r = rng(seed), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, n = 14;
  return smooth(Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n, off = bow * len * 4 * t * (1 - t) + (k > 0 && k < n ? (r() - 0.5) * len * 0.006 : 0);
    return [a[0] + dx * t + nx * off, a[1] + dy * t + ny * off];
  }));
}
// A brace drawn under a row of things, from x1 to x2, its point down at y + 22.
export function brace(x1: number, x2: number, y: number) {
  const m = (x1 + x2) / 2;
  return `M${x1} ${y} Q${x1} ${y + 11} ${x1 + 18} ${y + 11} L${m - 14} ${y + 11} Q${m} ${y + 11} ${m} ${y + 22} Q${m} ${y + 11} ${m + 14} ${y + 11} L${x2 - 18} ${y + 11} Q${x2} ${y + 11} ${x2} ${y}`;
}
// An arrowhead at b, pointing from a.
export function head(a: number[], b: number[], size: number) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), w = 0.45;
  const p = (s: number) => [b[0] - size * Math.cos(ang + s * w), b[1] - size * Math.sin(ang + s * w)];
  const [l, r] = [p(1), p(-1)];
  return `M${f1(l[0])} ${f1(l[1])} L${f1(b[0])} ${f1(b[1])} L${f1(r[0])} ${f1(r[1])}`;
}

// Pencil: the stroke's edge roughened, then broken up by paper grain. `unit` is user units per screen pixel of the
// space it is used in (the score is drawn in the engraving's own units).
function Pencil({ id, unit, region }: { id: string; unit: number; region: number[] }) {
  return <filter id={id} filterUnits="userSpaceOnUse" x={region[0]} y={region[1]} width={region[2]} height={region[3]}>
    <feTurbulence type="fractalNoise" baseFrequency={0.7 / unit} numOctaves={2} seed={4} result="warp" />
    <feDisplacementMap in="SourceGraphic" in2="warp" scale={1.6 * unit} xChannelSelector="R" yChannelSelector="G" result="rough" />
    <feTurbulence type="fractalNoise" baseFrequency={1.6 / unit} numOctaves={1} seed={11} result="grain" />
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.3" result="mask" />
    <feComposite in="rough" in2="mask" operator="in" />
  </filter>;
}
export function Defs({ id }: { id: string }) {
  return <defs>
    <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow className="pp-shadow" dx="0" dy="5" stdDeviation="8" /></filter>
    <filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow className="pp-shadow" dx="0" dy="2" stdDeviation="3" /></filter>
    <Pencil id={`${id}-pv`} unit={1} region={[-100, -100, 1200, 900]} />
    <Pencil id={`${id}-pd`} unit={DOC_W / 700} region={[-1000, -1000, DOC_W + 2000, DOC_H + 2000]} />
    {/* Stamp ink: blotchy, with the paper showing through where the rubber did not touch. */}
    <filter id={`${id}-stamp`} filterUnits="userSpaceOnUse" x="-100" y="-100" width="1300" height="900">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="rough" />
      <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves={3} seed={21} result="blot" />
      <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 3.25" result="mask" />
      <feComposite in="rough" in2="mask" operator="in" />
    </filter>
  </defs>;
}

// One region of the engraved page in a box of the picture. Children draw in the engraving's units.
export function Score({ score, x, y, w, h, view, children }: { score: string; x: number; y: number; w: number; h: number; view: number[]; children?: ReactNode }) {
  return <svg x={x} y={y} width={w} height={h} viewBox={view.join(" ")} preserveAspectRatio="xMidYMid slice">
    <image href={score} x="0" y="0" width={DOC_W} height={DOC_H} />
    {children}
  </svg>;
}

/* ---------- 필기 ---------- */

// The top two systems of the page; the first sung note ("L'âme") is the one the student circles.
const CROP = [250, 300, 20500, 12300];
const SUNG = example.notes.find(([t0]) => t0 === 8000)!;
const NOTE = [(SUNG[2] + SUNG[4]) / 2, (SUNG[3] + SUNG[5]) / 2];
// A student's pencil on the vocal line: the circled note, two breath marks, one phrase arc.
function StudentMarks({ filter }: { filter: string }) {
  const v = (x: number, y: number, seed: number) => { const r = rng(seed), w = 150 + r() * 40; return `M${x - w} ${y - 330} Q${x - w * 0.4} ${y - 120} ${x} ${y} Q${x + w * 0.3} ${y - 200} ${x + w * 1.1} ${y - 400}`; };
  return <g className="pp-pencil" filter={`url(#${filter})`} strokeWidth="80">
    <path d={handLoop(NOTE[0], NOTE[1] + 80, 880, 720, 3)} />
    <path d={v(7020, 7520, 5)} />
    <path d={v(14520, 7420, 9)} />
    <path d={handLine([8350, 7330], [13700, 7180], 12, -0.07)} />
  </g>;
}

function Lens({ id, score, cx, cy, r, half, drift }: { id: string; score: string; cx: number; cy: number; r: number; half: number; drift?: { origin: number[]; scale: number } }) {
  const clip = `${id}-clip-${drift ? "a" : "b"}`;
  const ink = <path className="pp-pencil" filter={`url(#${id}-pd)`} strokeWidth="80" d={handLoop(NOTE[0], NOTE[1] + 80, 880, 720, 3)} />;
  return <g>
    <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
    <circle cx={cx} cy={cy} r={r} className="pp-paper" filter={`url(#${id}-shadow)`} />
    <g clipPath={`url(#${clip})`}>
      <Score score={score} x={cx - r} y={cy - r} w={2 * r} h={2 * r} view={[NOTE[0] - half, NOTE[1] + 300 - half, 2 * half, 2 * half]}>
        {drift ? <g transform={`translate(${drift.origin[0]} ${drift.origin[1]}) scale(${drift.scale}) translate(${-drift.origin[0]} ${-drift.origin[1]})`}>{ink}</g> : ink}
      </Score>
    </g>
    <circle cx={cx} cy={cy} r={r} className="pp-lens-ring" />
    <path className="pp-lens-glint" d={`M${f1(cx - r * 0.72)} ${f1(cy - r * 0.32)} A${r * 0.78} ${r * 0.78} 0 0 1 ${f1(cx - r * 0.18)} ${f1(cy - r * 0.76)}`} />
  </g>;
}

export function PaperStroke({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const sheet = { x: 8, y: 112, w: 700, h: 420 }, s = sheet.w / CROP[2], turn = -1.2;
  const sc = [sheet.x + sheet.w / 2, sheet.y + sheet.h / 2];
  // Where the circled note lands once the sheet is turned.
  const nx = sheet.x + (NOTE[0] - CROP[0]) * s, ny = sheet.y + (NOTE[1] + 60 - CROP[1]) * s, a = turn * Math.PI / 180;
  const note = [sc[0] + (nx - sc[0]) * Math.cos(a) - (ny - sc[1]) * Math.sin(a), sc[1] + (nx - sc[0]) * Math.sin(a) + (ny - sc[1]) * Math.cos(a)];
  const lenses = [{ cy: 176, drift: true, name: "PDF와 필기가 따로 확대", sub: "필기만 커지고 악보는 그대로" }, { cy: 452, drift: false, name: "PDF 원본 좌표에 저장", sub: "악보와 필기가 함께 커짐" }];
  const R = 100, LX = 874, half = 1150;
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label="연필 필기가 남은 드뷔시 악보 한 장. 동그라미 친 음표를 두 배로 확대하면, PDF와 필기가 따로 확대될 때는 필기만 커져 음표에서 벗어나고, PDF 원본 좌표에 저장하면 함께 커진다.">
    <Defs id={id} />
    <g transform={`rotate(${turn} ${sc[0]} ${sc[1]})`}>
      <rect x={sheet.x} y={sheet.y} width={sheet.w} height={sheet.h} className="pp-paper" filter={`url(#${id}-shadow)`} />
      <Score score={score} x={sheet.x} y={sheet.y} w={sheet.w} h={sheet.h} view={CROP}><StudentMarks filter={`${id}-pd`} /></Score>
    </g>
    {lenses.map((lens) => {
      const dx = LX - note[0], dy = lens.cy - note[1], d = Math.hypot(dx, dy);
      return <path key={lens.cy} className="pp-callout" d={`M${f1(note[0] + dx / d * 30)} ${f1(note[1] + dy / d * 30)} L${f1(LX - dx / d * (R + 4))} ${f1(lens.cy - dy / d * (R + 4))}`} />;
    })}
    {lenses.map((lens) => <g key={lens.name}>
      <Lens id={id} score={score} cx={LX} cy={lens.cy} r={R} half={lens.drift ? half * 2 : half} drift={lens.drift ? { origin: [NOTE[0] - half * 1.4, NOTE[1] - half * 1.2], scale: 2 } : undefined} />
      <text className="pp-name" x={LX} y={lens.cy + R + 30} textAnchor="middle">{lens.name}</text>
      <text className="pp-sub" x={LX} y={lens.cy + R + 52} textAnchor="middle">{lens.sub}</text>
    </g>)}
  </svg>;
}

/* ---------- 결제 ---------- */

// A group placed at (x, y) and turned by `turn` degrees about its own point c: where its local point p lands.
function placed(x: number, y: number, turn: number, c: number[], p: number[]) {
  const a = turn * Math.PI / 180, dx = p[0] - c[0], dy = p[1] - c[1];
  return [x + c[0] + dx * Math.cos(a) - dy * Math.sin(a), y + c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}
function Barcode({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  const r = rng(seed), bars: number[][] = [];
  for (let at = 0; at < w;) { const bw = 1 + Math.floor(r() * 3.2), gap = 1 + Math.floor(r() * 2.6); if (at + bw <= w) bars.push([at, bw]); at += bw + gap; }
  return <g className="pp-print">{bars.map(([at, bw]) => <rect key={at} x={x + at} y={y} width={bw} height={h} />)}</g>;
}
export function Stamp({ x, y, turn, round, text, id, w = 150 }: { x: number; y: number; turn: number; round?: boolean; text: string; id: string; w?: number }) {
  return <g className="pp-stamp" filter={`url(#${id}-stamp)`} transform={`translate(${x} ${y}) rotate(${turn})`}>
    {round ? <><circle r="48" /><circle r="40" /></> : <><rect x={-w / 2} y="-25" width={w} height="50" rx="5" /><rect x={-w / 2 + 6} y="-19" width={w - 12} height="38" rx="3" /></>}
    <text y={round ? 11 : 7.5} textAnchor="middle" className={round ? "pp-stamp-big" : "pp-stamp-text"}>{text}</text>
  </g>;
}
// One store receipt: the fields the server keys a purchase on, the same on both copies, and what the server stamped.
const RW = 232, RH = 384, ID_ROW = 156;
function Receipt({ x, y, turn, id, stamp }: { x: number; y: number; turn: number; id: string; stamp: "paid" | "done" }) {
  const teeth = 14, zig = Array.from({ length: teeth + 1 }, (_, k) => `L${f1(RW - k * RW / teeth)} ${k % 2 ? RH - 8 : RH}`).join(" ");
  const rows: [string, string][] = [["provider", "apple"], ["transactionId", "••••••••"], ["상품", "음표 충전"]];
  return <g transform={`translate(${x} ${y}) rotate(${turn} ${RW / 2} ${RH / 2})`}>
    <path className="pp-paper" filter={`url(#${id}-shadow)`} d={`M0 0 H${RW} V${RH} ${zig} Z`} />
    <text className="pp-r-head" x={RW / 2} y="48" textAnchor="middle">구매 영수증</text>
    <text className="pp-r-sub" x={RW / 2} y="72" textAnchor="middle">App Store · JWS 서명</text>
    <line className="pp-r-rule" x1="18" x2={RW - 18} y1="92" y2="92" />
    {rows.map(([k, v], i) => <g key={k}><text className="pp-r-key" x="18" y={126 + i * 30}>{k}</text><text className="pp-r-val" x={RW - 18} y={126 + i * 30} textAnchor="end">{v}</text></g>)}
    <line className="pp-r-rule" x1="18" x2={RW - 18} y1="208" y2="208" />
    <Barcode x={30} y={228} w={RW - 60} h={42} seed={5} />
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={handLoop(178, ID_ROW - 5, 46, 17, stamp === "paid" ? 31 : 33)} /></g>
    {stamp === "paid" ? <Stamp id={id} x={RW / 2} y={322} turn={-14} round text="지급" /> : <Stamp id={id} x={RW / 2} y={324} turn={7} text="이미 처리됨" />}
  </g>;
}

export function PaperPayment() {
  const id = useId().replace(/:/g, "");
  const kinds = ["유료", "보상", "환불 부채"];
  const A = { x: 24, y: 78, turn: -4 }, B = { x: 262, y: 112, turn: 3.5 }, L = { x: 712, y: 56, turn: 1.2, w: 268, h: 524 };
    const row = placed(L.x, L.y, L.turn, [L.w / 2, L.h / 2], [20, 352]);
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label="같은 거래의 영수증 두 장. 한 장에는 지급, 다른 한 장에는 이미 처리됨 도장이 찍혔다. 결제 제공자와 외부 거래 ID의 고유 제약을 지나 원장에 한 줄만 추가된다.">
    <Defs id={id} />
    <Receipt id={id} {...A} stamp="paid" />
    <Receipt id={id} {...B} stamp="done" />
    {/* The same transaction on both: a pencil line joining the two circled ids. */}
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4">
      <path d={brace(44, 476, 520)} />
      <path d={handLine([B.x + RW + 2, 300], [516, 330], 36, -0.08)} /><path d={head([494, 322], [516, 330], 13)} />
    </g>
    <text className="pp-hand" x="260" y="566" textAnchor="middle">같은 거래</text>
    {/* The key the second copy met, and the one line that went into the ledger. */}
    <g transform="translate(522 300) rotate(-3)">
      <rect className="pp-tag" x="0" y="0" width="160" height="82" rx="6" filter={`url(#${id}-lift)`} />
      <circle className="pp-tag-hole" cx="17" cy="41" r="5" />
      <text className="pp-mono-b" x="34" y="32">UNIQUE</text>
      <text className="pp-mono" x="34" y="54">provider,</text>
      <text className="pp-mono" x="34" y="72">external_id</text>
    </g>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4">
      <path d={handLine([680, 334], [row[0] - 4, row[1] - 4], 43, 0.14)} /><path d={head([row[0] - 30, row[1] - 22], [row[0] - 4, row[1] - 4], 14)} />
    </g>
    <g transform={`translate(${L.x} ${L.y}) rotate(${L.turn} ${L.w / 2} ${L.h / 2})`}>
      <rect className="pp-paper" width={L.w} height={L.h} filter={`url(#${id}-shadow)`} />
      <text className="pp-mono-b" x="20" y="42">credit_wallet</text>
      {kinds.map((kind, i) => <g key={kind}><rect className="pp-box" x={20 + i * 78} y="58" width="72" height="56" /><text className="pp-cell" x={56 + i * 78} y="92" textAnchor="middle">{kind}</text></g>)}
      <text className="pp-mono-b" x="20" y="164">credit_wallet_ledger</text>
      <text className="pp-r-sub" x="20" y="186">추가 전용</text>
      {Array.from({ length: 9 }, (_, i) => <line key={i} className="pp-ruled" x1="20" x2={L.w - 20} y1={220 + i * 36} y2={220 + i * 36} />)}
      {[0, 1, 2, 3].map((i) => <g key={i} className="pp-faded"><rect x="22" y={200 + i * 36} width={52 + (i % 2) * 14} height="8" /><rect x={124 + (i % 3) * 26} y={200 + i * 36} width="40" height="8" /></g>)}
      <text className="pp-mono-b" x="22" y="346">charge</text>
      <text className="pp-cell" x="124" y="346">유료 +</text>
      <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.4">
        <path d={handLoop(56, 86, 44, 36, 47)} />
        <path d={handLine([18, 356], [196, 354], 49, 0.02)} />
        <path d="M206 340 L216 354 L240 322" />
      </g>
    </g>
  </svg>;
}

/* ---------- 계정 경계 ---------- */

const CAUSES: [string, string][] = [["곡 목록 캐시", "로그아웃 뒤에도 메모리에 남음"], ["첫 동기화", "계정 전환을 확인하지 않음"], ["캐시 다운로드", "서버를 거치지 않음"]];
// A singer's black music folder, open flat; what lies in it is drawn over it.
function MusicFolder({ x, y, id, children }: { x: number; y: number; id: string; children?: ReactNode }) {
  const w = 268, h = 356;
  return <g transform={`translate(${x} ${y})`}>
    <rect className="pp-folder" width={w} height={h} rx="12" filter={`url(#${id}-shadow)`} />
    <rect className="pp-folder-in" x="12" y="12" width={w - 24} height={h - 24} rx="6" />
    {[0.36, 0.64].map((t) => <line key={t} className="pp-cord" x1={w * t} x2={w * t} y1="18" y2={h - 18} />)}
    {children}
  </g>;
}

export function PaperAccount({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const pages = [-8, -2, 5], page = [0, 300, DOC_W, DOC_W * 1.25];
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label="탈퇴한 계정의 악보 파일에 악보가 남아 있고, 같은 기기의 새 계정으로 넘어가던 경로 세 곳(곡 목록 캐시, 첫 동기화, 캐시 다운로드)에 차단 도장이 찍혔다. 새 계정의 악보 파일은 비어 있다.">
    <Defs id={id} />
    <text className="pp-name" x="152" y="96" textAnchor="middle">탈퇴한 계정</text>
    <text className="pp-sub" x="152" y="120" textAnchor="middle">이 기기에 남은 곡</text>
    <MusicFolder id={id} x={18} y={146}>
      {pages.map((turn, i) => <g key={turn} transform={`translate(${30 + i * 14} ${30 + i * 8}) rotate(${turn} 100 125)`}>
        <rect className="pp-paper" width="200" height="250" filter={`url(#${id}-lift)`} />
        <Score score={score} x={0} y={0} w={200} h={250} view={page} />
      </g>)}
    </MusicFolder>
    {CAUSES.map(([name, why], i) => {
      const y = 214 + i * 118, start = [292, 324 + (i - 1) * 46], end = [394, y];
      return <g key={name}>
        <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4">
          <path strokeDasharray="7 8" d={handLine(start, end, 60 + i, (i - 1) * -0.12)} />
          <path d={head([start[0] + (end[0] - start[0]) * 0.8, start[1] + (end[1] - start[1]) * 0.8], end, 13)} />
        </g>
        <g transform={`translate(400 ${y - 38}) rotate(${(i - 1) * 1.4})`}>
          <rect className="pp-tape" width="308" height="76" />
          <text className="pp-name-l" x="20" y="33">{name}</text>
          <text className="pp-sub-l" x="20" y="57">{why}</text>
          <Stamp id={id} x={252} y={38} turn={-10 + i * 8} text="차단" w={88} />
        </g>
      </g>;
    })}
    <text className="pp-name" x="866" y="96" textAnchor="middle">새 계정</text>
    <text className="pp-sub" x="866" y="120" textAnchor="middle">빈 보관함으로 시작</text>
    <MusicFolder id={id} x={732} y={146} />
  </svg>;
}

/* ---------- 인수인계 ---------- */

const ADRS: [string, string][] = [
  ["PDF 오버레이", "원본 좌표에 필기"], ["Dart 추종 폐기", "전용 엔진으로"], ["네이티브", "닫힌 루프"], ["온디바이스", "소프트신스 반주"],
  ["SoLoud", "단일 수명 주기"], ["곡 목록 LWW", "필기 3-way merge"], ["JWS 자체 검증", "Play API"], ["검증 성공 시에만", "구매 완료"],
  ["지갑 3버킷", "추가 전용 원장"], ["소유권 · 지갑 쓰기", "클라이언트 봉쇄"], ["잔액은", "응답으로 갱신"], ["라우터 redirect", "순수 함수"],
];
// ADR-1 as ARCHITECTURE §7 writes it, its lines shortened only.
const ADR1: [string, string[]][] = [
  ["맥락", ["PDF와 필기가 각자 InteractiveViewer를 갖고,", "외부 컨트롤러 미지원 → 확대 · 축소 비동기화"]],
  ["결정", ["페이지별 오버레이를 붙이고 FittedBox로", "\"PDF 원본 좌표에 그리고 렌더만 스케일\""]],
  ["기각한 대안", ["① 배경에 PdfViewer  ② Stack 감싸기", "③ PDF → 이미지 렌더  ④ 수동 동기화", "4차 전부 실패"]],
  ["결과", ["좌표 불변성 확보. 대신 제스처를 직접", "관리해야 해서 상태 머신이 복잡해짐"]],
];
const OTHERS: [string, string][] = [["README", "클론에서 실행까지"], ["HANDOFF", "확장 레시피 · 불변 계약"], ["IAP 전수조사", "결제 커밋 이력"]];

export function PaperHandover() {
  const id = useId().replace(/:/g, "");
  const pivot = [296, 736], radius = 424, cw = 84, ch = 118, step = 7.6;
  const angle = (k: number) => (k - 5.5) * step;
  const slot = placed(pivot[0] - cw / 2, pivot[1] - radius, angle(0), [cw / 2, radius], [cw / 2, 0]);
  const P = { x: 590, y: 52, turn: 1.4, w: 384, h: 540 };
  // Where each of ADR-1's four parts begins on the page.
  let at = 156;
  const parts = ADR1.map(([key, lines]) => { const y = at; at += 28 + lines.length * 21 + 22; return { key, lines, y }; });
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label={`설계 결정 기록 열두 장이 부채꼴로 펼쳐져 있고, 그중 ADR-1을 꺼내 앞에 두었다: ${ADR1.map(([k, lines]) => `${k} ${lines.join(" ")}`).join(", ")}. 아래에 README, HANDOFF, IAP 전수조사 문서가 있다.`}>
    <Defs id={id} />
    <text className="pp-name" x={pivot[0]} y="236" textAnchor="middle">ARCHITECTURE §7</text>
    <text className="pp-sub" x={pivot[0]} y="260" textAnchor="middle">설계 결정 기록 · 맥락 → 결정 → 기각한 대안 → 결과</text>
    {ADRS.map(([l1, l2], k) => <g key={k} transform={`rotate(${angle(k)} ${pivot[0]} ${pivot[1]}) translate(${pivot[0] - cw / 2} ${pivot[1] - radius})`}>
      {k === 0 ? <rect className="pp-slot" width={cw} height={ch} rx="2" />
        : <><rect className="pp-paper" width={cw} height={ch} filter={`url(#${id}-lift)`} />
          <text className="pp-card-num" x="7" y="23">ADR-{k + 1}</text>
          <text className="pp-card" x="9" y="44">{l1}</text>
          <text className="pp-card" x="9" y="59">{l2}</text></>}
    </g>)}
    {OTHERS.map(([name, what], i) => <g key={name} transform={`translate(${28 + i * 170} ${470 + (i % 2) * 10}) rotate(${(i - 1) * 2.4})`}>
      <rect className="pp-paper" width="154" height="112" filter={`url(#${id}-shadow)`} />
      <text className="pp-card-num" x="14" y="30">{name}</text>
      <text className="pp-card" x="14" y="52">{what}</text>
      {[0, 1, 2].map((r) => <rect key={r} className="pp-faded" x="14" y={68 + r * 12} width={110 - r * 22} height="5" />)}
    </g>)}
    {/* ADR-1, taken out of the fan and read. */}
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.2" strokeDasharray="6 8"><path d={handLine([slot[0], slot[1] - 8], [P.x - 8, P.y + 60], 71, -0.2)} /></g>
    <g transform={`translate(${P.x} ${P.y}) rotate(${P.turn} ${P.w / 2} ${P.h / 2})`}>
      <rect className="pp-paper" width={P.w} height={P.h} filter={`url(#${id}-shadow)`} />
      <text className="pp-doc-small" x="28" y="42">§7 아키텍처 결정 기록 (ADR)</text>
      <text className="pp-doc-title" x="28" y="80">ADR-1. PDF+필기 =</text>
      <text className="pp-doc-title" x="28" y="104">pageOverlaysBuilder + FittedBox</text>
      {parts.map(({ key, lines, y }) => <g key={key}>
        <text className="pp-doc-key" x="28" y={y}>{key}</text>
        {lines.map((line, i) => <text key={i} className={line.includes("전부 실패") ? "pp-doc-bold" : "pp-doc"} x="28" y={y + 26 + i * 21}>{line}</text>)}
      </g>)}
      <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.2">
        {parts.map(({ key, y }, i) => <path key={key} d={handLine([24, y + 7], [36 + key.length * 15, y + 6], 81 + i)} />)}
        <path d={handLoop(76, parts[2].y + 26 + 2 * 21 - 5, 58, 16, 85)} />
      </g>
    </g>
  </svg>;
}
