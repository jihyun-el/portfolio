import Link from "next/link";
import type { Project } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { CompareBars } from "@/components/showcase-parts";
import { SignalChainSection } from "@/components/signal-chain-section";

// One project on the home page: its head, then each part as a row of problem and approach.
// The engine row carries the signal chain panorama, which shows that part from the inside.
export function ProjectSection({ project, parts }: { project: Project; parts: CaseView[] }) {
  return <section className="project" id={project.id} aria-labelledby={`${project.id}-title`}>
    <div className="wrap">
      <header className="project-h">
        <p className="project-meta">{project.period}</p>
        <h2 id={`${project.id}-title`}>{project.title}</h2>
        <p className="project-role">{project.role}</p>
        <p className="project-sum">{project.summary}</p>
      </header>
      <div className="parts">{parts.map((part) => <article className="part" id={part.anchor} key={part.id} aria-labelledby={`${part.anchor}-title`}>
        <div className="part-h">
          <h3 id={`${part.anchor}-title`}>{part.title}</h3>
          <p className="part-sub">{part.sub}</p>
          <p className="part-tag num">{part.tag}</p>
        </div>
        <dl className="part-qa"><div><dt>문제</dt><dd>{part.problem}</dd></div><div><dt>접근</dt><dd>{part.approach}</dd></div></dl>
        <div className="part-ev">
          <div className="ev-nums">
            {part.compare && <CompareBars compare={part.compare} />}
            {part.evidence.length > 0 && <ul className="evidence">{part.evidence.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
          </div>
          <div className="ev-text">
            <p className="part-scope"><b>검증 범위</b>{part.scope.claim} {part.scope.limit}</p>
            <div className="read-row"><Link className="read" href={part.href}>설계와 검증 과정 ↗</Link>{part.more && <Link className="read" href={part.more.href}>{part.more.label} ↗</Link>}</div>
          </div>
        </div>
        {part.id === "engine" && <SignalChainSection />}
      </article>)}</div>
    </div>
  </section>;
}
