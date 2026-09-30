import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { getProjectBody, getProjectPartBody, projects } from "@/lib/content";

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
  return <article className="article"><Link className="back-link" href="/#projects">프로젝트 목록</Link><header className="article-header"><p className="muted">{project.period}</p><h1>{project.title}</h1><p>{project.role}</p></header>
    {project.parts && <nav className="part-nav" aria-label="프로젝트 구성">{project.parts.map((part) => <a href={`#${part.id}`} key={part.id}>{part.title}</a>)}</nav>}
    <Markdown>{getProjectBody(id)}</Markdown>
    {project.parts?.map((part) => <section className="project-part-section" id={part.id} key={part.id}><h2>{part.title}</h2><Markdown>{getProjectPartBody(id, part.id)}</Markdown></section>)}
  </article>;
}
