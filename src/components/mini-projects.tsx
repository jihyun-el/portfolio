import type { ComponentType } from "react";
import Link from "next/link";
import { getMiniBody, miniProjects, type MiniProject } from "@/lib/content";
import { MarkdownWithFigures } from "@/components/project-detail";
import { MirrorPoseThumb } from "@/components/mirror-pose-figure";

// Card pictures, by the `thumb` name in content/mini-projects.json.
const thumbs: Record<string, ComponentType> = { "mirror-pose": MirrorPoseThumb };

export const miniTag = (item: MiniProject) => [item.period, item.program, item.role].filter(Boolean).join(" · ");

// Short projects outside the two main ones: a quiet row of cards. Like a troubleshooting post, a card
// opens in the drawer and has its own page for links that arrive from outside.
export function MiniProjects() {
  return <section className="sec" id="mini" aria-labelledby="mini-title"><div className="wrap">
    <div className="sec-h"><h2 id="mini-title">미니 프로젝트</h2></div>
    <div className="mini-grid">{miniProjects.map((item) => {
      const Thumb = item.thumb ? thumbs[item.thumb] : undefined;
      return <article key={item.id}><Link href={`/mini/${item.id}/`}>
        {Thumb && <span className="mini-thumb"><Thumb /></span>}
        <span className="pr-tag num">{miniTag(item)}</span>
        <h3>{item.title}</h3>
        <span className="mini-summary">{item.summary}</span>
        <span className="mini-tags">{item.tags.join(" · ")}</span>
        <span className="read">자세히 보기 →</span>
      </Link></article>;
    })}</div>
  </div></section>;
}

// The detail of one mini project, shared by the drawer and its own page.
export function MiniProjectBody({ item }: { item: MiniProject }) {
  return <>
    <p className="unit-stack">{item.tags.join(" · ")}</p>
    <MarkdownWithFigures>{getMiniBody(item.id)}</MarkdownWithFigures>
  </>;
}
