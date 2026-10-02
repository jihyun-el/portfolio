"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Network } from "@/lib/showcase";

type Point = { x: number; y: number };

const LAYER_NAMES = ["언어", "기술", "작업", "프로젝트"];
// The two languages are the roots, so the input layer is drawn as large as the output.
const RADII = [[13, 6, 10, 13], [11, 5, 9, 11]];

function layout(layers: string[][], width: number, height: number, vertical: boolean) {
  const points: Record<string, Point> = {};
  const widest = Math.max(...layers.map((ids) => ids.length));
  layers.forEach((ids, layer) => {
    const n = ids.length;
    if (!vertical) {
      const left = Math.min(110, width * 0.16), right = Math.min(150, width * 0.2), top = 30, span = height - top - 40;
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

// The stack as a list you press and a diagram that answers: choosing a language, technology,
// piece of work or project keeps it pressed and lights every chain that runs through it.
export function NeuralMap({ network }: { network: Network }) {
  const sectionRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLDivElement>(null), dotsRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const vertical = !!size && size.w < 560;
  const points = useMemo(() => size ? layout(network.layers, size.w, size.h, vertical) : {}, [network.layers, size, vertical]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const edges = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const chain of network.chains) for (let i = 1; i < chain.length; i++) seen.set(`${chain[i - 1]}>${chain[i]}`, { from: chain[i - 1], to: chain[i] });
    return [...seen.entries()].map(([key, edge]) => ({ key, ...edge }));
  }, [network.chains]);
  const lit = useMemo(() => {
    const nodes = new Set<string>(), links = new Set<string>();
    if (selected) for (const chain of network.chains) if (chain.includes(selected)) chain.forEach((id, i) => { nodes.add(id); if (i) links.add(`${chain[i - 1]}>${id}`); });
    return { nodes, links };
  }, [network.chains, selected]);

  // Languages with their technologies grouped as in stack.json, for the list on the left.
  const roots = useMemo(() => network.layers[0].map((lang) => {
    const techs = network.layers[1].filter((tech) => network.chains.some((chain) => chain[0] === lang && chain[1] === tech));
    const works = [...new Set(network.chains.filter((chain) => chain[0] === lang).map((chain) => chain[2]))].sort((a, b) => network.layers[2].indexOf(a) - network.layers[2].indexOf(b));
    const groups: { title: string; ids: string[] }[] = [];
    for (const id of techs) {
      const title = network.nodes[id].meta ?? "";
      const group = groups.find((item) => item.title === title) ?? groups[groups.push({ title, ids: [] }) - 1];
      group.ids.push(id);
    }
    return { id: lang, techs, works, groups };
  }), [network]);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let timer = 0;
    const resize = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { const rect = canvasRef.current!.getBoundingClientRect(); if (rect.width > 40 && rect.height > 40) setSize({ w: Math.round(rect.width), h: Math.round(rect.height) }); }, 60);
    });
    resize.observe(canvasRef.current!);
    const seen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    seen.observe(sectionRef.current!);
    return () => { resize.disconnect(); seen.disconnect(); clearTimeout(timer); };
  }, []);

  // Signal pulses travel along the chains that are lit, or along all of them when nothing is chosen.
  useEffect(() => {
    const group = dotsRef.current;
    if (reduce || !visible || !group) return;
    const chains = selected ? network.chains.filter((chain) => chain.includes(selected)) : network.chains;
    const dots = Array.from({ length: selected ? 8 : 12 }, () => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "2.6"); circle.setAttribute("class", "pulse"); group.appendChild(circle);
      return { circle, chain: chains[Math.floor(Math.random() * chains.length)], seg: 0, t: Math.random() };
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
  }, [visible, reduce, selected, network.chains]);

  const toggle = (id: string) => setSelected((current) => current === id ? null : id);
  const node = selected ? network.nodes[selected] : null;
  const related = (layer: number) => [...lit.nodes].filter((id) => id !== selected && network.nodes[id].layer === layer).sort((a, b) => network.layers[layer].indexOf(a) - network.layers[layer].indexOf(b));
  const press = (id: string, className: string, label: string) => <button type="button" key={id} className={`${className}${selected === id ? " on" : lit.nodes.has(id) ? " lit" : ""}`} aria-pressed={selected === id} onClick={() => toggle(id)}>{label}</button>;

  return <section className="net" id="skills" ref={sectionRef} aria-labelledby="skills-title">
    <div className="wrap stage">
      <div className="cap">
        <div><h2 id="skills-title">기술 스택</h2><p className="cap-sub">언어 → 기술 → 작업 → 프로젝트. 누르면 그 경로가 켜집니다.</p></div>
        <div className="langs">{roots.map((root) => <div className="lang" key={root.id}>
          <button type="button" className={`lang-b${selected === root.id ? " on" : ""}`} aria-pressed={selected === root.id} onClick={() => toggle(root.id)}>
            <b>{network.nodes[root.id].label}</b><span>기술 {root.techs.length} · {root.works.map((id) => network.nodes[id].short).join(" · ")}</span>
          </button>
          {root.groups.map((group) => <div className="lang-g" key={group.title}><p>{group.title}</p><div className="chips">{group.ids.map((id) => press(id, "chip", network.nodes[id].tag ? `${network.nodes[id].label} · ${network.nodes[id].tag}` : network.nodes[id].label))}</div></div>)}
        </div>)}</div>
        <div className="pick" aria-live="polite">{node ? <>
          <p className="pick-tag">{LAYER_NAMES[node.layer]}{node.meta && node.layer !== 0 ? ` · ${node.meta}` : ""}</p>
          <p className="pick-title">{node.label}</p>
          {node.text && <p className="pick-text">{node.text}</p>}
          {node.layer !== 2 && related(2).length > 0 && <div className="chips">{related(2).map((id) => press(id, "chip small", network.nodes[id].label))}</div>}
          <div className="pick-actions">
            {node.anchor && <a className="read" href={`#${node.anchor}`}>홈에서 이 작업 보기 ↑</a>}
            {node.href && <Link className="read" href={node.href}>{node.layer < 2 ? "쓰인 곳 자세히" : "자세히"} →</Link>}
          </div>
        </> : <p className="pick-empty">언어나 기술을 누르면 어디에 쓰였는지 여기와 그림에 함께 나옵니다.</p>}</div>
      </div>
      <div className="canvas" ref={canvasRef}>
        {size && <svg viewBox={`0 0 ${size.w} ${size.h}`} className={selected ? "has-sel" : undefined} onClick={() => setSelected(null)} role="group" aria-label="언어, 기술, 작업, 프로젝트로 이어지는 그림. 노드를 누르면 경로가 켜집니다.">
          <g>{edges.map((edge) => { const a = points[edge.from], b = points[edge.to]; return <line key={edge.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge-a${lit.links.has(edge.key) ? " on" : ""}`} />; })}</g>
          <g ref={dotsRef} />
          <g>{network.layers.flatMap((ids, layer) => ids.map((id) => {
            const p = points[id], r = RADII[vertical ? 1 : 0][layer], item = network.nodes[id];
            return <g key={id} className={`node${lit.nodes.has(id) ? " on" : ""}${id === selected ? " sel" : ""}`} tabIndex={0} role="button" aria-pressed={id === selected} aria-label={`${LAYER_NAMES[layer]} ${item.label}`}
              onClick={(event) => { event.stopPropagation(); toggle(id); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(id); } }}>
              <circle cx={p.x} cy={p.y} r={r + 12} className="hit" /><circle cx={p.x} cy={p.y} r={r + 6} className="ring" />
              <circle cx={p.x} cy={p.y} r={r} className="o" /><circle cx={p.x} cy={p.y} r={r - (layer === 3 ? 4 : 2.2)} className="f" />
            </g>;
          }))}</g>
          <g>{!vertical && network.layers.map((ids, layer) => <text key={layer} x={points[ids[0]].x} y={size.h - 10} textAnchor="middle" className="layer-cap">{LAYER_NAMES[layer]}</text>)}
            {network.layers.flatMap((ids, layer) => ids.map((id, i) => {
              const p = points[id], r = RADII[vertical ? 1 : 0][layer], item = network.nodes[id], on = lit.nodes.has(id);
              if (vertical && layer === 1 && !on) return null;
              const [x, y, anchor] = !vertical
                ? layer === 0 ? [p.x - r - 10, p.y + 4.5, "end"] : layer === 3 ? [p.x + r + 12, p.y + 5, "start"] : [p.x, p.y - r - 10, "middle"]
                : [p.x, layer === 3 ? p.y + r + 18 : i % 2 === 0 ? p.y - r - 8 : p.y + r + 15, "middle"];
              return <text key={id} x={x} y={y} textAnchor={anchor as "start" | "middle" | "end"} className={`lab${layer === 2 ? " pj" : ""}${layer === 0 || layer === 3 ? " out" : ""}${on ? " on" : ""}`}>{vertical || layer === 3 ? item.short : item.label}</text>;
            }))}</g>
        </svg>}
      </div>
    </div>
  </section>;
}
