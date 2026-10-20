"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import example from "@/lib/pipeline-example.json";
import { Defs, Score, Stamp, f1, handLine, handLoop, head, rng } from "@/components/app-paper";

// The score pipeline's five steps on the app's paper (src/components/app-paper.tsx): the pipeline's own engraving of
// Debussy's "L'âme évaporée" (OpenScore Lieder, CC0) behind twelve key tabs with the cursor moving at the score's tempo,
// the one timeline it plays to, the commentary pinned to what each item rests on, the first step not taken, and the
// limits patched by hand. Every number is read from `pipeline-example.json`, a rerun of the pipeline.

const { keys, lindenbaum, analysis, song } = example;
// Each cursor stop on page 1: start and end in ms, then its box in the engraving's own units.
const NOTES = example.notes.map(([t0, t1, x0, y0, x1, y1]) => ({ t0, t1, x0, y0, x1, y1 }));
// The page's first system is 0–12 s, the second 12–20 s (three and two bars of 4 s).
const FIRST = NOTES.filter((n) => n.t0 < 12000), TOP = NOTES.filter((n) => n.t0 < 20000);
// The engraving's staves, measured from its SVG: each system's voice, the piano's two, and the lyric line under the
// voice (its baseline), with the first barline. A staff is 720 units tall.
const SYS = [{ voice: 1040, rh: 3376, lh: 5176, lyric: 2264, from: 2051 }, { voice: 7649, rh: 9449, lh: 11249, lyric: 8942, from: 500 }];
const STAFF = 720;
// The top two systems as [x, y, w, h], and the first one alone.
const TWO = [250, 300, 20250, 12000], ONE = [250, 500, 20250, 5800];

// The score's clock: time in ms at the score's tempo, starting over at `end`; without motion it stays at `still`.
// `onTime` runs every frame for what moves smoothly; the stop the cursor is on is state only when it changes. The
// cursor is on the last stop that has begun, as in the app: a held note does not keep it.
const latest = (stops: typeof NOTES, t: number) => { let at = -1; stops.forEach((n, i) => { if (n.t0 <= t) at = i; }); return at; };
function useStop(stops: typeof NOTES, end: number, still: number, onTime?: (t: number) => void) {
  const find = (t: number) => latest(stops, t);
  const [at, setAt] = useState(() => find(still));
  const tick = useRef(onTime);
  useEffect(() => { tick.current = onTime; });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { tick.current?.(still); return; }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) % end, i = latest(stops, t);
      tick.current?.(t); setAt(i); frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [stops, end, still]);
  return at;
}

// A box drawn by hand round x0..x1, y0..y1.
function handBox(x0: number, y0: number, x1: number, y1: number, seed: number) {
  const r = rng(seed), j = () => (r() - 0.5) * (x1 - x0) * 0.004;
  return [handLine([x0, y0 + j()], [x1, y0 + j()], seed + 1), handLine([x1 + j(), y0], [x1 + j(), y1], seed + 2), handLine([x1, y1 + j()], [x0, y1 + j()], seed + 3), handLine([x0 + j(), y1], [x0 + j(), y0 - (y1 - y0) * 0.04], seed + 4)].join(" ");
}
// A brace over a row from x1 to x2, its point up at y - 22; and one beside a column from y1 to y2, its point right.
const braceUp = (x1: number, x2: number, y: number) => { const m = (x1 + x2) / 2; return `M${x1} ${y} Q${x1} ${y - 11} ${x1 + 18} ${y - 11} L${m - 14} ${y - 11} Q${m} ${y - 11} ${m} ${y - 22} Q${m} ${y - 11} ${m + 14} ${y - 11} L${x2 - 18} ${y - 11} Q${x2} ${y - 11} ${x2} ${y}`; };
const braceRight = (x: number, y1: number, y2: number) => { const m = (y1 + y2) / 2; return `M${x} ${y1} Q${x + 11} ${y1} ${x + 11} ${y1 + 18} L${x + 11} ${m - 14} Q${x + 11} ${m} ${x + 22} ${m} Q${x + 11} ${m} ${x + 11} ${m + 14} L${x + 11} ${y2 - 18} Q${x + 11} ${y2} ${x} ${y2}`; };
// A tab standing up from a page's top edge, rounded on top.
const tab = (x: number, y: number, w: number, h: number) => `M${x} ${y + h} V${y + 5} Q${x} ${y} ${x + 5} ${y} H${x + w - 5} Q${x + w} ${y} ${x + w} ${y + 5} V${y + h} Z`;

