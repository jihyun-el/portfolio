import Link from "next/link";
import { Panel, PanelContent, PanelHeader, PanelTitle, PanelTitleSup } from "@/components/panel";
import { getWriting, profile, projects } from "@/lib/content";
import { TechStack } from "@/components/stack";
import { CommitActivity, CommitTimeline } from "@/components/history";
import { ClassicMateMap, VqaProgress } from "@/components/project-figures";

export default function HomePage() {
  const writing = getWriting();
  return <>
    <section className="profile-block" aria-labelledby="profile-name">
      <div className="profile-pattern" aria-hidden="true" />
      <div className="profile-top"><div className="profile-mark" aria-hidden="true">우</div><span className="profile-location">대한민국 · Asia/Seoul</span></div>
      <div className="profile-copy"><h1 id="profile-name">{profile.name}</h1><p className="headline">{profile.headline}</p></div>
    </section>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="about"><PanelHeader><PanelTitle>소개</PanelTitle></PanelHeader><PanelContent>
      {profile.introduction.map((paragraph) => <p className="intro-paragraph" key={paragraph}>{paragraph}</p>)}
      {profile.links.length > 0 && <div className="profile-links">{profile.links.map((link) => <a key={link.url} href={link.url}>{link.label}</a>)}</div>}
    </PanelContent></Panel>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="projects"><PanelHeader><PanelTitle>프로젝트<PanelTitleSup>({projects.length})</PanelTitleSup></PanelTitle></PanelHeader>
      {projects.map((project) => <details className="project-item" key={project.id} open={project.defaultOpen}>
        <summary><span className="project-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4" /></svg></span><span className="project-heading"><span className="project-title">{project.title}</span><span className="project-period">{project.period}</span></span><span className="chevron" aria-hidden="true">⌄</span></summary>
        <div className="project-body"><p className="project-role">{project.role}</p><p>{project.summary}</p><p className="outcome">{project.outcome}</p>
          {project.id === "classicmate" ? <ClassicMateMap /> : <VqaProgress compact />}
          <ul className="tags" aria-label="사용 기술">{project.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
          {project.parts && <ul className="project-parts">{project.parts.map((part) => <li key={part.id}><Link href={`/projects/${project.id}/#${part.id}`}><strong>{part.title}</strong><span>{part.description}</span><span className="part-arrow" aria-hidden="true">↗</span></Link></li>)}</ul>}
          <Link className="read-link" href={`/projects/${project.id}/`}>설계와 검증 과정 읽기<span aria-hidden="true">↗</span></Link>
        </div>
      </details>)}
    </Panel>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="skills"><PanelHeader><PanelTitle>기술 스택</PanelTitle></PanelHeader><PanelContent><TechStack /></PanelContent></Panel>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="commits"><PanelHeader><PanelTitle>개발 커밋</PanelTitle></PanelHeader><PanelContent><CommitActivity /><CommitTimeline compact /></PanelContent></Panel>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="writing"><PanelHeader><PanelTitle>개발 기록</PanelTitle></PanelHeader>
      {writing.map((post) => <Link className="writing-row" href={`/writing/${post.slug}/`} key={post.slug}><span><strong>{post.title}</strong><span className="writing-excerpt">{post.excerpt}</span></span><span aria-hidden="true">↗</span></Link>)}
    </Panel>
    <div className="stripe-divider" aria-hidden="true" />
    <Panel id="experience"><PanelHeader><PanelTitle>경험</PanelTitle></PanelHeader><PanelContent>
      {profile.experiences.map((experience) => <div className="experience-item" key={experience.title}><div><h3>{experience.title}</h3><span className="muted">{experience.period}</span></div><p>{experience.description}</p></div>)}
    </PanelContent></Panel>
  </>;
}
