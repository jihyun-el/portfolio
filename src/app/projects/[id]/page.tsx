import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects } from "@/lib/content";
import { caseViews } from "@/lib/showcase";
import { CommitTimeline } from "@/components/history";
import { ProjectLinks } from "@/components/project-links";
import { BackLink } from "@/components/back-link";
import { CaseSummary, Experiments, PartBody, PartFigures, ProjectBody, ProjectFigure } from "@/components/project-detail";

// The standalone page for links that point straight at a project. From the home page the same
// content opens in a drawer instead (see components/drawer.tsx).
export const dynamicParams = false;
export function generateStaticParams() { return projects.map(({ id }) => ({ id })); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  return { title: project?.title, description: project?.summary };
}
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();
  const views = caseViews().filter((view) => view.projectId === id);
  const single = project.parts?.length ? null : views[0];
  return <article className="article"><BackLink /><header className="article-header"><p className="muted">{project.period}</p><h1>{project.title}</h1><p>{project.role}</p><ProjectLinks project={project} /></header>
    <nav className="part-nav" aria-label="프로젝트 구성">{project.parts?.map((part) => <a href={`#${part.id}`} key={part.id}>{part.title}</a>)}{id === "ssafy-ai-challenge" && <a href="#experiments">실험 비교</a>}<a href="#commits">커밋 이력</a></nav>
    {single && <CaseSummary part={single} />}
    <ProjectFigure project={project} />
    <ProjectBody project={project} />
    {id === "ssafy-ai-challenge" && <section className="project-part-section" id="experiments"><h2>한 번에 한 축씩 바꾼 실험</h2><Experiments project={project} /></section>}
    {project.parts?.map((part) => {
      const view = views.find((item) => item.part === part.id);
      return <section className="project-part-section" id={part.id} key={part.id}><h2>{part.title}</h2>
        {view && <CaseSummary part={view} />}
        <PartFigures partId={part.id} /><PartBody project={project} partId={part.id} /></section>;
    })}
    <section className="project-part-section" id="commits"><h2>설계가 코드로 바뀐 기록</h2><CommitTimeline projectId={id} /></section>
  </article>;
}
