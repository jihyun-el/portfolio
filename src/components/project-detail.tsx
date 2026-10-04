import { Fragment, type ReactNode } from "react";
import { contracts, getProjectBody, metrics, type Project } from "@/lib/content";
import { comparison } from "@/lib/showcase";
import { Markdown } from "@/components/markdown";
import { EnginePerformance, OwnershipFlow, PipelineFlow, VqaProgress } from "@/components/project-figures";
import { ThreeClocks, VqaMatrix } from "@/components/interactive-figures";
import { BlockContract, BodyWindowCube } from "@/components/contract-figures";
import { CommitTimeline } from "@/components/history";
import { Gain } from "@/components/gain";

// The detail content of a project and its units, shared by the cards on the home page,
// the drawer and the standalone project pages that submitted links point to.

const inlineFigures: Record<string, ReactNode> = {
  "block-contract": <BlockContract contract={contracts.engine} />,
  "body-window": <BodyWindowCube window={contracts.engine.window} />,
  "three-clocks": <ThreeClocks />,
  "engine-performance": <EnginePerformance />,
  "gain-frontend": <Gain compare={comparison("frontend")} />,
  "pipeline-flow": <PipelineFlow />,
  "ownership-flow": <OwnershipFlow />,
  "vqa-matrix": <VqaMatrix matrix={metrics.vqa.matrix} />,
  "vqa-progress": <VqaProgress />,
};

// Markdown stays plain text; `<!-- figure:name -->` places a figure between paragraphs.
export function MarkdownWithFigures({ children }: { children: string }) {
  return children.split(/<!--\s*figure:([a-z-]+)\s*-->/).map((part, i) => {
    if (i % 2 === 0) return part.trim() ? <Markdown key={i}>{part}</Markdown> : null;
    if (!(part in inlineFigures)) throw new Error(`Unknown figure marker: ${part}`);
    return <Fragment key={i}>{inlineFigures[part]}</Fragment>;
  });
}

export function ProjectBody({ project }: { project: Project }) {
  return <Markdown>{getProjectBody(project.id)}</Markdown>;
}

export function ProjectCommits({ project }: { project: Project }) {
  return <section data-anchor="commits"><h3 className="drawer-sub">설계가 코드로 바뀐 기록</h3><CommitTimeline projectId={project.id} /></section>;
}
