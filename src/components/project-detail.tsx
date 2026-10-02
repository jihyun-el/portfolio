import { Fragment, type ReactNode } from "react";
import { contracts, getProjectBody, getProjectPartBody, metrics, type Project } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { Markdown } from "@/components/markdown";
import { ClassicMateMap, EnginePerformance, OwnershipFlow, PipelineFlow, VqaProgress } from "@/components/project-figures";
import { ThreeClocks, VqaMatrix } from "@/components/interactive-figures";
import { BlockContract, BodyWindowCube } from "@/components/contract-figures";
import { CommitTimeline } from "@/components/history";
import { Gain } from "@/components/gain";

// The detail content of a project and its parts, shared by the drawer on the home page
// and by the standalone project pages that submitted links point to.

const inlineFigures: Record<string, ReactNode> = {
  "block-contract": <BlockContract contract={contracts.engine} />,
  "body-window": <BodyWindowCube window={contracts.engine.window} />,
};

// Markdown stays plain text; `<!-- figure:name -->` places an interactive figure between paragraphs.
export function MarkdownWithFigures({ children }: { children: string }) {
  return children.split(/<!--\s*figure:([a-z-]+)\s*-->/).map((part, i) => {
    if (i % 2 === 0) return part.trim() ? <Markdown key={i}>{part}</Markdown> : null;
    if (!(part in inlineFigures)) throw new Error(`Unknown figure marker: ${part}`);
    return <Fragment key={i}>{inlineFigures[part]}</Fragment>;
  });
}

export function ProjectFigure({ project }: { project: Project }) {
  return project.id === "classicmate" ? <ClassicMateMap /> : <VqaProgress />;
}

export function ProjectBody({ project }: { project: Project }) {
  return <Markdown>{getProjectBody(project.id)}</Markdown>;
}

export function Experiments({ project }: { project: Project }) {
  return project.id === "ssafy-ai-challenge" ? <VqaMatrix matrix={metrics.vqa.matrix} /> : null;
}

export function PartFigures({ partId }: { partId: string }) {
  if (partId === "engine") return <><ThreeClocks /><EnginePerformance /></>;
  if (partId === "pipeline") return <PipelineFlow />;
  if (partId === "app") return <OwnershipFlow />;
  return null;
}

export function PartBody({ project, partId }: { project: Project; partId: string }) {
  return <MarkdownWithFigures>{getProjectPartBody(project.id, partId)}</MarkdownWithFigures>;
}

// What the home page row used to spell out: problem, approach, evidence and the limits of the check.
export function CaseSummary({ part }: { part: CaseView }) {
  return <section className="case-sum" aria-label="요약">
    <dl className="case-qa"><div><dt>문제</dt><dd>{part.problem}</dd></div><div><dt>접근</dt><dd>{part.approach}</dd></div></dl>
    {(part.compare || part.evidence.length > 0) && <div className="case-ev">
      {part.compare && <Gain compare={part.compare} />}
      {part.evidence.length > 0 && <ul className="evidence">{part.evidence.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
    </div>}
    <p className="part-scope"><b>검증 범위</b>{part.scope.claim} {part.scope.limit}</p>
  </section>;
}

export function ProjectCommits({ project }: { project: Project }) {
  return <section data-anchor="commits"><h3 className="drawer-sub">설계가 코드로 바뀐 기록</h3><CommitTimeline projectId={project.id} /></section>;
}
