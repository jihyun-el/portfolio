import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { profile, getSiteUrl, sitePath } from "@/lib/content";
import { ThemeToggle } from "@/components/theme-toggle";
import { Reveal } from "@/components/reveal";
import "./globals.css";

const pretendard = localFont({ src: "../../public/fonts/PretendardVariable.woff2", variable: "--font-pretendard", weight: "100 900", display: "swap" });
const siteUrl = getSiteUrl();
export const metadata: Metadata = {
  title: { default: `${profile.name} | AI/ML 포트폴리오`, template: `%s | ${profile.name}` },
  description: profile.headline,
  ...(siteUrl ? { metadataBase: new URL(`${siteUrl}/`) } : {}),
  icons: { icon: sitePath("/favicon.svg") },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('portfolio-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}` }} /></head>
    <body className={pretendard.variable}>
      <a className="skip-link" href="#main-content">본문으로 이동</a>
      <header className="wrap top">
        <Link className="brand" href="/"><b>{profile.name}</b><span>{profile.subtitle}</span></Link>
        <nav className="nav" aria-label="주 메뉴"><Link href="/#skills">기술</Link><Link href="/#projects">프로젝트</Link><Link href="/#commits">커밋</Link><Link href="/writing/">기록</Link><ThemeToggle /></nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="contact" id="contact"><div className="wrap">
        <p className="eyebrow">Contact</p>
        <h2><span className="l thin">읽어 주셔서</span><span className="l black">감사합니다.</span></h2>
        {profile.links.length > 0 && <div className="links">{profile.links.map((link) => <a key={link.url} href={link.url}><b>{link.label}</b>{link.url.replace(/^(https:\/\/|mailto:)/, "")}</a>)}</div>}
        <div className="foot"><a href="https://github.com/ncdai/chanhdai.com">Chanh Dai 기반 · MIT</a><span>© 2026 {profile.name}</span></div>
      </div></footer>
      <Reveal />
    </body>
  </html>;
}
