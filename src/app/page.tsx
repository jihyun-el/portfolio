import Link from "next/link";
import { getWriting, profile, projects, sitePath } from "@/lib/content";
import { caseViews, statViews } from "@/lib/showcase";
import { CommitActivity, CommitTimeline } from "@/components/history";
import { StackSection } from "@/components/stack-section";
import { ProjectSection } from "@/components/project-section";
import { PageMap, type MapItem } from "@/components/page-map";
import { DrawerHost, type DrawerPanel } from "@/components/drawer";
import { Markdown } from "@/components/markdown";
import { ProjectBody, ProjectCommits } from "@/components/project-detail";
import { ClassicMateMap } from "@/components/project-figures";
import { UnitCard } from "@/components/unit-card";
import { countWord } from "@/components/showcase-parts";

export default function HomePage() {
  const writing = getWriting();
  const parts = caseViews();
  const outline: MapItem[] = [
    { id: "about", label: "첫 화면", level: 1 },
    ...projects.flatMap((project): MapItem[] => [
      { id: project.id, label: project.short, level: 1 },
      ...parts.filter((part) => part.projectId === project.id).flatMap((part): MapItem[] => [
        { id: part.anchor, label: part.title, level: 2 },
        ...(part.part === "engine" ? [{ id: "signal-chain", label: "소리가 들어와 반주가 되기까지", level: 3 } as MapItem] : []),
      ]),
    ]),
    { id: "writing", label: "트러블슈팅", level: 1 },
    { id: "skills", label: "기술 스택", level: 1 },
    { id: "commits", label: "개발 커밋", level: 1 },
    { id: "contact", label: "연락", level: 1 },
  ];
  // Links to a project, a unit or a post open in a drawer instead of a new page. On the home page
  // itself a unit's details open inside its card; the drawer holds the same card fully open.
  const panels: DrawerPanel[] = [
    ...projects.flatMap((project): DrawerPanel[] => {
      const own = parts.filter((part) => part.projectId === project.id);
      const single = project.parts?.length ? null : own[0];
      return [
        { key: `${project.id}/overview`, group: project.id, kicker: project.parts?.length ? `${project.short} · 전체` : project.short, title: project.title, body: <>
          {single ? <UnitCard unit={single} mode="drawer" /> : <><ClassicMateMap /><ProjectBody project={project} /></>}
          <ProjectCommits project={project} />
        </> },
        ...(project.parts ?? []).map((part, i, all): DrawerPanel => {
          const view = own.find((item) => item.part === part.id)!;
          return { key: `${project.id}/${part.id}`, group: project.id, kicker: `${project.short} · 파트 ${i + 1} / ${all.length}`, title: part.title, body: <UnitCard unit={view} mode="drawer" /> };
        }),
      ];
    }),
    ...writing.map((post): DrawerPanel => ({ key: `writing/${post.slug}`, group: "writing", kicker: "트러블슈팅", title: post.title, body: <Markdown>{post.body}</Markdown> })),
  ];
  const routes: Record<string, string> = { "classicmate#io-contract": "classicmate/engine" };
  for (const project of projects) for (const part of project.parts ?? []) routes[`${project.id}#${part.id}`] = `${project.id}/${part.id}`;
  // Which unit a post belongs to, shown as a tag on the troubleshooting list.
  const unitOf = (slug: string) => parts.find((part) => part.troubles.some((post) => post.slug === slug))?.short;
  return <>
    <PageMap items={outline} after="about" />
    <DrawerHost panels={panels} routes={routes} basePath={sitePath("/").replace(/\/$/, "")} />
    <section className="wrap hero" id="about">
      <div>
        <p className="hero-id reveal"><b>{profile.name}</b></p>
        <h1 className="reveal black" style={{ animationDelay: ".05s" }}>{profile.role}</h1>
        <p className="hero-sub reveal" style={{ animationDelay: ".18s" }}>{profile.heroLines.join(" · ")}</p>
        <div className="hero-actions reveal" style={{ animationDelay: ".45s" }}><a className="cta" href="#projects">프로젝트 보기 ↓</a><a className="cta ghost" href="#skills">기술 스택 ↓</a></div>
      </div>
      <aside className="card reveal" style={{ animationDelay: ".4s" }} aria-label="개발자 카드">
        <div className="card-h"><span>DEVELOPER CARD</span><span className="num">2026</span></div>
        <dl>
          {profile.card.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          {profile.experiences.map((experience) => <div key={experience.title}><dt>경험</dt><dd>{experience.title}<small className="num">{experience.period}</small></dd></div>)}
        </dl>
      </aside>
    </section>
    <section className="wrap stats" aria-label="대표 결과">
      {statViews().map((stat, i) => <a className="stat reveal" key={stat.label} href={`#${stat.anchor}`} style={{ animationDelay: `${i * 0.08}s` }}>
        <b className="num">{stat.value}{stat.unit && <small>{stat.unit}</small>}</b><span>{stat.label}</span><i>{stat.context} ↓</i>
      </a>)}
    </section>
    <div id="projects">{projects.map((project, i) => <ProjectSection key={project.id} project={project} index={i} total={projects.length} parts={parts.filter((part) => part.projectId === project.id)} />)}</div>
    <section className="sec" id="writing"><div className="wrap">
      <div className="sec-h"><h2>트러블슈팅</h2><p>개발하면서 부딪힌 문제와 해결 {countWord(writing.filter((post) => post.onHome).length)} 편</p></div>
      <div className="pr-grid">{writing.filter((post) => post.onHome).map((post, i) => <article className="reveal" key={post.slug} style={{ animationDelay: `${i * 0.1}s` }}>
        {unitOf(post.slug) && <p className="pr-tag">{unitOf(post.slug)}</p>}
        <h3><Link href={`/writing/${post.slug}/`}>{post.title}</Link></h3><p>{post.excerpt}</p>
        <Link className="read" href={`/writing/${post.slug}/`}>글 읽기 →</Link>
      </article>)}</div>
    </div></section>
    <StackSection units={parts} />
    <section className="sec" id="commits"><div className="wrap">
      <div className="sec-h"><h2>개발 커밋</h2><p>저장소별 월간 커밋과 주요 변경</p></div>
      <CommitActivity />
      <CommitTimeline compact />
    </div></section>
  </>;
}
