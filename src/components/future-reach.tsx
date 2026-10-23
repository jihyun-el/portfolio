"use client";

import { useEffect, useRef, useState } from "react";
import type { BodyWindow } from "@/lib/content";

// What a computation uses at the moment it runs, drawn the way the field draws it (WaveNet, TCN, The Illustrated
// GPT-2): the frames as a row of dots, the value computed as one dot above, and a fan from the value to the frames it
// uses. The same place twice: a recording above, where the frames after the value are there, so the referenced
// algorithm's fan spreads both ways; real time below, where the frames after the moment of computing are empty
// circles, so the engine's fan stops there and its value stands as many frames back as it refers ahead. In real time
// a frame comes in a step at a time and one value is computed for it.

// Illustrative content only: a sung line, note by note, with a rest now and then. A dot's size is its loudness.
const NOTE = 7;
function hash(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function loudness(frame: number) {
  const n = Math.floor(frame / NOTE), a = frame / NOTE - n;
  if (hash(n + 57) < 0.16) return 0.04;
  return Math.pow(Math.sin(Math.PI * Math.min(1, (a + 0.07) / 0.93)), 0.7) * (0.5 + 0.5 * hash(n + 3));
}

// Frames past the moment of computing left empty on the real-time row, how far the referenced reach spreads each side
// of the value, and how far back the engine's reach is drawn. The widths are for the picture; the frames ahead are
// the engine's.
const EMPTY = 5, HALF = 6, BACK = 6, STEP_MS = 700;

// A sample of a fan's line, as the legend shows it.
const Key = ({ kind }: { kind: "keep" | "drop" }) => <svg className="dv-fan-key" width="22" height="6" aria-hidden="true"><line className={`dv-fan-${kind}`} x1="0" y1="3" x2="22" y2="3" /></svg>;

export function FutureReach({ window: w }: { window: BodyWindow }) {
  const boxRef = useRef<HTMLDivElement>(null), visible = useRef(true);
  const [width, setWidth] = useState(680);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const box = boxRef.current!, resizer = new ResizeObserver(() => setWidth(box.clientWidth)), seen = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; });
    resizer.observe(box); seen.observe(box);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
    return () => { resizer.disconnect(); seen.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => { if (visible.current) setStep((value) => value + 1); }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const gap = width < 480 ? 22 : 26, pad = 12, count = Math.max(15, Math.floor((width - pad * 2) / gap) + 1);
  const now = count - 1 - EMPTY, value = now - w.lookahead, x = (slot: number) => pad + slot * gap, edge = x(now) + gap / 2;
  const OUT = 30, IN = 96, HEIGHT = 112, LIVE_HEIGHT = 140, wait = w.lookahead * w.hopMs;
  // The frames on screen and one each side, keyed by frame so a dot keeps its element as it moves left.
  const frames = Array.from({ length: count + 2 }, (_, i) => step - 1 + i);
  const at = (frame: number) => ({ transform: `translate(${x(frame - step)}px,0)` });

  const row = (live: boolean) => {
    const reach = live ? [value - BACK, now] : [value - HALF, value + HALF], used = Array.from({ length: reach[1] - reach[0] + 1 }, (_, i) => reach[0] + i);
    return <svg className="dv-fan-svg" width={width} height={live ? LIVE_HEIGHT : HEIGHT} aria-hidden="true">
      {/* What the value uses: a fan from its dot down to each frame. */}
      <polygon className="dv-fan-area" points={`${x(value)},${OUT} ${x(reach[0])},${IN} ${x(reach[1])},${IN}`} />
      {used.map((slot) => <line key={slot} className={live ? "dv-fan-keep" : "dv-fan-drop"} x1={x(value)} y1={OUT} x2={x(slot)} y2={IN} />)}
      {frames.map((frame) => {
        const slot = frame - step, arrived = !live || slot <= now, computed = !live || slot <= value;
        return <g key={frame} className="dv-fan-frame" style={at(frame)}>
          <circle cy={OUT} r={slot === value ? 5.5 : 3.2} data-on={computed ? "" : undefined} data-mark={slot === value ? "" : undefined} />
          <circle cy={IN} r={arrived ? 1.6 + 4 * loudness(frame) : 3.2} data-on={arrived ? "" : undefined} />
        </g>;
      })}
      {live && <>
        <line className="dv-fan-now" x1={edge} y1={14} x2={edge} y2={IN + 12} />
        <text className="dv-fan-label" x={edge} y={9} textAnchor="middle" data-strong="">계산하는 시점</text>
        <path className="dv-fan-bracket" d={`M${x(value)},${IN + 14} v5 H${edge} v-5`} />
        <text className="dv-fan-label" x={(x(value) + edge) / 2} y={IN + 34} textAnchor="middle">미래 참조 최대 {wait}ms</text>
      </>}
      {/* The same place as the moment of computing below, so the reach of the recording is seen crossing it. */}
      {!live && <line className="dv-fan-guide" x1={edge} y1={14} x2={edge} y2={IN + 12} />}
      {!live && <text className="dv-fan-label" x={x(value)} y={OUT - 13} textAnchor="middle">계산하는 값</text>}
    </svg>;
  };

  return <figure className="dv-reach">
    <figcaption>계산하는 시점에 아직 없는 신호</figcaption>
    <div className="dv-reach-controls"><p className="dv-reach-legend"><Key kind="keep" />구현이 쓰는 신호<Key kind="drop" />참조한 알고리즘이 쓰는 신호</p><button type="button" className="play-button" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "재생"}</button></div>
    <div className="dv-fan" ref={boxRef}>
      <p className="dv-fan-name"><b>녹음에서</b>참조한 알고리즘<span>뒤의 신호가 이미 있다</span></p>
      {row(false)}
      <p className="dv-fan-name"><b>실시간에서</b>구현<span>계산하는 시점 뒤의 신호는 아직 없다</span></p>
      {row(true)}
    </div>
    <p className="dv-reach-note">점 하나가 한 프레임(10ms)이고, 크기는 신호의 세기다. 실시간에서는 한 프레임이 들어올 때마다 값 하나를 계산한다. 쓰는 폭은 설명을 위한 예시다.</p>
    <p className="sr-only">녹음에서 참조한 알고리즘은 계산하는 값의 앞뒤 신호를 모두 쓴다. 실시간에서 구현은 계산하는 시점까지 들어온 신호만 쓰고, 미래를 참조하는 곳에서도 {w.lookahead}프레임이 더 들어올 때까지 최대 {wait}ms를 기다렸다가 값을 낸다.</p>
  </figure>;
}
