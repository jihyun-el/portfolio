import Link from "next/link";
import { projects, stack } from "@/lib/content";

export function TechStack() {
  return <div className="stack-groups">{stack.map((group) => <section className="stack-group" key={group.title}>
    <h3>{group.title}</h3><dl className="stack-grid">{group.items.map((item) => <div className="stack-item" key={item.name}>
      <dt>{item.name}{item.mode && <span className="stack-mode">{item.mode}</span>}</dt>
      <dd><p>{item.description}</p><Link href={`/projects/${item.projectId}/${item.part ? `#${item.part}` : ""}`}>
        {projects.find((project) => project.id === item.projectId)?.id === "classicmate" ? "클래식메이트" : "VQA"}에서 적용</Link></dd>
    </div>)}</dl>
  </section>)}</div>;
}
