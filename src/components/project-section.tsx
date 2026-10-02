import { sitePath, type Project } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { ProjectLinks } from "@/components/project-links";
import { Gain } from "@/components/gain";
import { SignalChainSection } from "@/components/signal-chain-section";

// One project on the home page, set apart from the next by its own band and number.
// Each part is one row: name, one sentence, one number. The row links to the part's page,
// which the drawer host turns into a drawer, so the details never leave the home page.
export function ProjectSection({ project, parts, index, total }: { project: Project; parts: CaseView[]; index: number; total: number }) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return <section className="project" id={project.id} aria-labelledby={`${project.id}-title`}>
    <div className="wrap">
      <header className="project-h">
        <p className="project-no num" aria-label={`프로젝트 ${index + 1} / ${total}`}><b>{pad(index + 1)}</b><span>/ {pad(total)}</span></p>
        <div className="project-hb">
          <p className="project-meta">{project.period}</p>
          <h2 id={`${project.id}-title`}>{project.title}</h2>
          <p className="project-role">{project.role}</p>
          <p className="project-sum">{project.summary}</p>
          <div className="project-actions">
            {project.parts?.length ? <a className="read" href={sitePath(`/projects/${project.id}/`)}>프로젝트 전체 보기</a> : null}
            <ProjectLinks project={project} />
          </div>
        </div>
      </header>
      <ol className="parts">{parts.map((part) => <li key={part.id} id={part.anchor}>
        <a className="prow" href={sitePath(part.href)} aria-label={`${part.title} 자세히 보기`}>
          <div className="prow-h"><h3>{part.title}</h3><p className="prow-sub">{part.sub}</p><p className="prow-tag num">{part.tag}</p></div>
          <p className="prow-line">{part.line}</p>
          <div className="prow-fig">{part.compare ? <Gain compare={part.compare} compact /> : part.headline && <span className="prow-stat"><b className="num">{part.headline.value}{part.headline.unit && <small>{part.headline.unit}</small>}</b><span>{part.headline.label}</span></span>}</div>
          <div className="prow-go" aria-hidden="true">자세히 <i>→</i></div>
        </a>
        {part.part === "engine" && <SignalChainSection poster={sitePath("/images/signal-chain-poster.jpg")} />}
      </li>)}</ol>
    </div>
  </section>;
}
