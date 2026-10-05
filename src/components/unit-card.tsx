import { sitePath, type UnitWork } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { MarkdownWithFigures } from "@/components/project-detail";
import { SignalChainSection } from "@/components/signal-chain-section";
import { VqaSolution } from "@/components/project-figures";

// `**굵게**` is the only markup a card line carries: it marks the number in the sentence.
function Line({ children }: { children: string }) {
  return children.split("**").map((part, i) => i % 2 ? <b key={i}>{part}</b> : part);
}

// One piece of work: a label and one sentence, with the details opening under the line.
// A line that has nothing to open is not drawn as something to press.
function WorkRow({ item, open, labelled = true }: { item: UnitWork; open: boolean; labelled?: boolean }) {
  const head = <>{labelled && <b>{item.label}</b>}<span><Line>{item.line}</Line></span></>;
  if (!item.body) return <p className="work-flat">{head}</p>;
  return <details open={open}><summary>{head}</summary><div className="work-body"><MarkdownWithFigures>{item.body}</MarkdownWithFigures></div></details>;
}

// Every unit — the three ClassicMate parts and the VQA project — is one card with the same slots:
// stack, overview, work, troubleshooting, result. A unit's main diagram (the engine's panorama, the
// VQA solution) sits right under the header. On the home page the details start closed, and a
// unit marked `fold` shows its work as one line of labels until it is opened, so the main units
// stay the longest. In the drawer and on the project page (`drawer`, `page`) everything is open.
export function UnitCard({ unit, mode }: { unit: CaseView; mode: "home" | "drawer" | "page" }) {
  const open = mode !== "home";
  // The home page and an open drawer can hold the same card at once, so only the page gets ids.
  const anchor = (name?: string) => name ? mode === "page" ? { id: name } : { "data-anchor": name } : {};
  const work = <ul className="work">{unit.work.map((item) => <li key={item.label} {...anchor(item.anchor)}><WorkRow item={item} open={open} /></li>)}</ul>;
  return <article className="unit" id={mode === "home" ? unit.anchor : undefined}>
    <header className="unit-h">
      {mode === "home" && <h3>{unit.title}</h3>}
      <p className="unit-tag num">{unit.tag}</p>
      <p className="unit-stack">{unit.stack.join(" · ")}</p>
      <p className="unit-line">{unit.overview}</p>
    </header>
    {mode === "home" && unit.part === "engine" && <SignalChainSection poster={sitePath("/images/signal-chain-poster.jpg")} />}
    {unit.id === "vqa" && <section className="unit-sec"><h4>최종 솔루션</h4><VqaSolution /></section>}
    {unit.hardest.length > 0 && <section className="unit-sec"><h4>제일 어려웠던 것</h4>
      <ol className="hard">{unit.hardest.map((item) => <li key={item.title}><b>{item.title}</b><p>{item.body}</p></li>)}</ol>
    </section>}
    <section className="unit-sec"><h4>한 일</h4>
      {unit.fold && mode === "home" ? <details className="fold"><summary><span>{unit.work.map((item) => item.label).join(" · ")}</span></summary>{work}</details> : work}
    </section>
    {unit.troubles.length > 0 && <section className="unit-sec"><h4>트러블슈팅</h4>
      <ul className="trouble">{unit.troubles.map((post) => <li key={post.slug}><a href={sitePath(`/writing/${post.slug}/`)}><b>{post.title}</b></a></li>)}</ul>
    </section>}
    {(unit.results.length > 0 || unit.result) && <section className="unit-sec"><h4>결과</h4><div>
      {unit.results.length > 0 && <ul className="result-nums">{unit.results.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
      {unit.result && <div className="work result-more"><WorkRow item={unit.result} open={open} labelled={false} /></div>}
    </div></section>}
  </article>;
}
