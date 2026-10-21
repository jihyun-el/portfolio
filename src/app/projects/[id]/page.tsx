import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, sitePath } from "@/lib/content";
import { getDetail } from "@/lib/details";
import { caseViews } from "@/lib/showcase";
import { BackLink } from "@/components/back-link";
import { DetailPanel } from "@/components/detail-panel";
import { HomeRedirect } from "@/components/home-redirect";

// The address a project had before the home became one screen. It still answers. A reader with scripts is taken to
// the home, to the scene or the detail the address named; without scripts the same detail text is read here. A
// project has one text, the one in content/details, so this page and the home cannot say different things.
export const dynamicParams = false;
export function generateStaticParams() { return projects.map(({ id }) => ({ id })); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  return { title: project?.title, description: project?.summary };
}
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();
  const views = caseViews().filter((view) => view.projectId === id);
  const whole = getDetail(project.parts?.length ? project.id : views[0].id);
  const parts = (project.parts ?? []).map((part) => ({ part, detail: getDetail(part.id), view: views.find((item) => item.part === part.id)!, key: `${id}/${part.id}` }));
  const base = sitePath("/").replace(/\/$/, "");
  const assets = { base, sign: sitePath("/images/vqa-question-sign.jpg") };
  // Where each fragment of this address lives on the home: nothing named is the project's scene, a part its detail,
  // a card or a step the detail that holds it.
  const places: Record<string, string> = { "": id, commits: "commits" };
  const hold = (detail: typeof whole, key: string) => { for (const anchor of [...detail.cards.map((card) => card.id), ...detail.steps.map((step) => `${detail.id}-${step.step}`)]) places[anchor] = key; };
  hold(whole, `${id}/overview`);
  for (const item of parts) { places[item.part.id] = item.key; hold(item.detail, item.key); }
  if (parts.some((item) => item.part.id === "engine")) places["io-contract"] = `${id}/engine`;
  const go = `(function(){var p=${JSON.stringify(places)},f=decodeURIComponent(location.hash.slice(1));location.replace(${JSON.stringify(`${base}/#`)}+(p[f]||p[""]))})()`;
  return <article className="article article-detail">
    <script dangerouslySetInnerHTML={{ __html: go }} />
    <HomeRedirect base={base} places={places} />
    <BackLink />
    <header className="article-header"><h1>{whole.title}</h1></header>
    <DetailPanel detail={whole} name={project.short} kind={project.parts?.length ? "classicmate" : "vqa"} assets={assets} />
    {parts.map(({ part, detail, view }) => <section className="project-part-section" id={part.id} key={part.id}>
      <h2>{detail.title}</h2>
      <DetailPanel detail={detail} name={view.short} kind={part.id as "engine" | "model" | "app" | "pipeline"} assets={assets} />
    </section>)}
  </article>;
}
