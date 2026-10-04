import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { profile, getSiteUrl, sitePath } from "@/lib/content";
import { ThemeToggle } from "@/components/theme-toggle";
import { Reveal } from "@/components/reveal";
import "katex/dist/katex.min.css";
import "./globals.css";

// GitHub's mark (Octicons mark-github), shown before a GitHub link in the footer.
const GITHUB_MARK = "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const pretendard = localFont({ src: "../../public/fonts/PretendardVariable.woff2", variable: "--font-pretendard", weight: "100 900", display: "swap" });
const siteUrl = getSiteUrl();
export const metadata: Metadata = {
  title: { default: `${profile.name} | AI/ML 포트폴리오`, template: `%s | ${profile.name}` },
  description: [profile.role, ...profile.heroLines].join(" · "),
  ...(siteUrl ? { metadataBase: new URL(`${siteUrl}/`) } : {}),
  icons: { icon: sitePath("/favicon.svg") },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('portfolio-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}` }} /></head>
    <body className={pretendard.variable}>
      <a className="skip-link" href="#main-content">본문으로 이동</a>
      <header className="topbar"><div className="wrap top">
        <Link className="brand" href="/"><b>{profile.name}</b><span>{profile.subtitle}</span></Link>
        <nav className="nav" aria-label="주 메뉴"><Link href="/#projects">프로젝트</Link><Link href="/#writing">트러블슈팅</Link><Link href="/#skills">기술</Link><Link href="/#commits">커밋</Link><ThemeToggle /></nav>
      </div></header>
      <main id="main-content">{children}</main>
      <footer className="contact" id="contact"><div className="wrap">
        <h2>읽어 주셔서 감사합니다.</h2>
        {profile.links.length > 0 && <div className="links">{profile.links.map((link) => <a key={link.url} href={link.url}>{link.url.startsWith("https://github.com/") && <svg viewBox="0 0 16 16" aria-hidden="true"><path d={GITHUB_MARK} fill="currentColor" /></svg>}<b>{link.label}</b>{link.url.replace(/^(https:\/\/|mailto:)/, "")}</a>)}</div>}
        <div className="foot"><span>© 2026 {profile.name}</span></div>
      </div></footer>
      <Reveal />
    </body>
  </html>;
}
