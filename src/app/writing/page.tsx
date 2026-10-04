import Link from "next/link";
import { getWriting } from "@/lib/content";
export const metadata = { title: "트러블슈팅" };
export default function WritingPage() {
  return <section className="article"><header className="article-header"><h1>트러블슈팅</h1><p>개발하면서 부딪힌 문제와 해결을 남깁니다.</p></header>
    {getWriting().map((post) => <Link className="writing-row" href={`/writing/${post.slug}/`} key={post.slug}><span><strong>{post.title}</strong><span className="writing-excerpt">{post.excerpt}</span></span><span aria-hidden="true">↗</span></Link>)}
  </section>;
}
