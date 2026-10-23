"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

// The VQA contest as one field of dots: a dot is one question of the Public half and a lit dot is one
// answered correctly. The field stays; each step lights the part it talks about and the text beside it
// says what was done there. Which question a dot stands for is not recorded, so a dot is a count only.
type Stage = { label: string; score: number };
type Checks = { chance: { label: string; gain: number; range: number }; confirmed: { label: string; public: number; private: number }[] };
// What a step shows: which stages' gains are lit strongly, how many dots are lit in all, and the tags over the field.
type Tag = { from: number; to: number; text: string };
type Step = { name: string; hot: [number, number]; lit: number; tags: Tag[]; say: ReactNode };

const signed = (value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value)}`;
const ko = (value: number) => value.toLocaleString("ko-KR");
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2);
const MOVE_MS = 900;

export function VqaSteps({ stages, questions, privateScore, checks }: { stages: Stage[]; questions: number; privateScore: number; checks: Checks }) {
  const [current, setCurrent] = useState(0);
  const root = useRef<HTMLElement>(null), press = useRef<number | null>(null), canvasRef = useRef<HTMLCanvasElement>(null), tagRefs = useRef<(HTMLElement | null)[]>([]);
  // Questions right after each stage; a stage's gain is the run of dots between two of these.
  const counts = stages.map((stage) => Math.round(stage.score * questions)), last = counts[counts.length - 1], hidden = Math.round(privateScore * questions);
  const gain = (k: number) => counts[k] - counts[k - 1], percent = (count: number) => Math.round(count / questions * 100);
  const row = (mark: string, who: string, text: ReactNode, got: string, cut = false) => <li key={mark + got} data-cut={cut ? "" : undefined}><i>{mark}</i><p><b>{who}</b>{text}</p><strong className="num">{got}</strong></li>;
  const steps: Step[] = [
    { name: "전체", hot: [1, counts.length - 1], lit: last,
      tags: [{ from: 0, to: counts[0], text: `제공 베이스라인 ${ko(counts[0])}` }, { from: counts[0], to: last, text: `우리 팀 ${signed(last - counts[0])}` }],
      say: <>
        <h3>사진 속 글자를 읽고 답을 고르는 문제 {ko(questions)}개</h3>
        <p className="vq-example"><span>표지판은 어디로 향하는 길을 안내하고 있나요?</span><span><i>a</i>역삼<i>b</i>선릉<i data-right="">c</i>사상<i>d</i>강남</span></p>
        <p className="vq-total"><span><b className="num">{percent(counts[0])}%</b>제공 베이스라인 · {ko(counts[0])}개</span><span><b className="num">{percent(last)}%</b>우리 팀 · {ko(last)}개</span></p>
      </> },
    { name: "팀 실험", hot: [1, 4], lit: last,
      tags: [1, 2, 3, 4].map((k) => ({ from: counts[k - 1], to: counts[k], text: String(k) })),
      say: <>
        <h3>같은 출발점에서, 팀원 넷이 가설을 하나씩 맡았다</h3>
        <ol className="vq-rows">
          {row("1", "나", "작은 모델을 한 번 학습해 모두의 출발점으로", signed(gain(1)))}
          {row("2", "팀원", <><em>가설</em>사람도 확대해서 푼다. 모델에도 선명한 사진을 넣는다</>, signed(gain(2)))}
          {row("3", "팀원", <><em>측정</em>크기별 정확도 추세를 재서 어디까지 키울지 정한다</>, signed(gain(3)))}
          {row("×", "팀원", <><em>가설</em>VLM은 OCR 전문이 아니다. 전문 모델의 결과를 같이 넣으면 오른다</>, "기각", true)}
          {row("4", "팀원", "모델 7개의 답을 모아 다수결", signed(gain(4)))}
        </ol>
      </> },
    { name: "마무리", hot: [5, 7], lit: last,
      tags: [{ from: counts[4], to: counts[7], text: `마지막 ${signed(counts[7] - counts[4])}` }],
      say: <>
        <h3>마지막 {counts[7] - counts[4]}문항을 좁힌 세 결정</h3>
        <ol className="vq-rows">
          {row("5", "나", "큰 모델 셋을 원래 정밀도로 다시 학습", signed(gain(5)))}
          {row("6", "나", "답이 흔들리는 298문항만 다시 채점", signed(gain(6)))}
          {row("7", "나", "전체 데이터로 재학습", signed(gain(7)))}
          {row("×", "버림", `${checks.chance.label}(${signed(checks.chance.gain)}, 우연으로 ±${checks.chance.range}까지 날 수 있음) · 사진 조각내기 · 한 번 더 학습`, "기각", true)}
        </ol>
      </> },
    { name: "숨겨진 절반", hot: [1, counts.length - 1], lit: hidden,
      tags: [{ from: counts[0], to: hidden, text: `Private ${ko(hidden)}` }],
      say: <>
        <h3>점수가 안 보이던 나머지 절반에서도 같았다</h3>
        <p className="vq-total"><span><b className="num">{ko(last)}</b>Public · 대회 중 점수가 보이는 절반</span><span><b className="num">{ko(hidden)}</b>Private · 끝난 뒤 공개된 절반</span></p>
        <p className="vq-note">{checks.confirmed[0].label}: Public {signed(checks.confirmed[0].public)} · Private {signed(checks.confirmed[0].private)}</p>
      </> },
  ];
  const total = steps.length, go = useCallback((by: number) => setCurrent((value) => (value + by + total) % total), [total]);

  // The field is drawn on a canvas. Dots fill column by column, so a stage's gain is a band of columns.
  const stepRef = useRef(steps); stepRef.current = steps;
  const target = useRef({ index: 0, since: 0, from: -1 });
  useEffect(() => { if (target.current.index !== current) target.current = { index: current, since: performance.now(), from: target.current.index }; }, [current]);
  useEffect(() => {
    const canvas = canvasRef.current!, context = canvas.getContext("2d")!, reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, ink = "0,0,0", size = "", drawn = -1, settled = false;
    const readInk = () => { const match = getComputedStyle(canvas).color.match(/[\d.]+/g); ink = match ? match.slice(0, 3).join(",") : "0,0,0"; settled = false; };
    readInk();
    const theme = new MutationObserver(readInk); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const bands = Array.from({ length: questions }, (_, i) => { let k = 0; while (k < counts.length && i >= counts[k]) k++; return k; });
    // How bright a dot is in a step: unlit, the baseline's, ours, or the part the step is about.
    const level = (step: Step, i: number) => (i >= step.lit ? 0.11 : bands[i] === 0 ? 0.26 : bands[i] >= counts.length ? 1 : bands[i] >= step.hot[0] && bands[i] <= step.hot[1] ? (bands[i] % 2 ? 1 : 0.72) : 0.44);
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The first time the field is on screen it lights up from the left.
      if (!size) target.current = { ...target.current, since: now, from: -1 };
      if (`${w}x${h}x${dpr}` !== size) { size = `${w}x${h}x${dpr}`; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); settled = false; }
      const { index, since, from } = target.current;
      if (since !== drawn) { drawn = since; settled = false; }
      const q = reduced ? 1 : clamp((now - since) / MOVE_MS);
      if (settled) return;
      const all = stepRef.current, step = all[index], before = from < 0 ? null : all[from];
      // The tags stand above the field, so the field keeps clear of the top.
      const top = Math.min(46, h * 0.2), rows = Math.max(8, Math.ceil(Math.sqrt(questions * (h - top) / w))), columns = Math.ceil(questions / rows), cell = Math.min(w / columns, (h - top) / rows);
      const left = (w - columns * cell) / 2, base = top + (h - top - rows * cell) / 2, radius = cell * 0.34;
      context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, w, h);
      for (let i = 0; i < questions; i++) {
        const column = Math.floor(i / rows), x = left + (column + 0.5) * cell, y = base + (i % rows + 0.5) * cell;
        // Each dot changes on its own column's turn, so a change crosses the field from the left.
        const wave = clamp(q * 1.6 - column / columns * 0.6), was = before ? level(before, i) : 0.11, next = level(step, i), alpha = was + (next - was) * ease(wave);
        if (alpha > 0.9) { context.fillStyle = `rgba(${ink},0.15)`; context.beginPath(); context.arc(x, y, radius * 1.9, 0, Math.PI * 2); context.fill(); }
        context.fillStyle = `rgba(${ink},${alpha.toFixed(3)})`; context.beginPath(); context.arc(x, y, alpha < 0.2 ? radius * 0.6 : radius, 0, Math.PI * 2); context.fill();
      }
      // A tag stands over the middle of its dots on a stem. Close neighbours take turns on two heights.
      step.tags.forEach((tag, k) => {
        const el = tagRefs.current[k];
        if (!el) return;
        const middle = (Math.floor(tag.from / rows) + Math.floor((tag.to - 1) / rows) + 1) / 2, x = clamp(left + middle * cell, 34, w - 34), lift = step.tags.length > 2 ? k % 2 : 0;
        const head = tag.to - tag.from < rows ? base + (tag.from % rows) * cell - 3 : base - 3;
        el.style.transform = `translate(calc(${x.toFixed(1)}px - 50%), 0)`; el.style.setProperty("--lift", `${lift * 20}px`); el.style.setProperty("--stem", `${Math.max(4, head - lift * 20 - 18).toFixed(0)}px`);
        el.style.opacity = ease(clamp(q * 2 - 0.8)).toFixed(2);
      });
      if (q >= 1) settled = true;
    };
    frame = requestAnimationFrame(draw);
    const resize = new ResizeObserver(() => { settled = false; }); resize.observe(canvas);
    return () => { cancelAnimationFrame(frame); theme.disconnect(); resize.disconnect(); };
    // The numbers come from the build and never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The arrow keys turn the steps while this figure is the one on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!root.current?.offsetParent || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (event.key === "ArrowRight") go(1); else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  // A sideways drag turns one step; a plain click on the field goes to the next.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { press.current = (event.target as HTMLElement).closest("button") ? null : event.clientX; };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (press.current === null) return;
    const moved = event.clientX - press.current, onField = Boolean((event.target as HTMLElement).closest(".vq-figure"));
    press.current = null;
    if (Math.abs(moved) > 40) go(moved < 0 ? 1 : -1); else if (Math.abs(moved) < 6 && onField) go(1);
  };
  const step = steps[current], pad = (i: number) => String(i + 1).padStart(2, "0");
  return <figure className="vq" ref={root} aria-label={`VQA 대회: Public 절반 ${ko(questions)}문항 중 제공 베이스라인 ${ko(counts[0])}문항, 최종 ${ko(last)}문항, Private ${ko(hidden)}문항`}><div className="vq-body">
    <div className="vq-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { press.current = null; }}>
      <button type="button" className="vq-side is-prev" aria-label="이전" onClick={() => go(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div className="vq-figure">
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="vq-tags" aria-hidden="true">{step.tags.map((tag, k) => <span key={current + tag.text} data-chip={tag.text.length === 1 ? "" : undefined} ref={(el) => { tagRefs.current[k] = el; }}>{tag.text}</span>)}</div>
        <p className="vq-unit">점 하나 = 문항 하나 · 켜진 점 = 맞힌 문항</p>
      </div>
      <div className="vq-say" aria-live="polite" key={current}>
        <p className="vq-count num"><b>{pad(current)}</b> / {pad(total - 1)}</p>
        {step.say}
      </div>
      <button type="button" className="vq-side is-next" aria-label="다음" onClick={() => go(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
    <ol className="vq-nav">{steps.map((item, i) => <li key={item.name}><button type="button" aria-current={i === current ? "step" : undefined} onClick={() => setCurrent(i)}><span className="num">{pad(i)}</span>{item.name}</button></li>)}</ol>
  </div></figure>;
}
