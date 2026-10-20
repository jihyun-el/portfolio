"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type DrawerPanel = { key: string; group: string; kicker: string; title: string; body: ReactNode };

// With `inline`, project and writing details slide into the home's right pane.
// Closing reveals the selected overview again. The key lives in the URL hash
// (#classicmate/engine), which makes a drawer shareable and lets Back close it.
// Links to the standalone pages are caught here, so they still work without JavaScript.
// `routes` maps a standalone page address, written "project#fragment", to the drawer that holds it.
export function DrawerHost({ panels, basePath, routes, inline = false }: { panels: DrawerPanel[]; basePath: string; routes: Record<string, string>; inline?: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [displayedKey, setDisplayedKey] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const pushed = useRef(false), returnFocus = useRef<HTMLElement | null>(null), returnHash = useRef("");
  // A post opened from inside a detail goes back to that detail, at the part the reader was on: `from` holds that
  // place while the post is open.
  const from = useRef<{ key: string; part: string | null } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const byKey = useRef(new Map(panels.map((panel) => [panel.key, panel])));

  // Keep the departing pane mounted long enough to reveal the overview beneath it.
  // A new selection cancels an unfinished exit, and reduced motion returns immediately.
  useEffect(() => {
    if (openKey) { setDisplayedKey(openKey); setLeaving(false); return; }
    if (!displayedKey) return;
    setLeaving(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    const timer = window.setTimeout(() => { setDisplayedKey(null); setLeaving(false); }, duration);
    return () => window.clearTimeout(timer);
  }, [openKey, displayedKey]);

  const keyFor = useCallback((href: string): [string, string | null] | null => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return null;
    const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || "/" : url.pathname;
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (path === "/" || path === "") return byKey.current.has(fragment) ? [fragment, null] : null;
    const project = path.match(/^\/projects\/([a-z0-9-]+)\/?$/);
    if (project) {
      const id = project[1], key = routes[`${id}#${fragment}`] ?? `${id}/overview`;
      // A fragment that is not the part itself (io-contract, commits) is scrolled to inside the drawer.
      const anchor = fragment && key !== `${id}/${fragment}` ? fragment : null;
      return byKey.current.has(key) ? [key, anchor] : null;
    }
    // A troubleshooting post or a mini project: the drawer key is the page address itself.
    const page = path.match(/^\/((?:writing|mini)\/[a-z0-9-]+)\/?$/);
    return page && byKey.current.has(page[1]) ? [page[1], null] : null;
  }, [basePath, routes]);

  const open = useCallback((key: string, anchor: string | null) => {
    const wasOpen = byKey.current.has(decodeURIComponent(location.hash.slice(1)));
    if (!wasOpen) { returnFocus.current = document.activeElement as HTMLElement | null; returnHash.current = location.hash; }
    // Moving between drawers replaces the entry, so one Back always returns to the page.
    if (wasOpen) history.replaceState(history.state, "", `#${key}`);
    else { history.pushState(history.state, "", `#${key}`); pushed.current = true; }
    window.dispatchEvent(new Event("portfolio:navigate"));
    setTarget(anchor);
    setOpenKey(key);
  }, []);

  const close = useCallback(() => {
    const place = from.current;
    from.current = null;
    if (place && byKey.current.has(place.key)) {
      history.replaceState(history.state, "", `#${place.key}`);
      window.dispatchEvent(new Event("portfolio:navigate"));
      setTarget(place.part);
      setOpenKey(place.key);
      return;
    }
    if (pushed.current) { pushed.current = false; history.back(); }
    else { history.replaceState(history.state, "", location.pathname + location.search); setOpenKey(null); }
  }, []);

  // Open from the address on arrival, and follow Back and Forward.
  useEffect(() => {
    const sync = () => {
      const key = decodeURIComponent(location.hash.slice(1)), found = byKey.current.has(key);
      if (!found) { pushed.current = false; from.current = null; }
      setTarget(null);
      setOpenKey(found ? key : null);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("portfolio:navigate", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); window.removeEventListener("portfolio:navigate", sync); };
  }, []);

  // Catch internal links before the router sees them.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      const found = keyFor(link.href);
      if (!found) return;
      const detail = link.closest<HTMLElement>(".drawer .dv"), here = decodeURIComponent(location.hash.slice(1));
      // From a post to another post the place is kept; a post opened from anywhere else has no detail to go back to.
      if (found[0].startsWith("writing/") && detail && byKey.current.has(here)) from.current = { key: here, part: link.closest("[data-spy]")?.id ?? null };
      else if (!found[0].startsWith("writing/") || !here.startsWith("writing/")) from.current = null;
      event.preventDefault();
      event.stopPropagation();
      open(found[0], found[1]);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [keyFor, open]);

  useEffect(() => {
    if (!openKey) return;
    if (!inline) document.documentElement.classList.add("drawer-open");
    closeRef.current?.focus({ preventScroll: true });
    const body = bodyRef.current;
    if (body) body.scrollTop = 0;
    // A unit's record shows one step at a time; the event lets it bring the linked step forward first.
    // Only once the pane on screen is the one asked for: before that its text is not there to be scrolled or turned.
    if (target && displayedKey === openKey) requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("portfolio:anchor", { detail: target }));
      body?.querySelector(`#${CSS.escape(target)},[data-anchor="${CSS.escape(target)}"]`)?.scrollIntoView({ block: "start" });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (!inline && event.key === "Tab") {
        // Keep focus inside the drawer while it is open.
        const items = [...document.querySelectorAll<HTMLElement>(".drawer a[href],.drawer button,.drawer [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey, displayedKey, target, close, inline]);

  useEffect(() => {
    if (displayedKey) return;
    document.documentElement.classList.remove("drawer-open");
    if (location.hash === returnHash.current) returnFocus.current?.focus?.({ preventScroll: true });
    returnFocus.current = null;
  }, [displayedKey]);

  if (!displayedKey) return null;
  const panel = byKey.current.get(displayedKey)!;
  const siblings = panels.filter((item) => item.group === panel.group);
  const index = siblings.indexOf(panel), prev = siblings[index - 1], next = siblings[index + 1];
  return <>
    {!inline && <div className="drawer-back" onClick={close} aria-hidden="true" />}
    <aside key={displayedKey} className={`drawer${inline ? " drawer-inline" : ""}${leaving ? " is-leaving" : ""}`} role={inline ? "region" : "dialog"} aria-modal={inline ? undefined : true} aria-hidden={leaving ? true : undefined} aria-labelledby="drawer-title">
      <header className="drawer-h">
        <div><p className="drawer-kicker">{panel.kicker}</p><h2 id="drawer-title">{panel.title}</h2></div>
        <button ref={closeRef} type="button" className="drawer-close" onClick={close}>{inline ? "← 돌아가기" : <>닫기 <span aria-hidden="true">✕</span></>}</button>
      </header>
      <div className="drawer-body" ref={bodyRef}>{panel.body}</div>
      {siblings.length > 1 && <footer className="drawer-f">
        {prev ? <button type="button" onClick={() => open(prev.key, null)}>← {prev.title}</button> : <span />}
        {next ? <button type="button" onClick={() => open(next.key, null)}>{next.title} →</button> : <span />}
      </footer>}
    </aside>
  </>;
}
