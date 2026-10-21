"use client";

import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as Press, type ReactNode } from "react";
import { getSceneStep } from "@/lib/scene-step";
import { DetailSymbol, type SymbolAssets, type SymbolKind } from "@/components/detail-symbols";
import { DrawerBack } from "@/components/drawer";

// A project detail as it is read: beside the text, the picture of the screen it opened over, with the step the reader
// came from marked and the step being read lit; then its parts, each a panel of its own: the scope, what was done,
// how it was verified, the process by date, what it taught, further reading. The text is all there from the start;
// this part only arranges it and keeps the reader's place.
// Where the detail groups its cards into units of work, the units are what was done, each read without opening it: its
// title, its number before and after with what was measured under it, and the way it went in five lines. Opened, it
// shows its cards. A card is written out once, inside its unit; the process by date names it in one line that opens it
// there. Beside the text, the units are the contents, between the scope and the parts after them.
// `first` is the card a step leads to (inside its unit, where there are units), `entry` the card it leads to by date,
// `section` a part of the text a step leads to instead of a card.
export type DetailStep = { step: string; name: string; first: string | null; entry: string | null; section: string | null };
export type DetailCardMeta = { id: string; related: string[] };
// A unit as it is always seen (what was done, one number before and after where one is on record with what was
// measured, the verdict where it tested a hypothesis, and `arc`, the way it went), and opened (`body`: its picture),
// then its cards, then what it taught (`notes`, whose IDs are `held`).
export type DetailUnitView = {
  id: string; label: string | null; principle: boolean; verdict: string | null; title: string;
  metric: { label: string; before: string; after: string; note: string | null } | null; steps: string[]; cards: string[];
  arc: ReactNode; body: ReactNode; held: string[]; notes: ReactNode;
};
// A part of the detail after its units, as the contents name it.
export type DetailPart = { id: string; name: string };
type Measure = NonNullable<DetailUnitView["metric"]>;
// A unit's name in the contents and over its result: its title up to the colon.
const short = (title: string) => title.split(": ")[0];
// A number before and after, and right under it what was measured and on what, never further away than that.
function Result({ metric }: { metric: Measure }) {
  return <span className="dv-result-of">
    <span className="dv-unit-num num" aria-label={`${metric.before}에서 ${metric.after}로`}><span>{metric.before}</span><i aria-hidden="true">→</i><b>{metric.after}</b></span>
    <span className="dv-unit-measure">{metric.label}</span>
    {metric.note && <span className="dv-unit-note">{metric.note}</span>}
  </span>;
}
// A line of the process by date: a card, by its dated line, or a verified commit of the project. `at` sorts it.
export type DetailLogEntry =
  | { kind: "card"; id: string; at: string; when: string; step: string; stepName: string; line: string; label: string | null }
  | { kind: "commit"; id: string; at: string; when: string; repository: string; sha: string; title: string; description: string };
type Place = { id: string; step: string | null; card: string | null };
type Move = { to: string; smooth?: boolean };
const WHOLE = "전체";

