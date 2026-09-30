import Link from "next/link";
import { getWriting } from "@/lib/content";
export const metadata = { title: "개발 기록" };
export default function WritingPage() {
  return <section className="article"><header className="article-header"><h1>개발 기록</h1><p>만드는 과정에서 내린 판단과 검증을 남깁니다.</p></header>
    {getWriting().map((post) => <Link className="writing-row" href={`/writing/${post.slug}/`} key={post.slug}><span><strong>{post.title}</strong><span className="writing-excerpt">{post.excerpt}</span></span><span aria-hidden="true">↗</span></Link>)}
  </section>;
}
