import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { profile } from "@/lib/content";
import { HomePage } from "@/components/home-page";

// The same home under another title, one address per title (content/profile.json `roles`), so an application can link
// the one it applies for. Nothing else differs.
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(profile.roles).map((role) => ({ role }));
}
export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const title = profile.roles[(await params).role];
  return title ? { title: { absolute: `${profile.name} | ${title} 포트폴리오` }, description: [title, ...profile.heroLines].join(" · ") } : {};
}
export default async function RolePage({ params }: { params: Promise<{ role: string }> }) {
  const title = profile.roles[(await params).role];
  if (!title) notFound();
  return <HomePage role={title} at={`/${(await params).role}/`} />;
}
