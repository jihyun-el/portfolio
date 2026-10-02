"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Network } from "@/lib/showcase";
import { CompareBars, MetricGrid } from "@/components/showcase-parts";

export type MapStep = { code: string; title: string; text: string };
type Point = { x: number; y: number };

const LAYER_NAMES = ["L0 · 기술", "L1 · 역량", "L2 · 작업", "L3 · 프로젝트"];
const RADII = [[6, 8, 10, 13], [5, 7, 9, 11]];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const SHOW_CASE_EVENT = "portfolio:show-case";

function layout(layers: string[][], width: number, height: number, vertical: boolean) {
  const points: Record<string, Point> = {};
  const widest = Math.max(...layers.map((ids) => ids.length));
  layers.forEach((ids, layer) => {
    const n = ids.length;
    if (!vertical) {
      const left = Math.min(130, width * 0.18), right = Math.min(150, width * 0.2), top = 34, span = height - top - 40;
      const x = left + (width - left - right) * layer / (layers.length - 1), spread = span * (n - 1) / (widest - 1), y0 = top + (span - spread) / 2;
      ids.forEach((id, i) => { points[id] = { x, y: n === 1 ? top + span / 2 : y0 + spread * i / (n - 1) }; });
    } else {
      const top = 24, side = 18, span = width - side * 2, tall = height - top - 34;
      const y = top + tall * layer / (layers.length - 1), spread = span * (n - 1) / (widest - 1), x0 = side + (span - spread) / 2;
      ids.forEach((id, i) => { points[id] = { x: n === 1 ? width / 2 : x0 + spread * i / (n - 1), y }; });
    }
  });
  return points;
}

