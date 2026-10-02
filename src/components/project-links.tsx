import type { Project } from "@/lib/content";

// Public pages of a shipped project, such as its store listings. They open outside the portfolio.
export function ProjectLinks({ project }: { project: Project }) {
  if (!project.links?.length) return null;
  return <p className="project-links">{project.links.map((link) => <a className="read" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</p>;
}
