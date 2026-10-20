"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type Step = { group: string; label: string; mark?: string; lead?: ReactNode; figure?: ReactNode; body?: ReactNode; anchors: string[] };

const pad = (value: number) => String(value).padStart(2, "0");

// A unit's record, one step at a time. The index stays in view; the chosen step leads with
// its one-line summary and figure, and the full text follows under them.
export function StepBrowser({ steps }: { steps: Step[] }) {
  const [at, setAt] = useState(0);
  const view = useRef<HTMLDivElement>(null), index = useRef<HTMLOListElement>(null);

  // A link to one part of the record (/projects/<id>/#training) selects that step.
  useEffect(() => {
    const onAnchor = (event: Event) => {
      const found = steps.findIndex((step) => step.anchors.includes((event as CustomEvent<string>).detail));
      if (found >= 0) setAt(found);
    };
    window.addEventListener("portfolio:anchor", onAnchor);
    return () => window.removeEventListener("portfolio:anchor", onAnchor);
  }, [steps]);

  useEffect(() => {
    if (view.current) view.current.scrollTop = 0;
    index.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at]);

  const go = (next: number) => setAt(Math.max(0, Math.min(steps.length - 1, next)));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); go(at + 1); }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); go(at - 1); }
  };
  const step = steps[at];
  return <div className="steps">
    <ol className="step-index" ref={index} onKeyDown={onKey}>
      {steps.map((item, i) => <li key={item.label} data-group={i === 0 || steps[i - 1].group !== item.group ? item.group : undefined}>
        <button type="button" aria-current={i === at ? "step" : undefined} onClick={() => setAt(i)}>
          <span className="num">{pad(i + 1)}</span><b>{item.label}</b>{item.mark && <em className="num">{item.mark}</em>}
        </button>
      </li>)}
    </ol>
    <div className="step-view" ref={view}>
      {steps.map((item, i) => <section key={item.label} hidden={i !== at} data-anchor={item.anchors[0]}>
        <p className="step-kicker num">{pad(i + 1)} / {pad(steps.length)}<span>{item.group}</span></p>
        <h3>{item.label}</h3>
        {item.lead && <p className="step-lead">{item.lead}</p>}
        {item.figure && <div className="step-figure">{item.figure}</div>}
        {item.body && <div className="step-body">{item.body}</div>}
      </section>)}
      <nav className="step-nav" aria-label="단계 이동">
        {at > 0 ? <button type="button" onClick={() => go(at - 1)}>← {steps[at - 1].label}</button> : <span />}
        {at < steps.length - 1 ? <button type="button" onClick={() => go(at + 1)}>{steps[at + 1].label} →</button> : <span />}
      </nav>
    </div>
    <p className="sr-only" aria-live="polite">{step.label}</p>
  </div>;
}
