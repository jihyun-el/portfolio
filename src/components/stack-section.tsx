import { stack } from "@/lib/content";
import type { CaseView } from "@/lib/showcase";
import icons from "@/lib/brand-icons.json";

type MarkPath = string | { d: string; paper: true };
type Mark = string | { viewBox: string; transform?: string; paths: MarkPath[] };

// A technology's logo in the text colour, so it follows the light and dark themes. A string is one
// 24×24 path from Simple Icons (CC0); an object carries a mark in its own coordinates, where a
// `paper` path is filled with the page colour to cover what lies behind it.
function Logo({ icon }: { icon?: string }) {
  const mark = icon ? (icons as Record<string, Mark>)[icon] : undefined;
  if (!mark) return <span className="stack-logo" aria-hidden="true" />;
  const { viewBox, transform, paths }: { viewBox: string; transform?: string; paths: MarkPath[] } = typeof mark === "string" ? { viewBox: "0 0 24 24", paths: [mark] } : mark;
  return <svg className="stack-logo" viewBox={viewBox} aria-hidden="true"><g transform={transform} fill="currentColor">{paths.map((path, i) => typeof path === "string" ? <path key={i} d={path} /> : <path key={i} d={path.d} fill="var(--paper)" />)}</g></svg>;
}

// The tech stack in three sizes, so the main field reads first: large cells for the main field,
// compact lists for the other fields, one line for the remaining tools.
export function StackSection({ units }: { units: CaseView[] }) {
  const unitOf = (entry: { projectId: string; part?: string }) => units.find((unit) => unit.projectId === entry.projectId && unit.part === entry.part)!;
  // A language leads the group it is mostly used in.
  const groups = stack.groups.map((group) => ({ ...group, items: [...stack.languages.filter((language) => language.group === group.title).map((language) => ({ ...language, mode: undefined })), ...group.items] }));
  const tier = (name: string) => groups.filter((group) => group.tier === name);
  return <section className="sec" id="skills" aria-labelledby="skills-title"><div className="wrap">
    <div className="sec-h"><h2 id="skills-title">기술 스택</h2></div>
    {tier("main").map((group) => <section className="stack-main" key={group.title}><h3>{group.title}</h3>
      <ul>{group.items.map((item) => <li key={item.name}><Logo icon={item.icon} /><b>{item.name}</b><p>{item.description}</p><a href={`#${unitOf(item).anchor}`}>{unitOf(item).short} ↑</a></li>)}</ul>
    </section>)}
    <div className="stack-sub">{tier("sub").map((group) => <section key={group.title}><h3>{group.title}</h3>
      <ul>{group.items.map((item) => <li key={item.name}><Logo icon={item.icon} /><b>{item.name}</b><span>{item.description}</span></li>)}</ul>
    </section>)}</div>
    {tier("tool").map((group) => <p className="stack-tool" key={group.title}><b>{group.title}</b>
      {group.items.map((item) => <span key={item.name}>{item.icon && <Logo icon={item.icon} />}{item.mode ? `${item.name} (${item.mode})` : item.name}</span>)}
    </p>)}
  </div></section>;
}
