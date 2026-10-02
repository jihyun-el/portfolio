"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CaseView } from "@/lib/showcase";
import { MetricGrid, countWord } from "@/components/showcase-parts";
import { SHOW_CASE_EVENT } from "@/components/neural-map";

const pad = (value: number) => String(value).padStart(2, "0");

export function CaseSlides({ cases }: { cases: CaseView[] }) {
  const sectionRef = useRef<HTMLElement>(null), trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const smooth = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const go = (i: number) => { const track = trackRef.current!; track.scrollTo({ left: Math.max(0, Math.min(cases.length - 1, i)) * track.clientWidth, behavior: smooth() }); };

  useEffect(() => {
    const show = (event: Event) => {
      const i = (event as CustomEvent<number>).detail;
      sectionRef.current!.scrollIntoView({ behavior: smooth() });
      window.setTimeout(() => go(i), smooth() === "smooth" ? 500 : 0);
    };
    const keep = () => { const track = trackRef.current!; track.scrollLeft = index * track.clientWidth; };
    window.addEventListener(SHOW_CASE_EVENT, show);
    window.addEventListener("resize", keep);
    return () => { window.removeEventListener(SHOW_CASE_EVENT, show); window.removeEventListener("resize", keep); };
  });

  return <section className="cases" id="projects" ref={sectionRef}>
    <div className="wrap">
      <div className="cases-h">
        <div><p className="eyebrow">Projects</p><h2><span className="thin">만들고 검증한</span> <span className="black">{countWord(cases.length)} 개의 작업</span></h2></div>
        <div className="ctrl">
          <button type="button" aria-label="이전 케이스" disabled={index === 0} onClick={() => go(index - 1)}>←</button>
          <p className="counter num">{pad(index + 1)} <span>/ {pad(cases.length)}</span></p>
          <button type="button" aria-label="다음 케이스" disabled={index === cases.length - 1} onClick={() => go(index + 1)}>→</button>
        </div>
      </div>
      <div className="track" ref={trackRef} tabIndex={0} aria-label="케이스 슬라이드. 좌우 방향키로 이동"
        onScroll={(event) => { const track = event.currentTarget; setIndex(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))); }}
        onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); } if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); } }}>
        {cases.map((item, i) => <article className="slide" id={`case-${item.id}`} key={item.id} aria-label={`케이스 ${i + 1}: ${item.title}`}>
          <div>
            <p className="tag num">CASE {pad(i + 1)} · {item.tag}</p>
            <h3>{item.title}</h3><p className="sub">{item.sub}</p>
            <MetricGrid items={item.metrics} />
            <p className="stack"><b>Stack</b> {item.techs.join(" · ")}</p>
            <div className="read-row"><Link className="read" href={item.href}>설계와 검증 과정 읽기 ↗</Link>{item.more && <Link className="read" href={item.more.href}>{item.more.label} ↗</Link>}</div>
          </div>
          <div className="case-r">
            <dl><div><dt>문제</dt><dd>{item.problem}</dd></div><div><dt>접근</dt><dd>{item.approach}</dd></div></dl>
            <div className="log"><div className="log-h"><span>검증 범위</span><span>{item.short}</span></div><p>{item.scope.claim}</p><div className="res">범위 → {item.scope.limit}</div></div>
          </div>
        </article>)}
      </div>
      <div className="segs">{cases.map((item, i) => <button type="button" key={item.id} className={i === index ? "on" : undefined} aria-label={`케이스 ${i + 1}로 이동`} onClick={() => go(i)} />)}</div>
    </div>
  </section>;
}
