"use client";

import Link from "next/link";
import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { setSceneStep } from "@/lib/scene-step";

// The frame the home figures share once a screen is told one step at a time: on the left what the step is, whose it
// is, its one line, its verdict and its reasons (open at first, folded on demand); on the right its picture; the
// arrow keys and a sideways drag to turn, and one named tab per step underneath. The round turning buttons never lie
// on the picture: a wide frame keeps them in margins of their own at its sides, a stacked or phone frame at the two
// ends of the tab row.

export const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
// A box on a picture: left, top, right and bottom as fractions of its width and height.
export type Box = [number, number, number, number];

// `--r` (width over height) lets the stylesheet cap the photo's width and keep its shape.
export function Photo({ src, size, alt, marks = [], className }: { src: string; size: number[]; alt: string; marks?: { box: Box; key?: boolean }[]; className?: string }) {
  return <div className={className ? `vp-photo ${className}` : "vp-photo"} style={{ aspectRatio: `${size[0]} / ${size[1]}`, "--r": size[0] / size[1] } as CSSProperties}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} />
    {marks.map(({ box: [left, top, right, bottom], key }, k) => <i key={k} aria-hidden="true" data-key={key ? "" : undefined} style={{ left: pct(left), top: pct(top), width: pct(right - left), height: pct(bottom - top) }} />)}
  </div>;
}

// The one way from a step of a home figure into its own text: that screen's detail, opened on the step's card. It
// is the same link in the same place on every screen, at the end of the row that names the step. `scene` is the
// detail and `step` the step as the detail numbers it.
export function StepGo({ project, scene, step }: { project: string; scene: string; step: string }) {
  return <Link className="step-go" href={`/projects/${project}/#${scene}-${step}`}>자세히 보기<i aria-hidden="true">→</i></Link>;
}
// The step a frame is showing, for the link its text carries; and its own facts where its screen keeps them.
const Shown = createContext<{ project: string; scene: string; step: string } | null>(null);
const Facts = createContext<{ author?: string; act?: string; by?: string; mark?: string; verdict?: ReactNode; cut?: boolean }>({});

// A step's heading is a line of short phrases joined by " · ", ": ", ", " and " → ". Set large (`heading`), each arrow starts a
// line of its own and each phrase is kept whole where it fits, so a line breaks only between phrases, never inside one;
// set as one row of a list (`phrase`), it stays one line. Either way a dot stays at the end of the phrase before it.
export const phrase = (line: string) => line.replace(/ ([·→]) /g, " $1 ");
const WHOLE: CSSProperties = { display: "inline-block" };
export const heading = (line: string): ReactNode => line.split(" → ").map((part, i) => <Fragment key={i}>
  {i > 0 && <br />}
  {part.split(/( · |: |, )/).map((bit, k, all) => {
    if (k % 2) return null;
    // The mark that ended this phrase (a dot, a colon or a comma) stays on it; the next phrase starts after a space.
    const end = all[k + 1] === ": " ? ":" : all[k + 1] === ", " ? "," : all[k + 1] ? " ·" : "";
    // The arrow that starts a line rides on its first phrase, so it never stands on a line alone.
    return <Fragment key={k}><span style={WHOLE}>{i > 0 && k === 0 && "→ "}{bit}{end}</span>{end && " "}</Fragment>;
  })}
</Fragment>);

// The verdict is a stamp beside the step's words, never louder than them; `mark` is the word stamped with it (채택).
// A reason is one short line, led by its word in bold ([word, line]) so the list can be skimmed by those words.
export type Reason = string | [string, string];
export function Say({ kind, name, by, line, verdict, cut, more }: { kind: string; name: string; by?: string; line: string; verdict?: ReactNode; cut?: boolean; more: Reason[] }) {
  const [open, setOpen] = useState(true), shown = useContext(Shown), facts = useContext(Facts);
  const ran = by ?? facts.by, who = facts.author && ran ? `${facts.author} ${facts.act ?? "수립"} · ${ran}` : ran, said = verdict ?? facts.verdict, struck = cut ?? facts.cut;
  return <div className="vp-say">
    <p className="vp-count"><b>{kind}</b><span>{name}</span>{who && <em>{who}</em>}{shown && <StepGo {...shown} />}</p>
    <h4>{heading(line)}</h4>
    {said !== undefined && <p className="vp-result" data-cut={struck ? "" : undefined}><b className="num">{facts.mark && <i>{facts.mark}</i>}{said}</b></p>}
    <button type="button" className="vp-why" aria-expanded={open} onClick={() => setOpen(!open)}>근거</button>
    {open && <ul className="vp-more">{more.map((item) => typeof item === "string" ? <li key={item}>{item}</li> : <li key={item[0]}><b>{item[0]}</b>{item[1]}</li>)}</ul>}
  </div>;
}

