"use client";

import { useEffect, useRef, useState } from "react";
import type { BodyWindow, Contracts } from "@/lib/content";

export function BlockContract({ contract }: { contract: Contracts["engine"] }) {
  const [selected, setSelected] = useState("body");
  const current = contract.stages.find(stage => stage.id === selected)!;
  return <figure className="contract-figure" id="io-contract"><figcaption><strong>한 블록이 지나가는 길</strong><span>단계를 눌러 입출력 계약 보기</span></figcaption>
    <div className="lane-heads" aria-hidden="true"><span>{contract.lanes.app}</span><span>경계</span><span>{contract.lanes.engine}</span></div>
    <div className="contract-path"><span className="loop-label" aria-hidden="true">되먹임</span><ol>
      {contract.stages.map((stage, i) => {
        const node = <button type="button" className="contract-node" aria-pressed={selected === stage.id} onClick={() => setSelected(stage.id)}>
          <span className="contract-step">{i + 1}</span><strong>{stage.name}</strong>
          <span className="contract-owner">{stage.owner === "app" ? "앱" : "엔진"}</span><span className="contract-rate">{stage.rate}</span>
        </button>;
        const [out, back] = stage.handoff?.direction === "both" ? stage.handoff.label.split(" → ") : [];
        return <li key={stage.id} className={`contract-row owner-${stage.owner}`}>
          <div>{stage.owner === "app" && node}</div>
          <div className="lane-boundary">{stage.handoff && (stage.handoff.direction === "both"
            ? <><span className="handoff">← {out}</span><span className="handoff">{back} →</span></>
            : <span className="handoff">{stage.handoff.direction === "to-app" ? `← ${stage.handoff.label}` : `${stage.handoff.label} →`}</span>)}</div>
          <div>{stage.owner === "engine" && node}</div>
        </li>;
      })}
    </ol></div>
    <div className="contract-detail" aria-live="polite"><strong>{current.name}</strong>
      <dl><div><dt>입력</dt><dd>{current.input}</dd></div><div><dt>출력</dt><dd>{current.output}</dd></div><div><dt>계약</dt><dd>{current.rule}</dd></div></dl>
    </div>
    <dl className="thread-rules">{contract.threadRules.map(item => <div key={item.subject}><dt>{item.subject}</dt><dd>{item.rule}</dd></div>)}</dl>
    <p className="figure-note">{contract.note}</p>
  </figure>;
}

type Mode = "steady" | "warmup";
type Role = "outside" | "context" | "output" | "lookahead" | "pad";
const ROLES: Role[] = ["pad", "outside", "lookahead", "context", "output"];
const CYCLE_MS = 1700;
const SHIFT_END = 0.5;
const ROWS = 24;
const STEADY_START = 301;
const LEVELS = 8;

