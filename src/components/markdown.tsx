import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sitePath } from "@/lib/content";

export function Markdown({ children }: { children: string }) {
  return <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href?.startsWith("/") && !href.startsWith("//") ? sitePath(href) : href}>{children}</a>,
    img: ({ src, alt }) => <img src={typeof src === "string" && src.startsWith("/") && !src.startsWith("//") ? sitePath(src) : src} alt={alt || ""} loading="lazy" />,
  }}>{children}</ReactMarkdown></div>;
}
