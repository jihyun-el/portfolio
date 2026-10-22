import type { ReactNode } from "react";
import { getWriting, history, sitePath, type Writing } from "@/lib/content";
import { developmentOrder, structureOrder, type Detail, type DetailCard, type DetailLink, type DetailMetric, type DetailUnit } from "@/lib/details";
import { Markdown } from "@/components/markdown";
import { DetailView, type DetailLogEntry, type DetailPart, type DetailStep, type DetailUnitView } from "@/components/detail-view";
import type { SymbolAssets, SymbolKind } from "@/components/detail-symbols";

// The text of a project detail, laid out once on the server, in the same parts on every detail: the scope (what it
// is, what the lead did and with whom, and the results it leads with); what was done (the units, each read by its title,
// its number with what was measured, and the way it went in five lines, opening to its cards and what it taught); how
// the whole was verified; the process by date, one line a step of the work or a commit; what the whole taught; the
// stack and the prior work it stands on; further reading. Every card is written out once, in its unit, and has the
// same four rows (problem and cause, what was tried and decided, the result, what was taken and what was changed),
// each headed above its text. A card's own posts are a row of their own; the papers it cites are a note under the last
// row. DetailView arranges the parts.
const WHOLE = "전체";
const SCOPE: [keyof Detail["scope"], string][] = [["direct", "담당 범위"], ["team", "협업 범위"]];
const PRINCIPLE = "설계 원칙";
const DROPPED = { "tested-rejected": "실험 후 기각", "considered-rejected": "검토 후 제외" };
// The way a unit of work went, in the order a reader asks about it.
const ARC: [keyof DetailUnit["arc"], string][] = [["constraint", "제약"], ["problem", "문제 정의"], ["design", "실험 설계"], ["evaluation", "평가"], ["improvement", "개선"]];

// A unit's arc as five lines down, the last one marked: what it came to.
function Arc({ unit }: { unit: DetailUnit }) {
  return <figure className="dv-flow dv-arc"><ol aria-label={`${unit.title}: 제약에서 개선까지`}>{ARC.map(([key, label]) =>
    <li key={key} data-key={key === "improvement" ? "" : undefined}><p>{label}</p><span>{unit.arc[key]}</span></li>)}</ol></figure>;
}

// A formula written on a line of its own is set as a displayed formula, as the posts set theirs.
const Prose = ({ children }: { children: string }) => <Markdown>{children.replace(/^\$\$(.+)\$\$$/gm, (_, formula: string) => `$$\n${formula}\n$$`)}</Markdown>;
const number = (value: number | string) => (typeof value === "number" && Number.isInteger(value) ? value.toLocaleString("ko-KR") : String(value));

// A link to a post is named by the post's own title, so the name read here is the one found there.
function Links({ links, posts }: { links: DetailLink[]; posts: Writing[] }) {
  return <ul className="dv-links">{links.map((link) => {
    const post = posts.find((item) => link.href === `/writing/${item.slug}/`);
    return <li key={link.href}><a href={link.href.startsWith("/") ? sitePath(link.href) : link.href}>{post?.title ?? link.label}</a><span>{link.purpose}</span></li>;
  })}</ul>;
}