// The twelve keys of one song: tabbed pages stacked behind the one in front, the song's own key.
function KeyStack({ id, score, x, y, w, small, children }: { id: string; score: string; x: number; y: number; w: number; small?: boolean; children?: ReactNode }) {
  const h = w * TWO[3] / TWO[2], tw = w / keys.length, th = small ? 16 : 34, front = keys.findIndex((k) => k.enum === "BMinor");
  return <g>
    {[8, 4].map((d) => <rect key={d} className="pp-paper" x={x + d} y={y + d} width={w} height={h} filter={`url(#${id}-lift)`} />)}
    {keys.map((key, i) => i !== front && <g key={key.enum}>
      <path className="pp-keytab" d={tab(x + i * tw + (small ? 1 : 3), y - th + 2, tw - (small ? 2 : 6), th + 6)} />
      {!small && <text className="pp-tab is-back" x={x + i * tw + tw / 2} y={y - 11} textAnchor="middle">{key.key}</text>}
    </g>)}
    <path className="pp-paper" d={tab(x + front * tw + (small ? 1 : 3), y - th, tw - (small ? 2 : 6), th + 6)} />
    {!small && <text className="pp-tab" x={x + front * tw + tw / 2} y={y - 13} textAnchor="middle">{keys[front].key}</text>}
    <rect className="pp-paper" x={x} y={y} width={w} height={h} filter={`url(#${id}-shadow)`} />
    <Score score={score} x={x} y={y} w={w} h={h} view={TWO}>{children}</Score>
  </g>;
}
const Cursor = ({ n }: { n?: (typeof NOTES)[number] }) => n ? <rect className="pp-cursor" x={n.x0 - 70} y={n.y0 - 70} width={n.x1 - n.x0 + 140} height={n.y1 - n.y0 + 140} rx="60" /> : null;

/* ---------- 문제 · 해결 ---------- */