// A screen may keep each step's facts with the step: who set it (author, and what they did: act, 수립 unless said) and who ran it, its
// verdict and the word stamped with it, and whether it was rejected. They stand on the step's words and again on its tab, so the tab
// row reads as the ledger of the run. `group` names the chapter a step opens; it stands over that step's tab.
export type StepPart<P> = { name: string; Part: (props: P & { open: (part: number) => void }) => ReactNode; author?: string; act?: string; by?: string; mark?: string; verdict?: (props: P) => ReactNode; cut?: boolean; group?: string };

// `scene` names the screen, so a detail that opens over it knows which step was showing; with `project`, the address
// of that detail, every step carries the link into its text.
export function StepParts<P extends object>({ parts, props, label, scene, project }: { parts: StepPart<P>[]; props: P; label: string; scene?: string; project?: string }) {
  const [current, setCurrent] = useState(0);
  const root = useRef<HTMLDivElement>(null), nav = useRef<HTMLOListElement>(null), press = useRef<number | null>(null), turned = useRef(false);
  const count = parts.length;
  const go = useCallback((step: number) => setCurrent((i) => (i + step + count) % count), [count]);
  useEffect(() => { if (scene) setSceneStep(scene, String(current).padStart(2, "0")); }, [scene, current]);

  // On a phone the tab row scrolls sideways; after a turn it brings the open tab into view, sideways only, so the
  // page itself never moves. The first render leaves it where it is.
  useEffect(() => {
    if (!turned.current) { turned.current = true; return; }
    const row = nav.current, tab = row?.querySelector<HTMLElement>("[aria-current]");
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [current]);

  // The arrow keys turn the steps while this figure is the one on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!root.current?.offsetParent || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (event.key === "ArrowRight") go(1); else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  // A sideways drag turns one step.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { press.current = (event.target as HTMLElement).closest("button,a") ? null : event.clientX; };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (press.current === null) return;
    const moved = event.clientX - press.current;
    press.current = null;
    if (Math.abs(moved) > 40) go(moved < 0 ? 1 : -1);
  };

  const { Part } = parts[current], pad = (i: number) => String(i).padStart(2, "0"), ledger = parts.some((item) => item.by || item.verdict);
  const facts = (item: StepPart<P>) => ({ author: item.author, act: item.act, by: item.by, mark: item.mark, verdict: item.verdict?.(props), cut: item.cut });
  // The same pair of buttons in both places; the stylesheet shows one pair for the frame's shape.
  const turn = (where: string) => [
    <button key="prev" type="button" className={`${where} is-prev`} aria-label="이전" onClick={() => go(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>,
    <button key="next" type="button" className={`${where} is-next`} aria-label="다음" onClick={() => go(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>,
  ];
  const [prevSide, nextSide] = turn("vp-arrow"), [prevFoot, nextFoot] = turn("vp-step");
  // How many tabs a chapter covers: from its first step to the next chapter's.
  const span = (i: number) => { let n = 1; while (i + n < count && !parts[i + n].group) n++; return n; };
  return <div className="vp" ref={root} role="group" aria-label={label}>
    <div className="vp-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { press.current = null; }}>
      {prevSide}
      <Shown.Provider value={scene && project ? { project, scene, step: pad(current) } : null}><Facts.Provider value={facts(parts[current])}><Part key={current} {...props} open={setCurrent} /></Facts.Provider></Shown.Provider>
      {nextSide}
    </div>
    <div className="vp-foot">
      {prevFoot}
      <ol className="vp-nav" ref={nav} data-ledger={ledger ? "" : undefined} data-groups={parts.some((item) => item.group) ? "" : undefined}>{parts.map((item, i) => { const fact = facts(item); return <li key={item.name}>{item.group && <span className="vp-tab-group" aria-hidden="true" style={{ "--span": span(i) } as CSSProperties}>{item.group}</span>}<button type="button" aria-current={i === current ? "step" : undefined} onClick={() => setCurrent(i)}>
        <span className="num">{pad(i)}</span><span className="vp-tab-name">{item.name}</span>
        {ledger && <span className="vp-tab-row">
          {fact.by ? <span className="vp-tab-by" data-lead={fact.by.startsWith("팀장") ? "" : undefined}>{fact.by}</span> : <span />}
          {fact.verdict !== undefined && <b className="vp-tab-verdict num" data-cut={fact.cut ? "" : undefined}>{fact.mark && <i>{fact.mark}</i>}{fact.verdict}</b>}
        </span>}
      </button></li>; })}</ol>
      {nextFoot}
    </div>
  </div>;
}
