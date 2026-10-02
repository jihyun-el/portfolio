"use client";

import { useEffect, useRef, useState } from "react";

export type MapItem = { id: string; label: string; level: 1 | 2 | 3 };

// A floating outline of the page: it names where the reader is and opens the page's hierarchy
// as a tree, so the order of projects, their parts and the supporting sections stays visible.
export function PageMap({ items, after }: { items: MapItem[]; after: string }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(items[0].id);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const first = document.getElementById(after);
    const seen = new IntersectionObserver(([entry]) => { setShown(!entry.isIntersecting); if (entry.isIntersecting) setOpen(false); });
    if (first) seen.observe(first);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let here = items[0].id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= line) here = item.id;
      }
      setCurrent(here);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => { seen.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [items, after]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };
  const index = items.findIndex((item) => item.id === current);
  // The pill names the section the reader is in, and the part when inside one.
  const parent = [...items.slice(0, index + 1)].reverse().find((item) => item.level === 1);
  const now = items[index].level === 1 || !parent ? items[index].label : `${parent.label} · ${items[index].label}`;

  return <nav ref={rootRef} className={`pmap${shown ? " on" : ""}`} aria-label="페이지 지도">
    {open && <div className="pmap-panel" id="pmap-panel">
      <p className="pmap-h">이 페이지</p>
      <ol>{items.map((item, i) => <li key={item.id} className={`pmap-l${item.level}${i === index ? " here" : i < index ? " past" : ""}`}>
        <a href={`#${item.id}`} aria-current={i === index ? "location" : undefined} onClick={(event) => { event.preventDefault(); go(item.id); }}>{item.label}</a>
      </li>)}</ol>
    </div>}
    <button type="button" className="pmap-fab" aria-expanded={open} aria-controls="pmap-panel" aria-label={`페이지 지도 열기. 지금 위치: ${now}`} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h6M7 10h10M7 16h7M5 4v12M5 10h2M5 16h2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      <span className="pmap-now">{now}</span>
    </button>
  </nav>;
}
