"use client";

import { useEffect } from "react";

// A reader who came in at a title's address keeps it as the home: on the site's other pages a link to the root leads
// back to that address, as the name and the way back already do on the home itself. Opening the root forgets it.
const KEY = "portfolio-home";
export function TitleHome({ base, titles }: { base: string; titles: string[] }) {
  useEffect(() => {
    const root = `${base}/`, homes = titles.map((title) => `${base}/${title}/`);
    try {
      if (homes.includes(location.pathname)) sessionStorage.setItem(KEY, location.pathname);
      else if (location.pathname === root || location.pathname === base) sessionStorage.removeItem(KEY);
    } catch {}
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target) return;
      let home: string | null = null;
      try { home = sessionStorage.getItem(KEY); } catch {}
      if (!home || location.pathname === home) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || (url.pathname !== root && url.pathname !== base)) return;
      event.preventDefault(); event.stopPropagation();
      location.assign(home + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [base, titles]);
  return null;
}
