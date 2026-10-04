import { sitePath, type Project } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { ProjectLinks } from "@/components/project-links";
import { UnitCard } from "@/components/unit-card";

// One project on the home page, set apart from the next by its own band and number.
// Under the header each unit is one card with the same slots, so what was built reads
// without opening anything and the details open in place.
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
      <div className="units">{parts.map((part) => <UnitCard key={part.id} unit={part} mode="home" />)}</div>
    </div>
  </section>;
}
