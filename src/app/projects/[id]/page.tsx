import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects } from "@/lib/content";
import { caseViews } from "@/lib/showcase";
import { CommitTimeline } from "@/components/history";
import { ProjectLinks } from "@/components/project-links";
import { BackLink } from "@/components/back-link";
import { ProjectBody } from "@/components/project-detail";
import { ClassicMateMap } from "@/components/project-figures";
import { UnitCard } from "@/components/unit-card";

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
    <nav className="part-nav" aria-label="프로젝트 구성">{project.parts?.map((part) => <a href={`#${part.id}`} key={part.id}>{part.title}</a>)}{single?.work.filter((item) => item.anchor).map((item) => <a href={`#${item.anchor}`} key={item.anchor}>{item.label}</a>)}<a href="#commits">커밋 이력</a></nav>
    {single ? <UnitCard unit={single} mode="page" /> : <><ClassicMateMap /><ProjectBody project={project} /></>}
    {project.parts?.map((part) => {
      const view = views.find((item) => item.part === part.id)!;
      return <section className="project-part-section" id={part.id} key={part.id}><h2>{part.title}</h2><UnitCard unit={view} mode="page" /></section>;
    })}
    <section className="project-part-section" id="commits"><h2>설계가 코드로 바뀐 기록</h2><CommitTimeline projectId={id} /></section>
  </article>;
}
