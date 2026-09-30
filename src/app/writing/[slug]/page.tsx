import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { getWriting } from "@/lib/content";
export const dynamicParams = false;
export function generateStaticParams() { return getWriting().map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getWriting().find((item) => item.slug === slug);
  return { title: post?.title, description: post?.excerpt };
}
export default async function WritingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getWriting().find((item) => item.slug === slug);
  if (!post) notFound();
  return <article className="article"><Link className="back-link" href="/writing/">개발 기록 목록</Link><header className="article-header"><h1>{post.title}</h1></header><Markdown>{post.body}</Markdown></article>;
}