function hash(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const melodyRow = (col: number) => 8 + Math.floor(hash(Math.floor(col / 7)) * 11);
const voiced = (col: number) => hash(Math.floor(col / 7) + 57) > 0.18;
const chordRoot = (col: number) => 1 + Math.floor(hash(Math.floor(col / 16) + 91) * 5);

// Illustrative content only: the mic channels carry the voice plus accompaniment leakage,
// the reference channels carry the accompaniment that the engine played back.
function sample(channel: number, row: number, col: number, mixChannels: number) {
  const root = chordRoot(col);
  const chord = row === root || row === root + 4 || row === root + 7;
  if (channel < mixChannels) {
    const decay = 0.8 ** channel;
    const voice = voiced(col) && row === melodyRow(col) ? 0.95 * decay : 0;
    return Math.max(voice, chord ? 0.22 * decay : 0, hash(col * 31.7 + row * 7.3 + channel * 13.1) * 0.1);
  }
  return Math.max(chord ? 0.8 * 0.8 ** (channel - mixChannels) : 0, hash(col * 17.3 + row * 3.1 + channel * 5.7) * 0.08);
}

function slotRole(slot: number, w: BodyWindow): Role {
  const first = Math.min(...w.outputSlots) - (w.receptiveField - 1 - w.lookahead);
  if (slot < first) return "outside";
  if (w.outputSlots.includes(slot)) return "output";
  return slot > Math.max(...w.outputSlots) ? "lookahead" : "context";
}

const frameAt = (newest: number, slot: number, w: BodyWindow) => newest - (w.columns - 1) + slot;
const emittedFrames = (newest: number, w: BodyWindow) => w.outputSlots.map(slot => frameAt(newest, slot, w)).filter(frame => frame >= w.receptiveField - 1 - w.lookahead);
const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

type Sim = { newest: number; p: number; blockStart: number; mode: Mode; playing: boolean; visible: boolean; baseYaw: number; pitch: number; sway: number; dragging: boolean; lastX: number; lastY: number };

function drawCube(ctx: CanvasRenderingContext2D, width: number, height: number, sim: Sim, w: BodyWindow, colors: Record<string, string>, font: string) {
  ctx.clearRect(0, 0, width, height);
  const perBlock = w.blockMs / w.hopMs;
  const shift = ease(clamp(sim.p / SHIFT_END));
  const pulse = sim.p > SHIFT_END ? Math.sin(Math.PI * (sim.p - SHIFT_END) / (1 - SHIFT_END)) : 0;
  const emitted = emittedFrames(sim.newest, w).length > 0;
  const yaw = sim.baseYaw + 0.14 * Math.sin(sim.sway);
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(sim.pitch), Math.sin(sim.pitch)];
  const scale = Math.min(width / 5.3, height / 3.1);
  // Keep room on the left for the axis labels on narrow screens.
  const ox = Math.max(width / 2 - scale * 0.3, scale * 1.5 + 62), oy = height / 2 + scale * 0.02;
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = 12 / (12 + z2);
    return [ox + x1 * scale * f, oy - y1 * scale * f, f];
  };
  const DX = 0.1, DY = 0.072;
  const xOf = (pos: number) => (pos - (w.columns - 1) / 2) * DX;
  const yOf = (row: number) => (row - (ROWS - 1) / 2) * DY;
  const zOf = (channel: number) => (channel - (w.channels - 1) / 2) * 0.075 + (channel < w.mixChannels ? -0.07 : 0.07);
  const [x0, x1] = [xOf(-0.5), xOf(w.columns - 0.5)], [y0, y1] = [yOf(-0.5), yOf(ROWS - 0.5)], [z0, z1] = [zOf(0) - 0.04, zOf(w.channels - 1) + 0.04];

  const line = (points: [number, number, number][], color: string, alpha: number, dash: number[] = []) => {
    ctx.beginPath();
    points.forEach(([x, y, z], i) => { const [px, py] = project(x, y, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.setLineDash(dash); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  };
  const box = (xa: number, xb: number, color: string, alpha: number) => {
    for (const [ya, yb] of [[y0, y0], [y1, y1]]) for (const [za, zb] of [[z0, z0], [z1, z1]]) line([[xa, ya, za], [xb, yb, zb]], color, alpha);
    for (const x of [xa, xb]) { line([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0]], color, alpha); }
  };
  box(x0, x1, colors.ink3, 0.45);

  const buckets = Object.fromEntries(ROLES.map(role => [role, Array.from({ length: LEVELS }, () => new Path2D())])) as Record<Role, Path2D[]>;
  for (let col = sim.newest - (w.columns - 1) - perBlock; col <= sim.newest; col++) {
    const pos = w.columns - 1 - (sim.newest - col) + perBlock * (1 - shift);
    const fade = pos < 0 ? pos + 1 : pos > w.columns - 1 ? w.columns - pos : 1;
    if (fade <= 0) continue;
    const role: Role = col < 0 ? "pad" : slotRole(clamp(Math.round(pos), 0, w.columns - 1), w);
    const x = xOf(pos);
    for (let channel = 0; channel < w.channels; channel++) {
      const z = zOf(channel);
      for (let row = 0; row < ROWS; row++) {
        const v = role === "pad" ? 0 : sample(channel, row, col, w.mixChannels);
        let alpha = role === "pad" ? 0.55 : role === "outside" ? 0.05 + 0.25 * v : role === "lookahead" ? 0.08 + 0.7 * v : role === "output" ? 0.18 + 0.82 * v : 0.1 + 0.9 * v;
        if (role === "output" && emitted) alpha = Math.min(1, alpha + 0.3 * pulse);
        alpha *= fade;
        const [px, py, f] = project(x, yOf(row), z);
        const size = role === "pad" ? 0.9 * f : (1.1 + 1.3 * v + (role === "output" && emitted ? 0.8 * pulse * v : 0)) * f;
        buckets[role][Math.min(LEVELS - 1, Math.floor(alpha * LEVELS))].rect(px - size / 2, py - size / 2, size, size);
      }
    }
  }
  // Monochrome: everything recedes to gray so only the output slots read in full ink.
  const roleColor: Record<Role, string> = { pad: colors.line, outside: colors.ink3, lookahead: colors.ink3, context: colors.ink3, output: colors.ink };
  for (const role of ROLES) buckets[role].forEach((path, level) => { ctx.globalAlpha = (level + 0.5) / LEVELS; ctx.fillStyle = roleColor[role]; ctx.fill(path); });

  const [sa, sb] = [Math.min(...w.outputSlots) - 0.5, Math.max(...w.outputSlots) + 0.5];
  box(xOf(sa), xOf(sb), colors.ink, 0.35 + (emitted ? 0.5 * pulse : 0));

  // Output logits: the latest emitted pair stays lit and is replaced once the shift completes.
  const fresh = sim.p > SHIFT_END, outFrames = fresh ? sim.newest : sim.newest - perBlock;
  const outAlpha = emittedFrames(outFrames, w).length ? (fresh ? 0.35 + 0.65 * clamp((sim.p - SHIFT_END) * 6) : 1) : 0;
  const outBuckets = Array.from({ length: LEVELS }, () => new Path2D()), ghost = new Path2D();
  w.outputSlots.forEach((slot, i) => {
    const frame = frameAt(outFrames, slot, w), x = x1 + 0.5 + i * DX * 1.4;
    for (let row = 0; row < ROWS; row++) {
      const [px, py, f] = project(x, yOf(row), 0);
      ghost.rect(px - 0.6 * f, py - 0.6 * f, 1.2 * f, 1.2 * f);
      const v = voiced(frame) && row === melodyRow(frame) ? 1 : 0.1 + hash(frame * 3.3 + row) * 0.12;
      const size = (1.4 + 1.8 * v) * f;
      outBuckets[Math.min(LEVELS - 1, Math.floor(v * outAlpha * LEVELS))].rect(px - size / 2, py - size / 2, size, size);
    }
  });
  ctx.globalAlpha = 0.5; ctx.fillStyle = colors.ink3; ctx.fill(ghost);
  outBuckets.forEach((path, level) => { if (!level) return; ctx.globalAlpha = (level + 0.5) / LEVELS; ctx.fillStyle = colors.ink; ctx.fill(path); });
  line([[xOf(sb), 0, 0], [x1 + 0.42, 0, 0]], colors.ink, 0.3 + 0.6 * outAlpha, [3, 3]);

  ctx.globalAlpha = 1; ctx.font = `11px ${font}`; ctx.textBaseline = "middle";
  const label = (text: string, [x, y, z]: [number, number, number], color: string, align: CanvasTextAlign = "center") => {
    const [px, py] = project(x, y, z); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, px, py);
  };
  label("← 과거", [x0, y0 - 0.14, z1], colors.ink2, "left");
  label(`시간 ${w.columns}칸 · ${w.hopMs} ms 간격`, [0, y0 - 0.14, z1], colors.ink2);
  label("최신 →", [x1, y0 - 0.14, z1], colors.ink2, "right");
  label(`피치 ${w.bins}빈`, [x0 - 0.08, 0, z1], colors.ink2, "right");
  label(`마이크 ${w.mixChannels}`, [x0 - 0.08, y1 + 0.1, (zOf(0) + zOf(w.mixChannels - 1)) / 2], colors.ink2, "right");
  label(`되먹임 ${w.referenceChannels}`, [x0 - 0.08, y1 + 0.1, (zOf(w.mixChannels) + zOf(w.channels - 1)) / 2], colors.ink2, "right");
  label(`로짓 ${w.bins} × ${w.outputSlots.length}`, [x1 + 0.57, y1 + 0.16, 0], colors.ink);
}

