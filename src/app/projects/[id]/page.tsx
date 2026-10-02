import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { Fragment, type ReactNode } from "react";
import { getProjectBody, getProjectPartBody, projects, metrics, contracts } from "@/lib/content";
import { ClassicMateMap, EnginePerformance, OwnershipFlow, PipelineFlow, VqaProgress } from "@/components/project-figures";
import { ThreeClocks, VqaMatrix } from "@/components/interactive-figures";
import { BlockContract, BodyWindowCube } from "@/components/contract-figures";
import { CommitTimeline } from "@/components/history";
import { ProjectLinks } from "@/components/project-links";

const inlineFigures: Record<string, ReactNode> = {
  "block-contract": <BlockContract contract={contracts.engine} />,
  "body-window": <BodyWindowCube window={contracts.engine.window} />,
};

// Markdown stays plain text; `<!-- figure:name -->` places an interactive figure between paragraphs.
function MarkdownWithFigures({ children }: { children: string }) {
  return children.split(/<!--\s*figure:([a-z-]+)\s*-->/).map((part, i) => {
    if (i % 2 === 0) return part.trim() ? <Markdown key={i}>{part}</Markdown> : null;
    if (!(part in inlineFigures)) throw new Error(`Unknown figure marker: ${part}`);
    return <Fragment key={i}>{inlineFigures[part]}</Fragment>;
  });
}

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
  return <article className="article"><Link className="back-link" href="/#projects">프로젝트 목록</Link><header className="article-header"><p className="muted">{project.period}</p><h1>{project.title}</h1><p>{project.role}</p><ProjectLinks project={project} /></header>
    <nav className="part-nav" aria-label="프로젝트 구성">{project.parts?.map((part) => <a href={`#${part.id}`} key={part.id}>{part.title}</a>)}{id==="ssafy-ai-challenge" && <a href="#experiments">실험 비교</a>}<a href="#commits">커밋 이력</a></nav>
    {id === "classicmate" ? <ClassicMateMap /> : <VqaProgress />}
    <Markdown>{getProjectBody(id)}</Markdown>
    {id === "ssafy-ai-challenge" && <section className="project-part-section" id="experiments"><h2>한 번에 한 축씩 바꾼 실험</h2><VqaMatrix matrix={metrics.vqa.matrix} /></section>}
    {project.parts?.map((part) => <section className="project-part-section" id={part.id} key={part.id}><h2>{part.title}</h2>
      {part.id === "engine" && <><ThreeClocks /><EnginePerformance /></>}
      {part.id === "pipeline" && <PipelineFlow />}{part.id === "app" && <OwnershipFlow />}
      <MarkdownWithFigures>{getProjectPartBody(id, part.id)}</MarkdownWithFigures></section>)}
    <section className="project-part-section" id="commits"><h2>설계가 코드로 바뀐 기록</h2><CommitTimeline projectId={id} /></section>
  </article>;
}
