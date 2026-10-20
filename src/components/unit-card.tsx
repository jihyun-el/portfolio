import { sitePath, type UnitWork } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { MarkdownWithFigures } from "@/components/project-detail";
import { SignalChainSection } from "@/components/signal-chain-section";
import { VqaSolution } from "@/components/project-figures";
import { ProjectLinks } from "@/components/project-links";

// `**굵게**` is the only markup a card line carries: it marks the number in the sentence.
export function Line({ children }: { children: string }) {
  return children.split("**").map((part, i) => i % 2 ? <b key={i}>{part}</b> : part);
}

// One piece of work: a label and one sentence, with the details opening under the line.
// A line that has nothing to open is not drawn as something to press.
function WorkRow({ item, open, labelled = true }: { item: UnitWork; open: boolean; labelled?: boolean }) {
  const head = <>{labelled && <b>{item.label}</b>}<span><Line>{item.line}</Line></span></>;
  if (!item.body) return <p className="work-flat">{head}</p>;
  return <details open={open}><summary>{head}</summary><div className="work-body"><MarkdownWithFigures>{item.body}</MarkdownWithFigures></div></details>;
}

// Details lead with the owned scope and verified outcome before the technical explanation.
// Result evidence stays below the work; the short outcome is shown once near the top.
// `home` retains the older folded card variant for callers outside the project browser.
export function UnitCard({ unit, mode }: { unit: CaseView; mode: "home" | "drawer" | "page" }) {
  const open = mode !== "home";
  const panorama = mode === "home" && unit.part === "engine";
  // A whole project's metrics already summarize its outcome; a part also needs its status line.
  const resultLead = Boolean(unit.part) || unit.results.length === 0;
  // The home page and an open drawer can hold the same card at once, so only the page gets ids.
  const anchor = (name?: string) => name ? mode === "page" ? { id: name } : { "data-anchor": name } : {};
  const rows = (items: UnitWork[]) => <ul className="work">{items.map((item) => <li key={item.label} {...anchor(item.anchor)}><WorkRow item={item} open={open} /></li>)}</ul>;
  const work = rows(unit.work), rest = unit.work.filter((item) => !unit.lead.includes(item.label));
  return <article className="unit" id={mode === "home" ? unit.anchor : undefined}>
    <header className="unit-h">
      {mode === "home" && <h3>{unit.title}</h3>}
      {!panorama && <><p className="unit-line">{unit.overview}</p>
      <p className="unit-tag num">{unit.tag}</p>
      <p className="unit-stack">{unit.stack.join(" · ")}</p></>}
    </header>
    {panorama && <><SignalChainSection />
      <div className="unit-context"><p className="unit-line">{unit.overview}</p><p className="unit-tag num">{unit.tag}</p><p className="unit-stack">{unit.stack.join(" · ")}</p></div></>}
    {open && (unit.results.length > 0 || unit.result) && <section className="unit-sec unit-outcome"><h4>결과</h4><div>
      {unit.results.length > 0 && <ul className="result-nums">{unit.results.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
      {unit.store && <ProjectLinks project={unit.store} named />}
      {unit.result && resultLead && <p className="unit-outcome-line"><Line>{unit.result.line}</Line></p>}
    </div></section>}
    {unit.id === "vqa" && <section className="unit-sec"><h4>최종 솔루션</h4><VqaSolution /></section>}
    {unit.hardest.length > 0 && <section className="unit-sec"><h4>제일 어려웠던 것</h4>
      <ol className="hard">{unit.hardest.map((item) => <li key={item.title}><b>{item.title}</b><p>{item.body}</p></li>)}</ol>
    </section>}
    <section className="unit-sec"><h4>한 일</h4>
      {mode !== "home" ? work
        : unit.fold ? <details className="fold"><summary><span>{unit.work.map((item) => item.label).join(" · ")}</span></summary>{work}</details>
        : unit.lead.length && rest.length ? <div>{rows(unit.work.filter((item) => unit.lead.includes(item.label)))}
          <details className="fold more"><summary data-more={`${rest.length}개 더 보기 +`}><span>{rest.map((item) => item.label).join(", ")}</span></summary>{rows(rest)}</details></div>
        : work}
    </section>
    {unit.troubles.length > 0 && <section className="unit-sec"><h4>트러블슈팅</h4>
      <ul className="trouble">{unit.troubles.map((post) => <li key={post.slug}><a href={sitePath(`/writing/${post.slug}/`)}><b>{post.title}</b></a></li>)}</ul>
    </section>}
    {!open && (unit.results.length > 0 || unit.result) && <section className="unit-sec"><h4>결과</h4><div>
      {unit.results.length > 0 && <ul className="result-nums">{unit.results.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
      {unit.store && <ProjectLinks project={unit.store} named />}
      {unit.result && <div className="work result-more"><WorkRow item={unit.result} open={open} labelled={false} /></div>}
    </div></section>}
    {open && unit.result && (unit.result.body || !resultLead) && <section className="unit-sec"><h4>결과 상세</h4><div>
      {!resultLead && <p className="unit-outcome-line"><Line>{unit.result.line}</Line></p>}
      <MarkdownWithFigures>{unit.result.body}</MarkdownWithFigures>
    </div></section>}
  </article>;
}
