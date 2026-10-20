import type { ReactNode } from "react";
import { sitePath } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import { MarkdownWithFigures } from "@/components/project-detail";
import { VqaSolution } from "@/components/project-figures";
import { ProjectLinks } from "@/components/project-links";
import { StepBrowser, type Step } from "@/components/step-browser";
import { Line } from "@/components/unit-card";

const FIGURE = /<!--\s*figure:([a-z-]+)\s*-->/;

// The home pane for a unit: what was owned and what came of it stay on top, and the record
// below is browsed one step at a time. The standalone page keeps the full text (UnitCard).
export function UnitSteps({ unit, commits }: { unit: CaseView; commits?: ReactNode }) {
  const steps: Step[] = [
    ...(unit.id === "vqa" ? [{ group: "요약", label: "최종 솔루션", figure: <VqaSolution />, anchors: [] }] : []),
    ...unit.hardest.map((item): Step => ({ group: "제일 어려웠던 것", label: item.title, body: <p>{item.body}</p>, anchors: [] })),
    ...unit.work.map((item): Step => {
      // The first figure of a step moves up next to its one-line summary.
      const marker = item.body.match(FIGURE)?.[0];
      const text = marker ? item.body.replace(marker, "") : item.body;
      return {
        group: "한 일", label: item.label, mark: item.line.match(/\*\*(.+?)\*\*/)?.[1], lead: <Line>{item.line}</Line>,
        figure: marker && <MarkdownWithFigures>{marker}</MarkdownWithFigures>,
        body: text.trim() && <MarkdownWithFigures>{text}</MarkdownWithFigures>,
        anchors: [item.anchor, item.body.includes("figure:block-contract") && "io-contract"].filter((name): name is string => Boolean(name)),
      };
    }),
    ...(unit.troubles.length ? [{ group: "글", label: "트러블슈팅", body: <ul className="trouble">{unit.troubles.map((post) => <li key={post.slug}><a href={sitePath(`/writing/${post.slug}/`)}><b>{post.title}</b></a></li>)}</ul>, anchors: [] }] : []),
    ...(unit.result?.body ? [{ group: "결과", label: "결과 상세", lead: <Line>{unit.result.line}</Line>, body: <MarkdownWithFigures>{unit.result.body}</MarkdownWithFigures>, anchors: [] }] : []),
    ...(commits ? [{ group: "결과", label: "설계가 코드로 바뀐 기록", body: commits, anchors: ["commits"] }] : []),
  ];
  return <div className="unit-steps">
    <header className="unit-lead">
      <div><p className="unit-line">{unit.overview}</p><p className="unit-tag num">{unit.tag} · {unit.stack.join(" · ")}</p></div>
      {(unit.results.length > 0 || unit.store) && <div className="unit-lead-out">
        {unit.results.length > 0 && <ul className="result-nums">{unit.results.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
        {unit.store && <ProjectLinks project={unit.store} named />}
      </div>}
    </header>
    <StepBrowser steps={steps} />
  </div>;
}