export function BodyWindowCube({ window: w }: { window: BodyWindow }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickRef = useRef<() => void>(() => {});
  const simRef = useRef<Sim>({ newest: STEADY_START, p: 0.75, blockStart: 0, mode: "steady", playing: true, visible: true, baseYaw: 0.42, pitch: 0.3, sway: 0, dragging: false, lastX: 0, lastY: 0 });
  const [mode, setMode] = useState<Mode>("steady");
  const [playing, setPlaying] = useState(true);
  const [newest, setNewest] = useState(STEADY_START);
  const perBlock = w.blockMs / w.hopMs;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
    const canvas = canvasRef.current!, ctx = canvas.getContext("2d")!, sim = simRef.current;
    let raf = 0, width = 0, height = 0, last = 0;
    const render = () => {
      const style = getComputedStyle(canvas), token = (name: string) => style.getPropertyValue(name).trim();
      drawCube(ctx, width, height, sim, w, { ink: token("--ink"), ink2: token("--ink-2"), ink3: token("--ink-3"), line: token("--line") }, style.fontFamily);
    };
    const tick = (now: number) => {
      raf = 0;
      if (sim.playing && sim.visible) {
        let p = (now - sim.blockStart) / CYCLE_MS;
        if (p >= 1) {
          sim.newest += perBlock;
          if (sim.mode === "warmup" && sim.newest > w.columns + 3) sim.newest = perBlock - 1;
          sim.blockStart = now; p = 0; setNewest(sim.newest);
        }
        sim.p = p;
        if (!sim.dragging && last) sim.sway += (now - last) / 2600;
        last = now;
      } else last = 0;
      render();
      if (sim.playing && sim.visible) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    kickRef.current = kick;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); kick();
    };
    const resizer = new ResizeObserver(resize); resizer.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      sim.visible = entry.isIntersecting;
      if (sim.visible) { sim.blockStart = performance.now() - sim.p * CYCLE_MS; kick(); }
    });
    visibility.observe(canvas);
    const theme = new MutationObserver(kick); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { cancelAnimationFrame(raf); resizer.disconnect(); visibility.disconnect(); theme.disconnect(); };
  }, [w, perBlock]);

  useEffect(() => {
    const sim = simRef.current;
    sim.playing = playing;
    if (playing) sim.blockStart = performance.now() - sim.p * CYCLE_MS;
    kickRef.current();
  }, [playing]);

  const chooseMode = (next: Mode) => {
    const sim = simRef.current;
    sim.mode = next; sim.newest = next === "warmup" ? perBlock - 1 : STEADY_START; sim.p = 0;
    sim.blockStart = performance.now();
    setMode(next); setNewest(sim.newest); kickRef.current();
  };
  const rotate = (dyaw: number, dpitch: number) => {
    const sim = simRef.current;
    sim.baseYaw = clamp(sim.baseYaw + dyaw, -0.9, 1.1); sim.pitch = clamp(sim.pitch + dpitch, -0.1, 0.95); kickRef.current();
  };

  const frames = emittedFrames(newest, w);
  const real = newest + 1, firstFrame = w.receptiveField - 1 - w.lookahead;
  const status = mode === "steady"
    ? `새 컬럼 ${perBlock}개가 들어오면 창이 ${perBlock}칸 밀립니다. 가속기 호출 1회로 ${w.outputSlots.join("·")}번 칸의 프레임 ${frames.length}개를 함께 꺼냅니다.`
    : frames.length === 0
      ? `실제 컬럼 ${real}개. 왼쪽 ${Math.max(0, w.columns - real)}칸은 0으로 채웁니다. 출력 칸의 수용 영역 ${w.receptiveField}칸이 차기 전이라 방출하지 않습니다.`
      : frames.includes(firstFrame)
        ? `실제 컬럼 ${real}개. 첫 방출은 프레임 ${firstFrame}부터입니다. 곡 시작 ${firstFrame}프레임(약 ${firstFrame * w.hopMs}ms)은 내보내지 않습니다.`
        : `실제 컬럼 ${real}개. 블록마다 프레임 ${frames.join("·")}을 방출합니다.`;
  const role = (slot: number): Role => frameAt(newest, slot, w) < 0 ? "pad" : slotRole(slot, w);
  const first = Math.min(...w.outputSlots) - firstFrame, lastOut = Math.max(...w.outputSlots);

  return <figure className="cube-figure"><figcaption><strong>신경망 본체가 받는 창</strong><span>{w.channels} × {w.bins} × {w.columns} · f32</span></figcaption>
    <div className="cube-controls">
      <div className="segmented" aria-label="보기 선택">{([["steady", "정상 동작"], ["warmup", "곡 시작 직후"]] as const).map(([id, text]) =>
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => chooseMode(id)}>{text}</button>)}</div>
      <button type="button" className="play-button" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "재생"}</button>
    </div>
    <canvas ref={canvasRef} className="cube-canvas" tabIndex={0} role="img"
      aria-label={`${w.channels}채널, ${w.bins}빈, ${w.columns}컬럼 입력 창을 점으로 그린 도식. 오른쪽에서 새 컬럼이 들어오고 ${w.outputSlots.join("·")}번 칸이 출력 프레임이 됩니다. 방향키로 회전합니다.`}
      onPointerDown={event => { const sim = simRef.current; sim.dragging = true; sim.lastX = event.clientX; sim.lastY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const sim = simRef.current; if (!sim.dragging) return; rotate((event.clientX - sim.lastX) * 0.006, event.pointerType === "mouse" ? (event.clientY - sim.lastY) * 0.006 : 0); sim.lastX = event.clientX; sim.lastY = event.clientY; }}
      onPointerUp={() => { simRef.current.dragging = false; }} onPointerCancel={() => { simRef.current.dragging = false; }}
      onKeyDown={event => {
        const step = ({ ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] } as Record<string, number[]>)[event.key];
        if (step) { event.preventDefault(); rotate(step[0], step[1]); }
      }} />
    <p className="cube-status">{status}</p>
    <div className="slot-ruler" style={{ gridTemplateColumns: `repeat(${w.columns},minmax(0,1fr))` }} aria-hidden="true">{Array.from({ length: w.columns }, (_, slot) => <span key={slot} className={`slot slot-${role(slot)}`} />)}</div>
    <ul className="slot-legend">
      <li><i className="slot slot-outside" />수용 영역 밖 0–{first - 1}</li>
      <li><i className="slot slot-context" />과거 문맥 {first}–{Math.min(...w.outputSlots) - 1}</li>
      <li><i className="slot slot-output" />출력 {w.outputSlots.join("·")}</li>
      <li><i className="slot slot-lookahead" />미리 보기 {lastOut + 1}–{w.columns - 1}</li>
      {mode === "warmup" && <li><i className="slot slot-pad" />0 채움</li>}
    </ul>
    <p className="figure-note">출력 칸 하나가 보는 범위는 {w.receptiveField}칸(과거 {firstFrame} + 자신 + 미리 보기 {w.lookahead})입니다. 창 모양이 고정이어야 가속기에서 돌아가므로 앞 {first}칸은 계산에 쓰이지 않아도 함께 넘깁니다. 점 밝기는 설명용 예시 값입니다. {w.bins}빈은 {ROWS}줄로 줄여 그렸고, 실제 한 블록(약 {w.blockMs}ms)을 느리게 재생합니다. 드래그하거나 방향키로 돌려 볼 수 있습니다.</p>
  </figure>;
}