export function NeuralMap({ network, steps, edgeCount }: { network: Network; steps: MapStep[]; edgeCount: number }) {
  const sectionRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLDivElement>(null), dotsRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const vertical = !!size && size.w < 560;
  const points = useMemo(() => size ? layout(network.layers, size.w, size.h, vertical) : {}, [network.layers, size, vertical]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const edges = useMemo(() => {
    const seen = new Map<string, { from: string; to: string; layer: number }>();
    for (const chain of network.chains) for (let i = 1; i < chain.length; i++) seen.set(`${chain[i - 1]}>${chain[i]}`, { from: chain[i - 1], to: chain[i], layer: i });
    return [...seen.entries()].map(([key, edge]) => ({ key, ...edge }));
  }, [network.chains]);
  // A selection lights every chain that passes through it, so only real technology paths turn on.
  const lit = useMemo(() => {
    const nodes = new Set<string>(), links = new Set<string>();
    if (selected) for (const chain of network.chains) if (chain.includes(selected)) chain.forEach((id, i) => { nodes.add(id); if (i) links.add(`${chain[i - 1]}>${id}`); });
    return { nodes, links };
  }, [network.chains, selected]);

  const acts = [0, 1, 2, 3].map((layer) => reduce ? 1 : clamp((progress - layer) * 1.6, 0, 1));
  const step = Math.min(steps.length - 1, Math.floor(progress));
  const glowing = !reduce && visible && progress >= 3.6;

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let frame = 0, timer = 0;
    const measure = () => {
      const section = sectionRef.current!, rect = section.getBoundingClientRect();
      setProgress(clamp(-rect.top / Math.max(rect.height - window.innerHeight, 1), 0, 1) * steps.length);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); }); };
    const resize = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { const rect = canvasRef.current!.getBoundingClientRect(); if (rect.width > 40 && rect.height > 40) setSize({ w: Math.round(rect.width), h: Math.round(rect.height) }); measure(); }, 80);
    });
    resize.observe(canvasRef.current!);
    const seen = new IntersectionObserver(([entry]) => { setVisible(entry.isIntersecting); if (!entry.isIntersecting) setSelected(null); });
    seen.observe(sectionRef.current!);
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => { window.removeEventListener("scroll", onScroll); resize.disconnect(); seen.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [steps.length]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  // Signal pulses travel along technology chains once every layer is lit.
  useEffect(() => {
    const group = dotsRef.current;
    if (!glowing || !group) return;
    const chains = network.chains;
    const dots = Array.from({ length: 12 }, () => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "2.6"); circle.setAttribute("class", "pulse"); group.appendChild(circle);
      return { circle, chain: chains[Math.floor(Math.random() * chains.length)], seg: 0, t: Math.random() * 0.5 };
    });
    let last = performance.now(), frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const dot of dots) {
        dot.t += dt * 0.85;
        if (dot.t >= 1) { dot.t = 0; dot.seg++; if (dot.seg >= dot.chain.length - 1) { dot.chain = chains[Math.floor(Math.random() * chains.length)]; dot.seg = 0; } }
        const a = pointsRef.current[dot.chain[dot.seg]], b = pointsRef.current[dot.chain[dot.seg + 1]];
        if (a && b) { dot.circle.setAttribute("cx", String(a.x + (b.x - a.x) * dot.t)); dot.circle.setAttribute("cy", String(a.y + (b.y - a.y) * dot.t)); }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => { cancelAnimationFrame(frame); dots.forEach((dot) => dot.circle.remove()); };
  }, [glowing, network.chains]);

  const node = selected ? network.nodes[selected] : null;
  const related = (layer: number) => [...lit.nodes].filter((id) => id !== selected && network.nodes[id].layer === layer).sort((a, b) => network.layers[layer].indexOf(a) - network.layers[layer].indexOf(b));
  const chips = (title: string, layer: number) => {
    const ids = related(layer);
    return ids.length > 0 && <div><p className="sect-l">{title}</p><div className="chips">{ids.map((id) => <button type="button" className="chip" key={id} onClick={() => setSelected(id)}>{network.nodes[id].label}</button>)}</div></div>;
  };

  return <>
    <section className="net" id="skills" ref={sectionRef} aria-label="기술에서 프로젝트까지 이어지는 신경망">
      <div className="wrap stage">
        <div className="cap">
          <div><p className="eyebrow">Tech Map</p><h2><span className="thin">기술에서</span> <span className="black">프로젝트까지</span></h2></div>
          <p className="shape num">구조 <b>{network.layers.map((ids) => ids.length).join(" → ")}</b> · 연결 <b>{edgeCount}</b>개</p>
          <ol className="steps">
            <li className="bar" aria-hidden="true" style={{ height: `calc(${(progress / steps.length * 100).toFixed(1)}% - 8px)` }} />
            {steps.map((item, i) => <li className={`step${i === step ? " on" : ""}`} key={item.code}><div className="t"><i>{item.code}</i>{item.title}</div><p>{item.text}</p></li>)}
          </ol>
          <p className="capm" aria-live="polite">{steps[step].text}</p>
          <div className="hint-row"><p className="hint">노드를 눌러 상세 보기</p><a className="skip" href="#commits">건너뛰기 ↓</a></div>
        </div>
        <div className="canvas" ref={canvasRef}>
          {size && <svg viewBox={`0 0 ${size.w} ${size.h}`} className={selected ? "has-sel" : undefined} onClick={() => setSelected(null)} role="group" aria-label="기술, 역량, 작업, 프로젝트로 이어지는 신경망. 노드를 선택하면 상세가 열립니다.">
            <g>{edges.map((edge) => { const a = points[edge.from], b = points[edge.to]; return <line key={edge.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-b" />; })}</g>
            <g>{edges.map((edge) => { const a = points[edge.from], b = points[edge.to]; return <line key={edge.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} className={`edge-a${lit.links.has(edge.key) ? " on" : ""}`} style={{ strokeDashoffset: 1 - acts[edge.layer] }} />; })}</g>
            <g ref={dotsRef} />
            <g>{network.layers.flatMap((ids, layer) => ids.map((id) => {
              const p = points[id], r = RADII[vertical ? 1 : 0][layer], item = network.nodes[id];
              return <g key={id} className={`node${lit.nodes.has(id) ? " on" : ""}${id === selected ? " sel" : ""}`} tabIndex={0} role="button" aria-label={`${LAYER_NAMES[layer].split(" · ")[1]} ${item.label} 상세 보기`}
                onClick={(event) => { event.stopPropagation(); setSelected(id === selected ? null : id); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(id === selected ? null : id); } }}>
                <circle cx={p.x} cy={p.y} r={r + 12} className="hit" /><circle cx={p.x} cy={p.y} r={r + 6} className="ring" />
                <circle cx={p.x} cy={p.y} r={r} className="o" /><circle cx={p.x} cy={p.y} r={r - (layer === 3 ? 4 : 2.2)} className="f" style={{ opacity: acts[layer] }} />
              </g>;
            }))}</g>
            <g>{!vertical && network.layers.map((ids, layer) => <text key={layer} x={points[ids[0]].x} y={size.h - 10} textAnchor="middle" className="layer-cap">{LAYER_NAMES[layer]}</text>)}
              {network.layers.flatMap((ids, layer) => ids.map((id, i) => {
                const p = points[id], r = RADII[vertical ? 1 : 0][layer], item = network.nodes[id], on = lit.nodes.has(id);
                if (vertical && layer === 0 && !on) return null;
                const [x, y, anchor] = !vertical
                  ? layer === 0 ? [p.x - r - 10, p.y + 4.5, "end"] : layer === 3 ? [p.x + r + 12, p.y + 5, "start"] : [p.x, p.y - r - 10, "middle"]
                  : [p.x, layer === 3 ? p.y + r + 18 : i % 2 === 0 ? p.y - r - 8 : p.y + r + 15, "middle"];
                return <text key={id} x={x} y={y} textAnchor={anchor as "start" | "middle" | "end"} className={`lab${layer === 2 ? " pj" : ""}${layer === 3 ? " out" : ""}${on ? " on" : ""}`} style={{ opacity: 0.38 + 0.62 * acts[layer] }}>{vertical || layer === 3 ? item.short : item.label}</text>;
              }))}</g>
          </svg>}
        </div>
      </div>
    </section>
    {node && <aside className="panel" aria-live="polite" aria-label="노드 상세">
      <div className="p-head"><div>
        <p className="p-tag num">{LAYER_NAMES[node.layer]}{node.meta ? ` · ${node.meta}` : ""}</p>
        <h3 className="p-title">{node.label}</h3>{node.tag && <p className="p-sub">{node.tag}</p>}
      </div><button type="button" className="close" onClick={() => setSelected(null)}>닫기</button></div>
      {node.metrics && <MetricGrid items={node.metrics} />}
      {node.compare && <CompareBars compare={node.compare} />}
      {node.text && <p className="p-desc">{node.text}</p>}
      {node.layer === 0 && <>{chips("역량", 1)}{chips("적용한 작업", 2)}</>}
      {node.layer === 1 && <>{chips("묶은 기술", 0)}{chips("적용한 작업", 2)}</>}
      {node.layer === 2 && <>{chips("사용한 기술", 0)}{chips("프로젝트", 3)}</>}
      {node.layer === 3 && <>{chips("작업", 2)}{chips("사용한 기술", 0)}</>}
      <div className="p-actions">
        {node.caseIndex !== undefined && <button type="button" className="cta" onClick={() => { setSelected(null); window.dispatchEvent(new CustomEvent(SHOW_CASE_EVENT, { detail: node.caseIndex })); }}>케이스 보기 →</button>}
        {node.href && <Link className="cta ghost" href={node.href}>{node.layer === 0 ? "적용한 곳 읽기" : "설계와 검증 과정 읽기"} ↗</Link>}
      </div>
    </aside>}
  </>;
}