export function PaperKeys({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const at = useStop(TOP, 20000, 9000);
  const S = { x: 40, y: 150, w: 600 }, pages = new Set(keys.map((k) => k.pages)).size === 1 ? `각 ${keys[0].pages}쪽` : "";
  const tags: [string, string][] = [["악보", `${keys.length}개 조 · ${pages}`], ["반주 MIDI", "멜로디 · 반주 두 채널"], ["커서 좌표", `${keys[0].notes}곳 · 악보 템포대로`], ["곡 해설", `출처 ${analysis.sources} · 코칭 ${analysis.tasks.length}항목`]];
  const T = { x: 700, w: 262, h: 74 }, knot = [S.x + S.w - 14, S.y + 22];
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label={`드뷔시 「L’âme évaporée」 악보가 ${keys.length}개 조의 탭이 달린 묶음으로 쌓여 있고, 맨 앞 b단조 악보 위에서 커서가 악보 템포대로 움직인다. 묶음에 악보 · 반주 MIDI · 커서 좌표 · 곡 해설 꼬리표가 달려 있다.`}>
    <Defs id={id} />
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={braceUp(S.x + 6, S.x + S.w - 6, S.y - 44)} /></g>
    <text className="pp-hand" x={S.x + S.w / 2} y={S.y - 76} textAnchor="middle">같은 곡 · {keys.length}개 조</text>
    <KeyStack id={id} score={score} x={S.x} y={S.y} w={S.w}><Cursor n={TOP[at]} /></KeyStack>
    {tags.map(([name, value], i) => {
      const y = 132 + i * 100, turn = [-2.4, 1.6, -1.2, 2][i], hole = [T.x + 18, y + T.h / 2];
      return <g key={name}>
        <path className="pp-string" d={handLine(knot, hole, 90 + i, 0.06)} />
        <g transform={`translate(${T.x} ${y}) rotate(${turn} 18 ${T.h / 2})`}>
          <rect className="pp-tag" width={T.w} height={T.h} rx="6" filter={`url(#${id}-lift)`} />
          <circle className="pp-tag-hole" cx="18" cy={T.h / 2} r="5" />
          <text className="pp-name-l" x="36" y="31">{name}</text>
          <text className="pp-sub-l" x="36" y="55">{value}</text>
        </g>
      </g>;
    })}
    <circle className="pp-knot" cx={knot[0]} cy={knot[1]} r="4" />
  </svg>;
}

/* ---------- 한 시간축 ---------- */

// One song's page over time in each of its twelve keys, in pencil on graph paper: every line only climbs.
function PageCard({ id, x, y, w, h, name, songs }: { id: string; x: number; y: number; w: number; h: number; name: string; songs: typeof keys }) {
  const end = songs[0].end, pages = songs[0].pages, px = (t: number) => 40 + t / end * (w - 58), py = (p: number) => h - 26 - (p - 1) / (pages - 1) * (h - 70);
  return <g transform={`translate(${x} ${y})`}>
    <rect className="pp-paper" width={w} height={h} filter={`url(#${id}-lift)`} />
    {Array.from({ length: Math.floor(w / 12) }, (_, i) => <line key={`v${i}`} className="pp-grid" x1={6 + i * 12} x2={6 + i * 12} y1="34" y2={h - 6} />)}
    {Array.from({ length: Math.floor((h - 40) / 12) + 1 }, (_, i) => <line key={`h${i}`} className="pp-grid" x1="6" x2={w - 6} y1={34 + i * 12} y2={34 + i * 12} />)}
    <text className="pp-card-num" x="14" y="24">{name}</text>
    {Array.from({ length: pages }, (_, p) => <text key={p} className="pp-card" x="26" y={py(p + 1) + 4} textAnchor="end">{p + 1}</text>)}
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="1.7" opacity=".5">
      {songs.map((s) => <path key={s.enum} d={`M${s.pageStarts.flatMap((t, k) => [`${f1(px(t))} ${f1(py(k + 1))}`, `${f1(px(s.pageStarts[k + 1] ?? end))} ${f1(py(k + 1))}`]).join(" L")}`} />)}
    </g>
    <text className="pp-card" x={w - 14} y={h - 8} textAnchor="end">{Math.round(end / 1000)}초</text>
  </g>;
}

export function PaperTimeline({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const S = { x: 40, y: 58, w: 920 }, k = S.w / ONE[2], h = ONE[3] * k;
  const R = { x: 40, y: 380, w: 920, h: 46 }, tx = (t: number) => R.x + 22 + t / 12000 * (R.w - 44);
  const sc = (x: number, y: number) => [S.x + (x - ONE[0]) * k, S.y + (y - ONE[1]) * k];
  const play = useRef<SVGGElement>(null);
  const at = useStop(FIRST, 12000, 8200, (t) => play.current?.setAttribute("transform", `translate(${f1(tx(t))} 0)`));
  const on = FIRST[at];
  // Each note's line leaves the page's bottom edge under the note; the sounding one's runs from the note itself.
  const under = (n: (typeof NOTES)[number]) => [sc((n.x0 + n.x1) / 2, 0)[0], S.y + h + 4], foot = (n: (typeof NOTES)[number]) => sc((n.x0 + n.x1) / 2, n.y1 + 90);
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label="첫 줄의 음표마다 악보 위 자리에서 그 음표가 울리는 시각까지 연필 선이 이어지고, 재생 위치가 눈금을 따라가며 그 음표를 켠다. 아래 모눈종이에는 두 곡 24개 조의 쪽 번호가 시간을 따라 오르기만 하고, 역행 0 도장이 찍혀 있다.">
    <Defs id={id} />
    <text className="pp-sub" x={S.x} y={S.y - 16}>verovio · 음표가 놓인 자리</text>
    <rect className="pp-paper" x={S.x} y={S.y} width={S.w} height={h} filter={`url(#${id}-shadow)`} />
    <Score score={score} x={S.x} y={S.y} w={S.w} h={h} view={ONE}><Cursor n={on} /></Score>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="1.3">
      {FIRST.map((n, i) => <path key={i} d={handLine(under(n), [tx(n.t0), R.y - 2], 200 + i)} />)}
    </g>
    {FIRST.map((n, i) => <circle key={i} className="pp-knot" cx={under(n)[0]} cy={under(n)[1]} r="2.2" />)}
    {on && <line className="pp-join-on" x1={foot(on)[0]} y1={foot(on)[1]} x2={tx(on.t0)} y2={R.y - 2} />}
    <rect className="pp-ruler" x={R.x} y={R.y} width={R.w} height={R.h} rx="3" filter={`url(#${id}-lift)`} />
    {Array.from({ length: 12000 / 250 + 1 }, (_, i) => { const t = i * 250, long = t % 4000 === 0 ? 20 : t % 1000 === 0 ? 12 : 6; return <line key={i} className="pp-tick" x1={tx(t)} x2={tx(t)} y1={R.y} y2={R.y + long} />; })}
    {[0, 4, 8, 12].map((s) => <text key={s} className="pp-tick-num" x={tx(s * 1000)} y={R.y + 38} textAnchor="middle">{s}</text>)}
    <g ref={play} transform={`translate(${f1(tx(8200))} 0)`}>
      <line className="pp-playhead" x1="0" x2="0" y1={R.y - 10} y2={R.y + R.h + 6} />
      <path className="pp-playhead-head" d={`M-6 ${R.y - 16} L6 ${R.y - 16} L0 ${R.y - 7} Z`} />
    </g>
    <text className="pp-sub" x={R.x} y={R.y + R.h + 24}>music21 · 음표가 울리는 시각 (초)</text>
    <PageCard id={id} x={40} y={488} w={300} h={136} name={`「${song.title}」 · ${keys.length}개 조`} songs={keys} />
    <PageCard id={id} x={364} y={488} w={300} h={136} name={`「보리수」 · ${lindenbaum.length}개 조`} songs={lindenbaum} />
    <text className="pp-sub" x="826" y="508" textAnchor="middle">{keys.length + lindenbaum.length}개 조의 쪽 번호</text>
    <Stamp id={id} x={826} y={556} turn={-7} text="역행 0" w={124} />
    <text className="pp-hand" x="826" y="612" textAnchor="middle">조가 바뀌는 곡 · 고치기 전 13~29개</text>
  </svg>;
}

/* ---------- 곡 해설 ---------- */

export function PaperCommentary({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const S = { x: 40, y: 150, w: 560 }, k = S.w / TWO[2], h = TWO[3] * k;
  const sc = (x: number, y: number) => [S.x + (x - TWO[0]) * k, S.y + (y - TWO[1]) * k];
  // What each kind of evidence points at on the page: the notes of the piano, the whole form, the sung words.
  const piano = [SYS[0].from - 160, SYS[0].rh - 380, 20420, SYS[0].lh + STAFF + 260];
  const marks: Record<string, number[]> = { 악보: sc(piano[2], (piano[1] + piano[3]) / 2), 양식: [S.x + S.w + 34, S.y + h / 2], 가사: sc(20300, SYS[1].lyric + 190) };
  const order = ["악보", "양식", "가사"], tasks = order.map((basis) => analysis.tasks.find((task) => task.basis === basis)!).filter(Boolean);
  const N = { x: 642, w: 330, h: 78 };
  const stages: [string, string][] = [["1 · 사실 수집", `검색 출처 ${analysis.sources} · 근거 연결 ${analysis.supports}`], ["2 · 구조화", `가사 ${analysis.lyrics}줄 · 풀이 ${analysis.gloss} · 번역 ${analysis.translation}쌍`], ["3 · 코칭", "항목마다 근거 칸 · 규칙 검사"]];
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label={`곡 해설의 코칭 세 항목이 악보 위 근거에 붙어 있다: ${tasks.map((task) => `${task.task}(${task.basis})`).join(", ")}. 위에는 악보에서 추출해 함께 입력한 기준값, 아래에는 사실 수집 → 구조화 → 코칭 세 단계.`}>
    <Defs id={id} />
    <text className="pp-sub" x={S.x} y={S.y - 52}>악보에서 추출해 함께 입력한 기준값</text>
    <text className="pp-hand" x={S.x} y={S.y - 22}>{song.measures}마디 · b단조 · ♩={song.bpm} · D4–G♯5</text>
    <rect className="pp-paper" x={S.x} y={S.y} width={S.w} height={h} filter={`url(#${id}-shadow)`} />
    <Score score={score} x={S.x} y={S.y} w={S.w} h={h} view={TWO}>
      <g className="pp-pencil" filter={`url(#${id}-pd)`} strokeWidth="80">
        <path d={handBox(piano[0], piano[1], piano[2], piano[3], 300)} />
        <path d={handLine([14250, SYS[0].lyric + 200], [20350, SYS[0].lyric + 170], 310, 0.01)} />
        <path d={handLine([1650, SYS[1].lyric + 210], [20350, SYS[1].lyric + 180], 320, 0.006)} />
      </g>
    </Score>
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={braceRight(S.x + S.w + 12, S.y + 10, S.y + h - 10)} /></g>
    {tasks.map((task, i) => {
      const y = 146 + i * 122, from = [N.x - 4, y + N.h / 2], to = marks[task.basis];
      return <g key={task.task}>
        <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2" strokeDasharray="6 7"><path d={handLine(from, [to[0] + 6, to[1]], 330 + i, 0.05)} /></g>
        <g transform={`translate(${N.x} ${y}) rotate(${[-1.2, 0.8, -0.6][i]} ${N.w / 2} ${N.h / 2})`}>
          <rect className="pp-tape" width={N.w} height={N.h} />
          <text className="pp-sub-l" x="18" y="28">코칭 항목</text>
          <text className="pp-name-l" x="18" y="54">{task.task}</text>
          <Stamp id={id} x={N.w - 40} y={26} turn={-8 + i * 7} text={task.basis} w={62} />
        </g>
      </g>;
    })}
    {stages.map(([name, what], i) => <g key={name}>
      <g transform={`translate(${40 + i * 206} 528) rotate(${[-0.8, 0.6, -0.4][i]} 92 38)`}>
        <rect className="pp-paper" width="184" height="76" filter={`url(#${id}-lift)`} />
        <text className="pp-card-num" x="14" y="30">{name}</text>
        <text className="pp-card" x="14" y="54">{what}</text>
      </g>
      {i < 2 && <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2"><path d={handLine([228 + i * 206, 566], [244 + i * 206, 566], 340 + i)} /><path d={head([232 + i * 206, 566], [244 + i * 206, 566], 8)} /></g>}
    </g>)}
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2" strokeDasharray="6 7"><path d={handLine([640, 546], [N.x + 40, 146 + 2 * 122 + N.h + 8], 350, -0.1)} /></g>
  </svg>;
}

/* ---------- 회고 · 첫 단계 ---------- */

const XML = ["<score-partwise>", " <part id=\"P1\">", "  <measure number=\"1\">", "   <note>", "    <pitch>", "     <step>…</step>", "     <octave>…</octave>", "    </pitch>", "    <duration>…</duration>", "    <lyric>…</lyric>", "   </note>", "   …", "  </measure>", " </part>", "</score-partwise>"];

export function PaperFirstStep({ score }: { score: string }) {
  const id = useId().replace(/:/g, "");
  const P = { x: 46, y: 96, w: 232, h: 452 }, X = { x: 430, y: 104, w: 230, h: 420 };
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label="왼쪽은 휴대폰으로 찍은 종이 악보 사진이다. 사진에서 MusicXML로 가는 VLM 단계는 점선으로, 적용하지 않은 단계다. 실제 출발점은 가운데의 MusicXML이고, 이 파이프라인이 그것으로 오른쪽의 12개 조 악보를 조판한다.">
    <Defs id={id} />
    <radialGradient id={`${id}-vig`} cx="50%" cy="46%" r="70%"><stop offset="55%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".42" /></radialGradient>
    <clipPath id={`${id}-screen`}><rect x="12" y="12" width={P.w - 24} height={P.h - 24} rx="24" /></clipPath>
    {/* The paper score, photographed on a desk with a phone. */}
    <g transform={`translate(${P.x} ${P.y}) rotate(-5 ${P.w / 2} ${P.h / 2})`}>
      <rect className="pp-folder" width={P.w} height={P.h} rx="34" filter={`url(#${id}-shadow)`} />
      <g clipPath={`url(#${id}-screen)`}>
        <rect className="pp-desk" x="12" y="12" width={P.w - 24} height={P.h - 24} />
        <g transform="translate(34 62) rotate(5 82 116) skewX(-4)">
          <rect className="pp-photo" width="164" height="232" />
          <Score score={score} x={0} y={0} w={164} h={232} view={[0, 0, 21000, 29700]} />
        </g>
        <rect className="pp-photo-tint" x="12" y="12" width={P.w - 24} height={P.h - 24} />
        <rect x="12" y="12" width={P.w - 24} height={P.h - 24} fill={`url(#${id}-vig)`} />
        <circle className="pp-shutter" cx={P.w / 2} cy={P.h - 52} r="20" />
      </g>
    </g>
    <text className="pp-name" x="160" y="598" textAnchor="middle">종이 · PDF 악보</text>
    <text className="pp-sub" x="160" y="622" textAnchor="middle">찍은 사진</text>
    {/* The step not taken. */}
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4" strokeDasharray="8 9"><path d={handLine([300, 318], [412, 318], 400, -0.06)} /></g>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={head([396, 316], [412, 318], 12)} /></g>
    <text className="pp-hand" x="356" y="292" textAnchor="middle">VLM</text>
    <text className="pp-sub" x="356" y="350" textAnchor="middle">적용하지 않은 단계</text>
    {/* Where the pipeline really started. */}
    <g transform={`translate(${X.x} ${X.y}) rotate(1.4 ${X.w / 2} ${X.h / 2})`}>
      <rect className="pp-paper" width={X.w} height={X.h} filter={`url(#${id}-shadow)`} />
      <text className="pp-doc-small" x="18" y="34">song.musicxml</text>
      {XML.map((line, i) => <text key={i} className="pp-xml" x="18" y={70 + i * 22} xmlSpace="preserve">{line}</text>)}
    </g>
    <text className="pp-name" x={X.x + X.w / 2} y="598" textAnchor="middle">MusicXML</text>
    <text className="pp-sub" x={X.x + X.w / 2} y="622" textAnchor="middle">실제 출발점 · OpenScore CC0</text>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={handLine([676, 318], [734, 318], 410, 0.04)} /><path d={head([718, 318], [734, 318], 12)} /></g>
    <KeyStack id={id} score={score} x={748} y={262} w={224} small />
    <text className="pp-name" x="860" y="598" textAnchor="middle">이 파이프라인</text>
    <text className="pp-sub" x="860" y="622" textAnchor="middle">조판 · 소리 · 커서 · 해설</text>
  </svg>;
}

/* ---------- 회고 · 한계 ---------- */

// Engraving marks drawn on a swatch: five staff lines from (x0, y) to x1, `gap` apart.
const Staff = ({ x0, x1, y, gap = 12 }: { x0: number; x1: number; y: number; gap?: number }) => <g className="pp-staff">{[0, 1, 2, 3, 4].map((l) => <line key={l} x1={x0} x2={x1} y1={y + l * gap} y2={y + l * gap} />)}</g>;
// A filled note head on (x, y) with its stem up or down.
const Note = ({ x, y, up = true, small = 1 }: { x: number; y: number; up?: boolean; small?: number }) => <g className="pp-ink">
  <ellipse cx={x} cy={y} rx={6.6 * small} ry={4.8 * small} transform={`rotate(-20 ${x} ${y})`} />
  <line className="pp-ink-line" x1={up ? x + 6 * small : x - 6 * small} x2={up ? x + 6 * small : x - 6 * small} y1={y} y2={up ? y - 34 * small : y + 34 * small} />
</g>;
const Sharp = ({ x, y }: { x: number; y: number }) => <g className="pp-ink-line" strokeWidth="1.4">
  <line x1={x - 3} x2={x - 3} y1={y - 13} y2={y + 15} /><line x1={x + 3} x2={x + 3} y1={y - 15} y2={y + 13} />
  <line x1={x - 7} x2={x + 7} y1={y - 3} y2={y - 7} strokeWidth="3.2" /><line x1={x - 7} x2={x + 7} y1={y + 7} y2={y + 3} strokeWidth="3.2" />
</g>;

const LIMITS: { name: string; lines: string[]; draw: (id: string) => ReactNode }[] = [
  { name: "도돌이표", lines: ["반복 구조를 전개하지 못해", "해당 곡은 배포 전에 제외"], draw: (id) => <>
    <Staff x0={20} x1={214} y={52} />
    <Note x={56} y={82} /><Note x={96} y={70} /><Note x={136} y={76} />
    <g className="pp-ink"><circle cx="176" cy="70" r="3.2" /><circle cx="176" cy="82" r="3.2" /><rect x="190" y="52" width="6.5" height="48" /></g>
    <line className="pp-ink-line" x1="184" x2="184" y1="52" y2="100" strokeWidth="1.6" />
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2"><path d={handLine([194, 120], [44, 120], 501, 0.18)} /><path d={head([58, 128], [44, 120], 10)} /></g>
    <text className="pp-hand" x="118" y="148" textAnchor="middle">?</text>
    <Stamp id={id} x={232} y={38} turn={-12} text="제외" w={62} />
  </> },
  { name: "성부", lines: ["멜로디 + 반주 두 채널,", "첫 파트가 성악이라는 전제"], draw: () => <>
    <Staff x0={46} x1={204} y={30} gap={9} /><Staff x0={46} x1={204} y={98} gap={9} />
    <path className="pp-ink" d="M38 30 C26 40 34 66 24 80 C34 94 26 120 38 134 C31 118 38 96 28 80 C38 64 31 42 38 30 Z" />
    <Note x={80} y={44} small={0.8} /><Note x={124} y={40} small={0.8} /><Note x={168} y={48} small={0.8} />
    <Note x={76} y={120} up={false} small={0.8} /><Note x={110} y={112} up={false} small={0.8} /><Note x={144} y={116} up={false} small={0.8} /><Note x={178} y={108} up={false} small={0.8} />
    <text className="pp-hand-s" x="214" y="53">멜로디</text>
    <text className="pp-hand-s" x="214" y="121">반주</text>
  </> },
  { name: "조성", lines: ["자동 감지가 부정확해 사후 보정"], draw: (id) => <>
    <Staff x0={20} x1={258} y={52} />
    <line className="pp-ink-line" x1="20" x2="20" y1="52" y2="100" strokeWidth="1.6" />
    <Sharp x={44} y={52} /><Sharp x={62} y={70} />
    <Note x={130} y={82} /><Note x={170} y={76} /><Note x={210} y={64} />
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.2"><path d={handLoop(53, 66, 30, 36, 511)} /></g>
    <text className="pp-hand" x="96" y="38">?</text>
    <g className="pp-pencil" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d="M84 132 L92 142 L110 120" /></g>
    <text className="pp-hand-s" x="116" y="140">보정</text>
  </> },
  { name: "장식 기호", lines: ["트레몰로 · 꾸밈음 · 모르덴트 ·", "트릴 · 턴 · 페르마타별 개별 구현"], draw: () => <>
    <Staff x0={20} x1={258} y={72} />
    <Note x={50} y={102} /><Note x={100} y={96} /><Note x={150} y={90} /><Note x={200} y={96} /><Note x={238} y={102} />
    <text className="pp-orn" x="34" y="44">tr</text><path className="pp-ink-line" d="M52 40 q4 -6 8 0 t8 0 t8 0" strokeWidth="1.6" />
    <path className="pp-ink-line" d="M90 44 l6 -10 l6 10 l6 -10 l6 10 M102 30 v18" strokeWidth="1.8" />
    <path className="pp-ink-line" d="M136 40 c0 -10 12 -10 14 0 c2 10 14 10 14 0" strokeWidth="2.2" />
    <path className="pp-ink-line" d="M186 44 a14 14 0 0 1 28 0" strokeWidth="2.2" /><circle className="pp-ink" cx="200" cy="40" r="2.6" />
    <g className="pp-ink-line" strokeWidth="3.2"><line x1="240" x2="250" y1="84" y2="78" /><line x1="240" x2="250" y1="90" y2="84" /></g>
  </> },
];

export function PaperPatches() {
  const id = useId().replace(/:/g, "");
  const W = 280, H = 160, at = [[40, 44, -1.4], [350, 56, 1.2], [40, 336, 1], [350, 348, -1.2]];
  return <svg className="pp-scene" viewBox="0 0 1000 640" role="img" aria-label={`규칙으로 처리한 네 한계가 악보 기호 조각으로 테이프에 붙어 있다: ${LIMITS.map((l) => `${l.name}(${l.lines.join(" ")})`).join(", ")}. 오른쪽의 빈 점선 자리는 재설계 시 우선 검토할 공개 AI 도구다.`}>
    <Defs id={id} />
    {LIMITS.map((limit, i) => {
      const [x, y, turn] = at[i];
      return <g key={limit.name}>
        <g transform={`translate(${x} ${y}) rotate(${turn} ${W / 2} ${H / 2})`}>
          <rect className="pp-paper" width={W} height={H} filter={`url(#${id}-lift)`} />
          {limit.draw(id)}
          <rect className="pp-tape" x="-18" y="-6" width="76" height="24" transform="rotate(-32 20 6)" />
          <rect className="pp-tape" x={W - 56} y="-6" width="76" height="24" transform={`rotate(32 ${W - 20} 6)`} />
        </g>
        <text className="pp-name" x={x} y={y + H + 32}>{limit.name}</text>
        {limit.lines.map((line, j) => <text key={j} className="pp-sub" x={x} y={y + H + 54 + j * 20}>{line}</text>)}
      </g>;
    })}
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.4"><path d={braceRight(650, 50, 590)} /></g>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.2" strokeDasharray="7 8"><path d={handLine([712, 320], [680, 320], 520)} /></g>
    <g className="pp-pencil is-stage" filter={`url(#${id}-pv)`} strokeWidth="2.2"><path d={head([694, 320], [680, 320], 10)} /></g>
    <rect className="pp-slot" x="716" y="106" width="250" height="428" rx="4" />
    <text className="pp-name" x="841" y="310" textAnchor="middle">공개 AI 도구</text>
    <text className="pp-sub" x="841" y="336" textAnchor="middle">재설계 시 우선 검토할 대상</text>
  </svg>;
}