// The papers a card draws on are a note under its own sentence, smaller and quieter than the text, so what was written
// here and what it cites are not read at one level.
function References({ links }: { links: DetailLink[] }) {
  return <div className="dv-refs"><p>참고문헌</p><ul>{links.map((link) => <li key={link.href}>
    <a href={link.href.startsWith("/") ? sitePath(link.href) : link.href} {...(link.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link.label} ↗</a><span>{link.purpose}</span>
  </li>)}</ul></div>;
}

// A measured result: each value with its name, drawn against the others of its unit where a length tells them apart;
// what was measured and on what stays beside the numbers.
function Metric({ metric }: { metric: DetailMetric }) {
  const share = (value: number | string, unit: string) => {
    const group = metric.values.filter((item) => item.unit === unit && typeof item.value === "number").map((item) => item.value as number);
    const most = Math.max(...group), least = Math.min(...group);
    return typeof value === "number" && group.length > 1 && least >= 0 && most > 0 && least / most <= 0.9 ? value / most : null;
  };
  return <figure className="dv-metric">
    <figcaption>{metric.label}</figcaption>
    <ul data-many={metric.values.length > 5 ? "" : undefined}>{metric.values.map((item) => {
      const part = share(item.value, item.unit);
      return <li key={item.label}><span>{item.label}</span><b className="num">{number(item.value)}{item.unit && <small>{item.unit}</small>}</b>{part !== null && <i style={{ width: `${Math.max(part * 100, 1.5).toFixed(1)}%` }} aria-hidden="true" />}</li>;
    })}</ul>
    <p className="dv-metric-scope">{metric.scope}</p>
    <p className="dv-metric-how">{metric.method}</p>
  </figure>;
}

// A development line starts with its date; the date is set apart so it can mark the card.
function dateOf(line: string | null): [string | null, string | null] {
  const cut = line?.indexOf(" — ") ?? -1;
  return line === null ? [null, null] : cut < 0 ? [null, line] : [line.slice(0, cut), line.slice(cut + 3)];
}

function Mark({ step, name }: { step: string; name: string }) {
  return <p className="dv-mark"><b className="num">{step}</b>{name !== step && <span>{name}</span>}</p>;
}

// Where a detail names its core cards, those are read in full under a filled bar and every other card is kept to
// its line and its result; pressing anywhere on such a card opens it, and the mark under it says so (`folded`).
// A card is headed by its line by date where it is read by date (`byDate`), else by its line in the structure; `anchor`
// is its ID on the page, which differs for the copy by date of a card that also sits in a unit.
function Card({ card, metrics, posts, intro, figure, folded, coreLabel, byDate, anchor = card.id }: { card: DetailCard; metrics: DetailMetric[]; posts: Writing[]; intro?: ReactNode; figure?: ReactNode; folded: boolean; coreLabel: string; byDate: boolean; anchor?: string }) {
  const [when, development] = dateOf(card.lead.development);
  const rows = <CardRows card={card} metrics={metrics} posts={posts} figure={figure} />;
  return <article className="dv-card" id={anchor} data-card={card.id} data-spy="" data-step={card.step} data-core={card.core ? "" : undefined} data-principle={card.principle ? "" : undefined} data-fold={folded ? "" : undefined}>
    <header className="dv-card-h">
      {/* The bar a card starts under: its step and its date. Where one bar stands, a new card has begun. */}
      <div className="dv-bar"><div className="dv-bar-l"><Mark step={card.step} name={card.stepName} />{(card.core || card.principle) && <p className="dv-core">{card.principle ? PRINCIPLE : coreLabel}</p>}</div>{when && <p className="dv-when num">{when}</p>}</div>
      <h4 className="dv-lead" id={`${anchor}-lead`}>{byDate && development ? development : card.lead.structure}</h4>
    </header>
    {intro}
    {/* A folded card is named by its line and its result, so the name alone says which card it is. */}
    {folded ? <details className="dv-fold"><summary aria-labelledby={`${anchor}-lead ${anchor}-sum`}><span id={`${anchor}-sum`}>{card.result.summary}</span><i aria-hidden="true" /></summary>{rows}</details> : rows}
  </article>;
}

function CardRows({ card, metrics, posts, figure }: { card: DetailCard; metrics: DetailMetric[]; posts: Writing[]; figure?: ReactNode }) {
  return <dl className="dv-rows">
    <div><dt>문제와 원인</dt><dd><Prose>{card.problem}</Prose><Prose>{card.cause}</Prose></dd></div>
    <div><dt>시도와 결정</dt><dd>
      <Prose>{card.decision}</Prose>
      {card.alternatives.length > 0 && <ul className="dv-dropped">{card.alternatives.map((item) => <li key={item.approach}><b>{item.approach}</b><em>{DROPPED[item.disposition]}</em><span>{item.reason}</span></li>)}</ul>}
    </dd></div>
    <div><dt>결과</dt><dd>
      <p className="dv-result">{card.result.summary}</p>
      {card.result.atDecision && <p>{card.result.atDecision}</p>}
      {card.result.metricIds.map((key) => <Metric key={key} metric={metrics.find((item) => item.id === key)!} />)}
      {figure}
      {card.result.current && <p>{card.result.current}</p>}
    </dd></div>
    {card.links.length > 0 && <div><dt>관련 글</dt><dd><Links links={card.links} posts={posts} /></dd></div>}
    {card.borrowed && <div><dt>참조한 기법과 변경점</dt><dd><p>{card.borrowed.summary}</p>{card.borrowed.links.length > 0 && <References links={card.borrowed.links} />}</dd></div>}
  </dl>;
}

// A retrospective point: under its step's mark where it belongs to a step.
function Note({ item }: { item: Detail["reflection"][number] }) {
  return <article className="dv-item" id={item.id} data-spy="" data-step={item.step === WHOLE ? undefined : item.step}>
    {item.step !== WHOLE && <Mark step={item.step} name={item.stepName} />}
    <h4 className="dv-lead">{item.lead}</h4>
    <Prose>{item.body}</Prose>
  </article>;
}

export function DetailPanel({ detail, name, kind, assets, top, intros = {}, figures = {}, unitFigures = {}, commits }: {
  detail: Detail; name: string; kind: SymbolKind; assets: SymbolAssets;
  // The picture the whole detail opens under, across the pane (`top`); pictures for a card, by card ID: one under its
  // line (`intros`), one with its result (`figures`); a picture at the head of an opened unit, by unit ID
  // (`unitFigures`); and the project whose verified commits join the process by date (`commits`).
  top?: ReactNode; intros?: Record<string, ReactNode>; figures?: Record<string, ReactNode>; unitFigures?: Record<string, ReactNode>; commits?: string;
}) {
  const posts = getWriting(), structure = structureOrder(detail), development = developmentOrder(detail);
  const inCards = new Set(detail.cards.flatMap((card) => card.result.metricIds)), ranked = detail.cards.some((card) => card.core);
  // The cards are read by date where their dates are on record (every card's, or none: check-content); a detail of a
  // single card has no order to speak of.
  const byDate = development.length > 0 && detail.cards.length > 1;
  // Where a detail groups its cards into units of work, the units are what is read first, in the scope; the cards are
  // read one step further in, inside a unit or by date, and are never kept to a line by themselves.
  const grouped = (detail.units?.length ?? 0) > 0, stepOf = (id: string) => detail.cards.find((card) => card.id === id)!.step;
  // What a core card is called: the engine's and the app's are decisions about their architecture.
  const coreLabel = kind === "engine" || kind === "app" ? "아키텍처 결정" : "설계 결정";
  // A step leads to its first card by home step, to the card the detail names for it by date, or to a part of the
  // retrospective when the step itself is one.
  // Grouped, a step leads to its first card in the unit that names the step.
  const steps: DetailStep[] = detail.steps.map((item) => ({
    step: item.step, name: item.stepName, entry: item.entryCardId, section: item.sectionAnchor,
    first: grouped ? detail.units!.find((unit) => unit.steps.includes(item.step))?.cards.find((id) => stepOf(id) === item.step) ?? null
      : structure.find((id) => stepOf(id) === item.step) ?? null,
  }));
  // A retrospective point of a step that a unit holds is read in that unit, after its cards; the rest, about the whole
  // or about a step no unit holds, are read together near the end.
  const unitOfStep = (step: string) => (grouped && step !== WHOLE ? detail.units!.find((unit) => unit.steps.includes(step)) : undefined);
  const loose = detail.reflection.filter((item) => !unitOfStep(item.step));
  const units: DetailUnitView[] = (detail.units ?? []).map((unit) => {
    const notes = detail.reflection.filter((item) => unitOfStep(item.step)?.id === unit.id);
    return {
      id: unit.id, title: unit.title, metric: unit.metric, verdict: unit.verdict ?? null, steps: unit.steps, cards: unit.cards, principle: unit.label === "principle",
      label: unit.label === "principle" ? PRINCIPLE : unit.label === "core" ? coreLabel : null,
      arc: <Arc unit={unit} />, body: unitFigures[unit.id],
      held: notes.map((item) => item.id),
      notes: notes.length > 0 ? <div className="dv-unit-notes"><p className="dv-sub-h">회고</p>{notes.map((item) => <Note key={item.id} item={item} />)}</div> : null,
    };
  });
  // The process by date, one line each: a card (by its dated line; it is written out in its unit) and a verified
  // commit of the project, the two kinds on one line of time.
  const day = (date: string) => date.replaceAll("-", ".");
  const log: DetailLogEntry[] = [
    ...(grouped ? development : []).map((key) => {
      const item = detail.cards.find((entry) => entry.id === key)!, [when, line] = dateOf(item.lead.development);
      return { kind: "card" as const, id: item.id, at: item.date!.from, when: when ?? day(item.date!.from), step: item.step, stepName: item.stepName, line: line ?? item.lead.structure,
        label: item.principle ? PRINCIPLE : item.core ? coreLabel : null };
    }),
    ...history.repositories.filter((repo) => commits && repo.projectId === commits).flatMap((repo) => repo.milestones.map((entry) => ({
      kind: "commit" as const, id: entry.sha, at: entry.date, when: day(entry.date), repository: repo.title, sha: entry.sha, title: entry.title, description: entry.description,
    }))),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === "card" ? -1 : 1));
  // The parts after the units, as the contents beside the text name them.
  const parts: DetailPart[] = [
    ...(detail.validation.length > 0 ? [{ id: `${detail.id}-validation`, name: "검증" }] : []),
    ...(grouped && log.length > 0 ? [{ id: `${detail.id}-cards`, name: "개발 과정" }] : []),
    ...(loose.length > 0 ? [{ id: `${detail.id}-reflection`, name: "회고" }] : []),
    { id: `${detail.id}-stack`, name: "기술 스택" },
    ...(detail.links.length > 0 ? [{ id: `${detail.id}-links`, name: "관련 글" }] : []),
  ];
  const card = (item: DetailCard) => <Card key={item.id} card={item} metrics={detail.metrics} posts={posts} intro={intros[item.id]} figure={figures[item.id]}
    folded={!grouped && ranked && !item.core && !item.principle} coreLabel={coreLabel} byDate={!grouped && byDate} />;
  return <DetailView id={detail.id} name={name} kind={kind} assets={assets} steps={steps} list={byDate ? development : structure} byDate={byDate} top={top} units={units} log={log} highlights={detail.highlights ?? []} parts={parts}
    meta={detail.cards.map((item) => ({ id: item.id, related: item.relatedDetails ?? [] }))}
    // In a unit a card is headed by its line in the structure; in a list of whole cards by date by its dated line.
    cards={Object.fromEntries(detail.cards.map((item) => [item.id, card(item)]))}
    // The scope in one place: what it is and when, what the lead did and with whom. The results follow it (DetailView);
    // the stack and the prior work it stands on are read near the end.
    scope={<>
      <h3 className="dv-h">개발 범위</h3>
      <p className="dv-sentence">{detail.sentence}</p>
      <p className="dv-period num">{detail.period}</p>
      <dl className="dv-rows">{SCOPE.filter(([key]) => detail.scope[key].length > 0).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{detail.scope[key].map((line) => <p key={line}>{line}</p>)}</dd></div>)}</dl>
    </>}
    verify={detail.validation.length > 0 && <section className="dv-sec" id={`${detail.id}-validation`} aria-label="검증">
      <h3 className="dv-h">검증</h3>
      {detail.validation.map((item) => <article className="dv-item" key={item.id} id={item.id} data-spy="">
        <h4 className="dv-lead">{item.lead}</h4>
        <Prose>{item.body}</Prose>
        {item.metricIds.filter((key) => !inCards.has(key)).map((key) => <Metric key={key} metric={detail.metrics.find((entry) => entry.id === key)!} />)}
      </article>)}
    </section>}
    tail={<>
      {loose.length > 0 && <section className="dv-sec" id={`${detail.id}-reflection`} aria-label="회고">
        <h3 className="dv-h">회고</h3>
        {loose.map((item) => <Note key={item.id} item={item} />)}
      </section>}
      <section className="dv-sec dv-tech" id={`${detail.id}-stack`} data-spy="" aria-label="기술 스택과 활용한 기존 기술">
        <h3 className="dv-h">기술 스택과 활용한 기존 기술</h3>
        <ul className="dv-stack">{detail.stack.map((item) => <li key={item.technology}><b>{item.technology}</b><span>{item.use}</span></li>)}</ul>
        {detail.scope.borrowed.length > 0 && <div className="dv-borrowed"><p className="dv-sub-h">활용한 기존 기술</p>{detail.scope.borrowed.map((line) => <p key={line}>{line}</p>)}</div>}
      </section>
      {detail.links.length > 0 && <section className="dv-sec" id={`${detail.id}-links`} data-spy="" aria-label="관련 글">
        <h3 className="dv-h">관련 글</h3>
        <Links links={detail.links} posts={posts} />
      </section>}
    </>} />;
}
