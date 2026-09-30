import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { getProjectBody, getProjectPartBody, projects, metrics } from "@/lib/content";
import { ClassicMateMap, EnginePerformance, OwnershipFlow, PipelineFlow, VqaProgress } from "@/components/project-figures";
import { ThreeClocks, VqaMatrix } from "@/components/interactive-figures";
import { CommitTimeline } from "@/components/history";

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
    <nav className="part-nav" aria-label="프로젝트 구성">{project.parts?.map((part) => <a href={`#${part.id}`} key={part.id}>{part.title}</a>)}{id==="ssafy-ai-challenge" && <a href="#experiments">실험 비교</a>}<a href="#commits">커밋 이력</a></nav>
    {id === "classicmate" ? <ClassicMateMap /> : <VqaProgress />}
    <Markdown>{getProjectBody(id)}</Markdown>
    {id === "ssafy-ai-challenge" && <section className="project-part-section" id="experiments"><h2>한 번에 한 축씩 바꾼 실험</h2><VqaMatrix matrix={metrics.vqa.matrix} /></section>}
    {project.parts?.map((part) => <section className="project-part-section" id={part.id} key={part.id}><h2>{part.title}</h2>
      {part.id === "engine" && <><ThreeClocks /><EnginePerformance /></>}
      {part.id === "pipeline" && <PipelineFlow />}{part.id === "app" && <OwnershipFlow />}
      <Markdown>{getProjectPartBody(id, part.id)}</Markdown></section>)}
    <section className="project-part-section" id="commits"><h2>설계가 코드로 바뀐 기록</h2><CommitTimeline projectId={id} /></section>
  </article>;
}
