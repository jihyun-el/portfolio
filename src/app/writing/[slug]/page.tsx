import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { HomeRedirect } from "@/components/home-redirect";
import { getWriting, sitePath } from "@/lib/content";
// A post taken down whose address was already handed out still answers: it takes the reader to the part of the home
// it belonged to. The address is in applications already sent, so it must not turn into a missing page.
const RETIRED: Record<string, { place: string; name: string; href: string }> = {
  "missing-data": { place: "classicmate/pipeline", name: "ClassicMate 악보 파이프라인", href: "/projects/classicmate/#pipeline" },
};
export const dynamicParams = false;
export function generateStaticParams() { return [...getWriting().map(({ slug }) => ({ slug })), ...Object.keys(RETIRED).map((slug) => ({ slug }))]; }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getWriting().find((item) => item.slug === slug);
  return post ? { title: post.title, description: post.excerpt } : { title: RETIRED[slug]?.name };
}
export default async function WritingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getWriting().find((item) => item.slug === slug);
  const retired = RETIRED[slug];
  if (!post && retired) {
    // As on a project's old address: the inline script moves an address typed or followed from outside before
    // anything is drawn, the component one reached by a link inside the site; without scripts the link stays.
    const base = sitePath("/").replace(/\/$/, ""), places = { "": retired.place };
    const go = `location.replace(${JSON.stringify(`${base}/#${retired.place}`)})`;
    return <article className="article">
      <script dangerouslySetInnerHTML={{ __html: go }} />
      <HomeRedirect base={base} places={places} />
      <p><Link href={retired.href}>{retired.name}</Link></p>
    </article>;
  }
  if (!post) notFound();
  return <article className="article"><Link className="back-link" href="/writing/">트러블슈팅 목록</Link><header className="article-header"><h1>{post.title}</h1></header><Markdown>{post.body}</Markdown></article>;
}
