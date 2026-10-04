import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { sitePath } from "@/lib/content";

// Ranges like "30~60ms … 50~109번" are common in the posts; GFM would pair single tildes into strikethrough.
const gfm: [typeof remarkGfm, { singleTilde: boolean }] = [remarkGfm, { singleTilde: false }];

export function Markdown({ children }: { children: string }) {
  return <div className="prose"><ReactMarkdown remarkPlugins={[gfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
    a: ({ href, children }) => <a href={href?.startsWith("/") && !href.startsWith("//") ? sitePath(href) : href}>{children}</a>,
    img: ({ src, alt }) => <img src={typeof src === "string" && src.startsWith("/") && !src.startsWith("//") ? sitePath(src) : src} alt={alt || ""} loading="lazy" />,
  }}>{children}</ReactMarkdown></div>;
}