export function DetailView({ id, name, kind, assets, steps, meta, list, byDate, cards, units = [], log = [], highlights = [], parts = [], top, scope, verify, tail }: {
  id: string; name: string; kind: SymbolKind; assets: SymbolAssets; steps: DetailStep[]; meta: DetailCardMeta[];
  // `list` is the cards written out under the process heading where there are no units, by date when `byDate`;
  // `cards` each card as it is read there or in its unit; `log` the process by date, a line each.
  // `top` is a picture the detail opens under: it takes the whole pane, above the place rail and the text.
  // `highlights` the units whose results the detail leads with; `parts` the parts after the units, for the contents.
  list: string[]; byDate: boolean; cards: Record<string, ReactNode>; units?: DetailUnitView[]; log?: DetailLogEntry[];
  highlights?: string[]; parts?: DetailPart[]; top?: ReactNode; scope: ReactNode; verify: ReactNode; tail: ReactNode;
}) {
  const grouped = units.length > 0;
  const [place, setPlace] = useState<Place | null>(null);
  // The entry of the contents being read.
  const [at, setAt] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const back = useContext(DrawerBack);
  // Where to go once what holds it has been opened.
  const [move, setMove] = useState<Move | null>(null);
  // What the reader has opened: units, and cards by date in a grouped detail.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const root = useRef<HTMLDivElement>(null);
  const unitOf = useMemo(() => new Map(units.flatMap((unit) => [...unit.cards, ...unit.held].map((key) => [key, unit.id] as const))), [units]);
  // The contents of a grouped detail: the scope with its results, each unit by its name, then the parts after them.
  const contents = useMemo(() => [{ id: `${id}-scope`, name: highlights.length > 0 ? "범위와 핵심 결과" : "개발 범위", steps: [] as string[] },
    ...units.map((unit) => ({ id: unit.id, name: short(unit.title), steps: unit.steps })),
    ...parts.map((part) => ({ ...part, steps: [] as string[] }))], [id, units, parts, highlights.length]);

  const go = useCallback((target: string, smooth = true) => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches, part = document.getElementById(target);
    // A card kept to one line is opened when the reader is sent to it.
    part?.querySelector(":scope > details.dv-fold")?.setAttribute("open", "");
    part?.scrollIntoView({ block: "start", behavior: smooth && !calm ? "smooth" : "auto" });
  }, []);
  // What has to be open for a card or a unit to be seen: the unit that holds it.
  const reveal = useCallback((target: string) => {
    if (!grouped) return;
    const key = units.some((item) => item.id === target) ? target : unitOf.get(target);
    if (key) setOpened((now) => (now.has(key) ? now : new Set(now).add(key)));
  }, [grouped, units, unitOf]);
  const toggle = useCallback((key: string) => setOpened((now) => { const next = new Set(now); if (!next.delete(key)) next.add(key); return next; }), []);
  // Folding from the end of an open unit: the text glides back up to the unit's head first, and only then folds, so
  // what goes is already below the screen and nothing jumps.
  const foldUp = useCallback((key: string) => {
    const head = document.getElementById(key), pane = root.current?.closest<HTMLElement>(".drawer-body");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!head || calm) { toggle(key); head?.scrollIntoView({ block: "start" }); return; }
    const host: HTMLElement | Window = pane ?? window;
    let done = false, timer = 0;
    const fold = () => { if (done) return; done = true; window.clearTimeout(timer); host.removeEventListener("scrollend", fold); toggle(key); };
    const before = pane ? pane.scrollTop : window.scrollY;
    head.scrollIntoView({ block: "start", behavior: "smooth" });
    requestAnimationFrame(() => {
      // Already at the head: nothing to glide, fold at once.
      if ((pane ? pane.scrollTop : window.scrollY) === before && Math.abs(head.getBoundingClientRect().top - (pane?.getBoundingClientRect().top ?? 0)) < 40) { fold(); return; }
      host.addEventListener("scrollend", fold, { once: true });
      timer = window.setTimeout(fold, 1200);
    });
  }, [toggle]);
  useLayoutEffect(() => {
    if (!move) return;
    go(move.to, move.smooth ?? false);
    setMove(null);
  }, [move, go]);
  // Go to a card or part, opening what holds it.
  const show = useCallback((target: string, smooth = true) => { reveal(target); setMove({ to: target, smooth }); }, [reveal]);

  // The step the home figure was showing when this opened.
  useEffect(() => { setEntry(getSceneStep(id)); }, [id]);

  // The part being read: the last one on screen whose top has passed a line a little under the top of the pane.
  useEffect(() => {
    const pane = root.current?.closest<HTMLElement>(".drawer-body") ?? document.scrollingElement as HTMLElement;
    const host: HTMLElement | Window = pane === document.scrollingElement ? window : pane;
    let frame = 0;
    const read = () => {
      frame = 0;
      // The rail beside the text is never taller than the pane it stays in; a longer one scrolls on its own.
      root.current?.style.setProperty("--pane-h", `${pane.clientHeight}px`);
      const line = (host === window ? 0 : pane.getBoundingClientRect().top) + Math.min(180, pane.clientHeight * 0.3);
      let found: HTMLElement | null = null;
      for (const part of root.current?.querySelectorAll<HTMLElement>("[data-spy]") ?? []) {
        if (!part.getClientRects().length) continue;
        if (part.getBoundingClientRect().top <= line) found = part; else break;
      }
      setPlace((now) => (now?.id === (found?.id ?? null) ? now : found ? { id: found.id, step: found.dataset.step ?? null, card: found.dataset.card || null } : null));
      let entry: string | null = null;
      for (const item of contents) { const part = document.getElementById(item.id); if (part?.getClientRects().length && part.getBoundingClientRect().top <= line) entry = item.id; }
      setAt(entry);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    host.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { host.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [opened, contents]);

  // The entry being read stays in sight in a rail that scrolls on its own.
  useEffect(() => {
    const rail = root.current?.querySelector<HTMLElement>(".dv-rail"), mark = rail?.querySelector<HTMLElement>(".dv-toc [aria-current]");
    if (!rail || !mark || rail.scrollHeight <= rail.clientHeight) return;
    const top = mark.offsetTop - rail.offsetTop, bottom = top + mark.offsetHeight;
    if (top < rail.scrollTop) rail.scrollTop = top - 12; else if (bottom > rail.scrollTop + rail.clientHeight) rail.scrollTop = bottom - rail.clientHeight + 12;
  }, [at]);

  // A step leads to its part of the text, or to its card: in its unit where there are units, else the card the detail
  // names for it by date, else its first card.
  const pick = useCallback((step: string, smooth = true) => {
    const target = steps.find((item) => item.step === step);
    if (!target) return;
    if (target.section) { go(target.section, smooth); return; }
    const to = grouped || !byDate ? target.first : target.entry ?? target.first;
    if (to) show(to, smooth);
  }, [steps, grouped, byDate, go, show]);
  // A link that names a card, a step or a part of this detail (…#engine-reference-input, …#engine-02), and a reader
  // coming back from a post to the part they left.
  useEffect(() => {
    const onAnchor = (event: Event) => {
      const target = (event as CustomEvent<string>).detail, step = steps.find((item) => `${id}-${item.step}` === target);
      if (step) pick(step.step, false);
      else if (meta.some((card) => card.id === target) || units.some((unit) => unit.id === target) || document.getElementById(target)) show(target, false);
    };
    window.addEventListener("portfolio:anchor", onAnchor);
    return () => window.removeEventListener("portfolio:anchor", onAnchor);
  }, [id, steps, meta, units, pick, show]);

  // A card kept to one line opens wherever it is pressed. Once open, its head closes it; its text is left alone so
  // it can be read and selected. The summary itself toggles natively.
  const fold = useCallback((event: Press) => {
    const hit = event.target as HTMLElement, part = hit.closest(".dv-card[data-fold]")?.querySelector<HTMLDetailsElement>(":scope > details.dv-fold");
    if (!part || hit.closest("a,button,summary,.dv-rows") || window.getSelection()?.toString()) return;
    part.open = !part.open;
  }, []);
  const reading = place?.card ? meta.find((card) => card.id === place.card) : undefined;
  const lit = place?.step ?? null, stepOf = (step: string | null) => steps.find((item) => item.step === step);
  const told = stepOf(hover) ?? stepOf(lit), from = stepOf(entry);
  const reach = (item: DetailStep) => Boolean(item.section || item.first);
  const committed = log.some((entry) => entry.kind === "commit");
  // A line of the process by date: a card's opens it in its unit; a commit's only says what changed in the code.
  const logLine = (entry: DetailLogEntry) => entry.kind === "card"
    ? <li key={entry.id} data-kind="card" data-label={entry.label ? "" : undefined}>
      <button type="button" id={`${entry.id}-log`} data-spy="" data-step={entry.step} onClick={() => show(entry.id)}>
        <span className="dv-log-meta"><time className="num">{entry.when}</time><span className="dv-log-step"><b className="num">{entry.step}</b>{entry.stepName !== entry.step && entry.stepName}</span>{entry.label && <em>{entry.label}</em>}</span>
        <b className="dv-log-line">{entry.line}</b>
        <i className="dv-log-go" aria-hidden="true" />
      </button>
    </li>
    : <li key={entry.id} data-kind="commit">
      <span className="dv-log-meta"><time className="num">{entry.when}</time><span>{entry.repository}</span><code title={`검증한 커밋 ${entry.sha}`}>{entry.sha.slice(0, 7)}</code></span>
      <b className="dv-log-line">{entry.title}</b>
      <p>{entry.description}</p>
    </li>;
  const unitView = (unit: DetailUnitView) => {
    const open = opened.has(unit.id);
    return <article className="dv-unit" key={unit.id} id={unit.id} data-spy="" data-step={unit.steps[0] ?? WHOLE} data-label={unit.label ? (unit.principle ? "principle" : "core") : undefined} data-open={open ? "" : undefined}>
      <header className="dv-unit-head">
        <p className="dv-unit-tag">
          {unit.label && <span className="dv-unit-label">{unit.label}</span>}
          {unit.verdict && <span className="dv-unit-verdict" data-verdict={unit.verdict === "채택" ? "yes" : "no"}>{unit.verdict}</span>}
          {/* A detail without home steps has no step to name. */}
          {(unit.steps.length > 0 || steps.length > 0) && <span className="num">{unit.steps.length ? unit.steps.join(" · ") : WHOLE}</span>}
        </p>
        <h4 className="dv-unit-title">{unit.title}</h4>
        {unit.metric && <Result metric={unit.metric} />}
      </header>
      {unit.arc}
      {/* What opens is named: the cards, each the problem, what was tried and rejected, and what came of it. */}
      <button type="button" className="dv-unit-more" aria-expanded={open} aria-controls={`${unit.id}-in`} onClick={() => toggle(unit.id)}>
        <span>{open ? "과정과 근거 접기" : "과정과 근거 보기"}</span><i aria-hidden="true" />
      </button>
      <div className="dv-unit-in" id={`${unit.id}-in`} hidden={!open}>{open && <>
        {unit.body}
        <div className="dv-unit-cards">{unit.cards.map((card) => <Fragment key={card}>{cards[card]}</Fragment>)}</div>
        {unit.notes}
        {/* The open unit ends in a row that folds it, and the reader lands back on its head. */}
        <button type="button" className="dv-unit-fold" aria-controls={`${unit.id}-in`} onClick={() => foldUp(unit.id)}>
          <span>과정과 근거 접기</span><i aria-hidden="true" />
        </button>
      </>}</div>
    </article>;
  };
  return <div className="dv" data-order={byDate ? "development" : "structure"} data-kind={kind} data-grouped={grouped ? "" : undefined} ref={root}>{top}<div className="dv-in">
    <aside className="dv-rail" aria-label={`${name} 개발 과정에서 읽는 위치`}>
      <div className="dv-symbol"><DetailSymbol kind={kind} assets={assets} lit={lit} entry={entry} hover={hover} empty={steps.filter((item) => !reach(item)).map((item) => item.step)} related={reading?.related} onPick={pick} onHover={setHover} /></div>
      <p className="dv-where" aria-live="polite">
        <span>{name}</span>
        {told ? <b><i className="num">{told.step}</i>{told.name}</b> : lit === WHOLE && <b>전체</b>}
      </p>
      {from && reach(from) && <button type="button" className="dv-from" onClick={() => pick(from.step)}><span>홈에서 선택한 단계</span><b><i className="num">{from.step}</i>{from.name}</b></button>}
      {grouped ? <ol className="dv-toc" aria-label="목차">{contents.map((item) => <li key={item.id}>
        <button type="button" aria-current={item.id === at ? "location" : undefined} onClick={() => go(item.id)}
          onPointerEnter={() => setHover(item.steps[0] ?? null)} onPointerLeave={() => setHover(null)}>{item.steps.length > 0 && <span className="num">{item.steps.join("·")}</span>}<b>{item.name}</b></button>
      </li>)}</ol> : steps.length > 0 && <ol className="dv-steps">{steps.map((item) => <li key={item.step}>
        <button type="button" disabled={!reach(item)} aria-current={item.step === lit ? "step" : undefined} data-entry={item.step === entry ? "" : undefined}
          onClick={() => pick(item.step)} onPointerEnter={() => setHover(item.step)} onPointerLeave={() => setHover(null)}><span className="num">{item.step}</span>{item.name}</button>
      </li>)}</ol>}
      {/* Where the bar runs across the top it is what stays on screen, so it holds the way back. */}
      {back && <button type="button" className="drawer-close dv-back" onClick={back}>← 돌아가기</button>}
    </aside>
    <div className="dv-main">
      <section className="dv-sec dv-scope" id={`${id}-scope`} data-spy="" aria-label="개발 범위">{scope}
        {/* The results the detail leads with, each with what was measured right under its number; each goes to its unit. */}
        {highlights.length > 0 && <div className="dv-results"><p className="dv-sub-h">핵심 결과</p><ul>{highlights.map((key) => {
          const unit = units.find((item) => item.id === key);
          return unit?.metric && <li key={key}><button type="button" onClick={() => go(key)}><span className="dv-results-name">{short(unit.title)}</span><Result metric={unit.metric} /></button></li>;
        })}</ul></div>}
      </section>
      {grouped && <section className="dv-sec" id={`${id}-units`} aria-label="주요 작업">
        <h3 className="dv-h">주요 작업</h3>
        <div className="dv-units">{units.map(unitView)}</div>
      </section>}
      {verify}
      {/* Where the cards sit in units, the process is a line each, with the project's commits among them; where there
          are no units, the cards themselves. */}
      {(!grouped || log.length > 0) && <section className="dv-sec" id={`${id}-cards`} data-anchor={committed ? "commits" : undefined} aria-label="개발 과정">
        <h3 className="dv-h">개발 과정{(grouped ? log.length > 0 : byDate) && <small>날짜 순</small>}</h3>
        {!grouped && <div className="dv-cards" onClick={fold}>{list.map((card) => <Fragment key={card}>{cards[card]}</Fragment>)}</div>}
        {log.length > 0 && <ol className="dv-log">{log.map(logLine)}</ol>}
        {committed && <p className="figure-note">커밋은 실제 커밋과 대조해 제목과 내용을 요약했다. 원본 저장소가 비공개라 코드 링크 대신 커밋 식별자를 표시한다.</p>}
      </section>}
      {tail}
    </div>
  </div></div>;
}
