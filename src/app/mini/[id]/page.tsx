import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { miniProjects } from "@/lib/content";
import { MiniProjectBody, miniTag } from "@/components/mini-projects";

// The standalone page for links that point straight at a mini project. From the home page the same
// content opens in a drawer instead (see components/drawer.tsx).
export const dynamicParams = false;
export function generateStaticParams() { return miniProjects.map(({ id }) => ({ id })); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = miniProjects.find((entry) => entry.id === id);
  return { title: item?.title, description: item?.summary };
}
export default async function MiniProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = miniProjects.find((entry) => entry.id === id);
  if (!item) notFound();
  return <article className="article"><Link className="back-link" href="/#mini">미니 프로젝트</Link><header className="article-header"><h1>{item.title}</h1><p>{miniTag(item)}</p></header><MiniProjectBody item={item} /></article>;
}
