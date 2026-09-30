import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { profile, getSiteUrl, sitePath } from "@/lib/content";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geist = localFont({
  src: [
    { path: "../../public/fonts/Geist-Medium.ttf", weight: "500" },
    { path: "../../public/fonts/Geist-SemiBold.ttf", weight: "600" },
  ],
  variable: "--font-geist",
  display: "swap",
});
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
    <body className={`${geist.variable} ${pretendard.variable}`}>
      <a className="skip-link" href="#main-content">본문으로 이동</a>
      <header className="site-header"><div className="header-inner">
        <Link className="wordmark" href="/">{profile.name}</Link>
        <nav aria-label="주 메뉴"><Link href="/#projects">프로젝트</Link><Link href="/writing/">기록</Link><ThemeToggle /></nav>
      </div></header>
      <main className="page-shell" id="main-content">{children}</main>
      <footer className="site-footer"><div className="footer-inner">
        <span>{profile.name}</span>
        <a href="https://github.com/ncdai/chanhdai.com">Chanh Dai 기반</a>
      </div></footer>
    </body>
  </html>;
}
