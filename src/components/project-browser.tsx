"use client";

import { useEffect, useState, type ReactNode, type MouseEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

// `title` is the scene's largest line: what the unit achieved or the problem it answers, not its name.
// The line above it is the problem it answers when `contextLabel` says so. The name stays in the list. `also` lists the other addresses that show this scene, such as the details
// that open over it. `label` is what the scene belongs to: its product, or itself. `head` marks a product's own scene:
// it is what the product's name in the list opens, and it carries no number of its own.
export type FeaturedProject = {
  id: string; also?: string[]; group?: string; head?: boolean; name: string; rail?: string; label: string; period: string;
  context?: string; contextLabel?: string; title: string; sub?: string; line?: string;
  stats: { value: string; unit?: string; label: string }[];
  figure: ReactNode; actions: ReactNode;
};
// A product whose parts are scenes of their own. Its name opens the product's own scene where it has one, its first
// part's scene otherwise.
export type ProjectGroup = { id: string; name: string; lines: string[] };
// Marks for the contact links: an envelope, and GitHub's own mark (Simple Icons, CC0).
const CONTACT_MARKS: Record<string, ReactNode> = {
  Email: <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>,
  GitHub: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>,
};

// Server-rendered figures and links stay with their project. This boundary handles selection.
export function ProjectBrowser({ name, role, fields, links, projects, groups, mini, stackCount, details }: {
  name: string; role: string; fields: string[]; links: { label: string; url: string }[]; projects: FeaturedProject[]; groups: ProjectGroup[];
  mini: { count: number; grid: ReactNode }; stackCount: number; details: ReactNode;
}) {
  const [selected, setSelected] = useState(projects[0].id);
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(location.hash.slice(1));
      if (hash === "mini" || hash.startsWith("mini/")) { setSelected("mini"); return; }
      const project = projects.find((item) => hash === item.id || item.also?.includes(hash));
      if (project) setSelected(project.id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("portfolio:navigate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); window.removeEventListener("portfolio:navigate", sync); };
  }, [projects]);
  const choose = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setSelected(id);
    history.replaceState(history.state, "", `#${id}`);
    window.dispatchEvent(new Event("portfolio:navigate"));
  };
  // The numbered scenes: every scene but a product's own.
  const numbered = projects.filter((item) => !item.head);
  const no = (i: number) => String(i + 1).padStart(2, "0");
  const choice = (project: FeaturedProject) => <a key={project.id} href={`#${project.id}`} aria-current={selected === project.id ? "true" : undefined}
    aria-controls={`featured-${project.id}`} onClick={(event) => choose(event, project.id)}>
    <span className="browser-no num">{no(numbered.indexOf(project))}</span><b>{project.name}</b>{project.rail && <em>{project.rail}</em>}
  </a>;
  // A group takes the place of its first part and holds all of them under its name.
  const entries = projects.flatMap((project, i) => {
    if (!project.group) return [choice(project)];
    if (projects[i - 1]?.group === project.group) return [];
    const group = groups.find((item) => item.id === project.group)!;
    return [<div className="browser-group" role="group" aria-label={group.name} key={group.id}>
      <a className="browser-group-head" href={`#${project.id}`} aria-current={project.head && selected === project.id ? "true" : undefined} aria-controls={`featured-${project.id}`} onClick={(event) => choose(event, project.id)}><b>{group.name}</b>{group.lines.map((line) => <em key={line}>{line}</em>)}</a>
      {projects.filter((item) => item.group === group.id && !item.head).map(choice)}
    </div>];
  });
  return <section className="wrap project-browser" id="about" aria-label="소개와 대표 프로젝트">
    <noscript><style>{"html:has(.project-browser){overflow:auto}.project-browser{height:auto}.browser-scenes>article[hidden]{display:grid!important}.browser-scenes>article{min-height:700px;margin-bottom:40px}.browser-main{overflow:visible}"}</style></noscript>
    <aside className="browser-side">
      <div className="browser-identity"><div className="browser-id-row"><h1>{name}</h1><ThemeToggle /></div><p>{role}</p><p className="browser-fields">{fields.join(" · ")}</p></div>
      <nav className="browser-choices" aria-label="대표 프로젝트 선택">
        {entries}
        <a href="#mini" aria-current={selected === "mini" ? "true" : undefined} aria-controls="featured-mini" onClick={(event) => choose(event, "mini")}>
          <span className="browser-no num">{no(numbered.length)}</span><b>미니 프로젝트</b><em>{mini.count}개 프로젝트</em>
        </a>
        {/* The stack is no project: it has no number and opens over the scene, as the resources below do. */}
        <a className="browser-stack" href="#skills"><b>기술 스택</b><em>{stackCount}개 기술</em></a>
      </nav>
      <nav className="browser-resources" aria-label="이력과 기록"><a href="#card">이력</a><a className="is-stack" href="#skills">기술 스택</a><a href="#writing">글</a><a href="#commits">개발 기록</a></nav>
      <div className="browser-contact">{links.map((link) => <a href={link.url} key={link.url} {...(link.url.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{CONTACT_MARKS[link.label]}{link.label} ↗</a>)}</div>
    </aside>
    <div className="browser-main" id="projects">
      <div className="browser-scenes">
      {projects.map((project) => <article className="stage" id={`featured-${project.id}`} key={project.id} hidden={selected !== project.id} aria-labelledby={`featured-title-${project.id}`}>
        <header className="stage-head" id={project.id}>
          <p className="stage-kicker num">{project.head ? <b>{project.label}</b> : <><b>{no(numbered.indexOf(project))}</b><span>{project.label}</span></>}<span>{project.period}</span></p>
          {project.context && <p className="stage-context">{project.contextLabel && <b>{project.contextLabel}</b>}{project.context}</p>}
          <h2 className="stage-title" id={`featured-title-${project.id}`}>{project.title}</h2>
          {(project.sub || project.line) && <div className="stage-copy">{project.sub && <p className="stage-sub">{project.sub}</p>}{project.line && <p className="stage-line">{project.line}</p>}</div>}
          {project.stats.length > 0 && <ul className="stage-stats">{project.stats.map((item) => <li key={item.label}><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></li>)}</ul>}
          <div className="stage-actions">{project.actions}</div>
        </header>
        <div className="browser-figure stage-figure">{project.figure}</div>
      </article>)}
      <article className="stage stage-mini" id="featured-mini" hidden={selected !== "mini"} aria-labelledby="featured-title-mini">
        <header className="stage-head" id="mini"><p className="stage-kicker num"><b>{no(numbered.length)}</b><span>{mini.count}개 프로젝트</span></p><h2 className="stage-title" id="featured-title-mini">미니 프로젝트</h2></header>
        <div className="browser-figure stage-figure browser-mini">{mini.grid}</div>
      </article>
      </div>
      {details}
    </div>
  </section>;
}
