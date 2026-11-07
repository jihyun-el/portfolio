"use client";

import { NameMark } from "@/components/name-mark";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SceneShown } from "@/lib/scene-shown";
import { MOVE_MS, askEngine, type RingPlace } from "@/lib/engine-move";

// `title` is the scene's largest line: what the unit achieved or the problem it answers, not its name.
// The line above it is the problem it answers when `contextLabel` says so. The name stays in the list. `also` lists the other addresses that show this scene, such as the details
// that open over it. `label` is what the scene belongs to: its product, or itself. `head` marks a product's own scene:
// it is what the product's name in the list opens, and it carries no number of its own. Its line above the title names
// the lead's `role` and the `team`, and `accent` is the part of its title drawn in the signal's colour.
export type FeaturedProject = {
  id: string; also?: string[]; group?: string; head?: boolean; name: string; rail?: string; label: string; period: string;
  context?: string; contextLabel?: string; title: string; accent?: string; sub?: string; line?: string; role?: string; team?: string;
  stats: { value: string; unit?: string; label: string }[];
  figure: ReactNode; actions: ReactNode;
};
// A product whose parts are scenes of their own. Its name opens the product's own scene where it has one, its first
// part's scene otherwise.
export type ProjectGroup = { id: string; name: string; lines: string[] };
// Marks for the contact links: an envelope, and GitHub's own mark (Simple Icons, CC0).
const CONTACT_MARKS: Record<string, ReactNode> = {
  Email: <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>,
  GitHub: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>,
};

// The product's parts nest, the phone holding the engine and the engine's third stage holding the pitch model, so
// moving between them dives in or steps back out. The engine's third stage is found by its number on the ring while
// it shows; until it has been seen, where it stands in the wide shot.
const NEST: Record<string, number> = { app: 0, engine: 1, model: 2 };
const STAGE03 = [0.86, 0.4];
// Where the engine's screen is wide enough to open on its ring, its own camera makes the move
// (src/components/signal-chain-3d.tsx): it dives into its third stage before the page shows the pitch model and pulls
// out of it when the page comes back; with the app, the ring lands on the engine's loop in the app's structure picture
// or lifts off it, and the two screens cross-fade there.
const directed = () => window.matchMedia("(min-width: 900px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The engine's loop in the app's structure picture, on the page; none where the app is open on another step.
function appLoop(): RingPlace | null {
  const r = document.querySelector("#featured-app .ap-loop")?.getBoundingClientRect();
  return r && r.width > 0 ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rx: r.width / 2, ry: r.height / 2 } : null;
}
// The styles that lay a screen unseen over another while it is read, as the product's screen does for the engine.
const LAID = ["position", "left", "top", "width", "height", "opacity", "pointer-events", "z-index", "transition"], CROSS_MS = 260;
function engineThird(): number[] | null {
  const box = document.querySelector<HTMLElement>("#featured-engine .stage-figure");
  const tag = box && [...box.querySelectorAll<HTMLElement>(".pano-no")].find((el) => el.textContent === "03");
  if (!box || !tag || !box.offsetParent || !(Number(tag.style.opacity) > 0.5)) return null;
  const a = box.getBoundingClientRect(), b = tag.getBoundingClientRect();
  return [(b.left + b.width / 2 - a.left) / a.width, (b.top + b.height / 2 - a.top) / a.height];
}

// A title with the words named by `accent` set apart, once, where they first stand.
function accented(title: string, accent?: string): ReactNode {
  const at = accent ? title.indexOf(accent) : -1;
  return at < 0 ? title : <>{title.slice(0, at)}<em className="stage-accent">{accent}</em>{title.slice(at + accent!.length)}</>;
}

// Server-rendered figures and links stay with their project. This boundary handles selection. `home` is the site's
// root, which the name leads back to.
export function ProjectBrowser({ name, role, fields, links, projects, groups, mini, stackCount, details, home }: {
  name: string; role: string; fields: string[]; links: { label: string; url: string }[]; projects: FeaturedProject[]; groups: ProjectGroup[];
  mini: { count: number; grid: ReactNode }; stackCount: number; details: ReactNode; home: string;
}) {
  const [selected, setSelected] = useState(projects[0].id);
  // The stack opens over the scene but stands in the list, so while it is open it is the list's current entry.
  const [stack, setStack] = useState(false);
  const root = useRef<HTMLElement>(null);
  useAppBar(root);
  // `handed` marks a change of screen the ring has already carried, which needs no zoom of its own.
  const before = useRef(selected), third = useRef<number[] | null>(null), waiting = useRef(0), handed = useRef(false);
  useEffect(() => {
    const from = before.current;
    before.current = selected;
    if (handed.current) { handed.current = false; return; }
    if (from === selected || !(from in NEST) || !(selected in NEST) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (selected === "engine" && from === "model" && directed()) { askEngine("pull"); return; }
    const box = document.querySelector<HTMLElement>(`#featured-${selected} .stage-figure`);
    if (!box) return;
    const engineToModel = (from === "engine" || selected === "engine") && (from === "model" || selected === "model");
    const at = engineToModel ? third.current ?? (window.matchMedia("(min-width: 900px)").matches ? STAGE03 : [0.5, 0.5]) : [0.5, 0.5];
    box.style.setProperty("--zx", `${(at[0] * 100).toFixed(1)}%`); box.style.setProperty("--zy", `${(at[1] * 100).toFixed(1)}%`);
    box.classList.remove("is-zoom-in", "is-zoom-out"); void box.offsetWidth;
    box.classList.add(NEST[selected] > NEST[from] ? "is-zoom-in" : "is-zoom-out");
    const done = window.setTimeout(() => box.classList.remove("is-zoom-in", "is-zoom-out"), 650);
    return () => window.clearTimeout(done);
  }, [selected]);
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(location.hash.slice(1));
      setStack(hash === "skills");
      if (hash === "mini" || hash.startsWith("mini/")) { setSelected("mini"); return; }
      const project = projects.find((item) => hash === item.id || item.also?.includes(hash));
      if (project) setSelected(project.id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("portfolio:navigate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); window.removeEventListener("portfolio:navigate", sync); };
  }, [projects]);
  const choose = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (waiting.current) return;
    if (selected === "engine") third.current = engineThird() ?? third.current;
    const go = () => { setSelected(id); history.replaceState(history.state, "", `#${id}`); window.dispatchEvent(new Event("portfolio:navigate")); };
    if (directed() && selected === "engine" && id === "model") {
      askEngine("dive");
      waiting.current = window.setTimeout(() => { waiting.current = 0; go(); }, MOVE_MS.dive - 40);
      return;
    }
    if (directed() && ((selected === "engine" && id === "app") || (selected === "app" && id === "engine")) && handOver(selected, id, go)) return;
    go();
  };
  // The engine's ring and its loop in the app's structure picture are one thing, so between the two screens the ring
  // moves onto the loop or off it. The screen being opened is laid out unseen over this one first, so the places can be
  // read. To the app: the engine's camera stands back until the ring lies on the loop, then the two screens cross-fade.
  // From the app: the engine opens with its ring on the loop, fades in there, and opens out. False where there is
  // nothing to land on (the engine on a stage, the app on another step); the page then moves as it otherwise does.
  const handOver = (from: string, to: string, go: () => void) => {
    const here = document.getElementById(`featured-${from}`), there = document.getElementById(`featured-${to}`);
    if (!here || !there || (from === "engine" && !here.querySelector(".chain3d.is-wide"))) return false;
    const loop = from === "app" ? appLoop() : null;
    if (from === "app" && !loop) return false;
    const box = here.getBoundingClientRect(), later = (ms: number, run: () => void) => window.setTimeout(run, ms);
    const undo = () => { for (const name of LAID) { there.style.removeProperty(name); here.style.removeProperty(name); } };
    const engine = to === "engine" ? there.querySelector<HTMLElement>(".chain3d") : null;
    if (engine) delete engine.dataset.ring;
    Object.assign(there.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, opacity: "0", pointerEvents: "none", zIndex: "6", transition: "none" });
    there.hidden = false;
    waiting.current = -1;
    // The two screens cross-fade; this one is hidden by the change of screen, and only then does the other leave its
    // place over it, so nothing moves.
    const cross = (then: () => void) => {
      for (const [el, to] of [[there, "1"], [here, "0"]] as const) { el.style.transition = `opacity ${CROSS_MS}ms ease-out`; el.style.opacity = to; }
      later(CROSS_MS, () => {
        handed.current = true; go();
        const settle = () => { if (!here.hidden) { requestAnimationFrame(settle); return; } undo(); waiting.current = 0; then(); };
        requestAnimationFrame(settle);
      });
    };
    if (from === "engine") {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        // The app's picture rises into place as it is shown; unseen, it is set straight at its place before it is read.
        for (const animation of there.getAnimations({ subtree: true })) { try { if (animation.effect?.getTiming().iterations !== Infinity) animation.finish(); } catch {} }
        const target = appLoop();
        if (!target) { undo(); there.hidden = true; waiting.current = 0; go(); return; }
        askEngine("land", target);
        // Cross-fade once the ring lies on the loop, however long the frames take to get it there.
        const section = here.querySelector<HTMLElement>(".chain3d"), begun = performance.now();
        const look = () => { if (section?.dataset.move === "landed" || performance.now() - begun > MOVE_MS.land + 900) cross(() => {}); else later(30, look); };
        look();
      }));
    } else {
      askEngine("lift", loop!);
      const begun = performance.now(), look = () => {
        if (engine?.dataset.ring || performance.now() - begun > 900) later(80, () => cross(() => askEngine("release")));
        else later(40, look);
      };
      look();
    }
    return true;
  };
  // The name goes back to the root: the first scene, staying, with whatever was open over it closed.
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setSelected(projects[0].id);
    history.replaceState(history.state, "", location.pathname + location.search);
    window.dispatchEvent(new Event("portfolio:navigate"));
  };
  const current = (id: string) => !stack && selected === id ? "true" : undefined;
  // The numbered scenes: every scene but a product's own.
  const numbered = projects.filter((item) => !item.head);
  const no = (i: number) => String(i + 1).padStart(2, "0");
  const choice = (project: FeaturedProject) => <a key={project.id} href={`#${project.id}`} aria-current={current(project.id)}
    aria-controls={`featured-${project.id}`} onClick={(event) => choose(event, project.id)}>
    <span className="browser-no num">{no(numbered.indexOf(project))}</span><b>{project.name}</b>{project.rail && <em>{project.rail}</em>}
  </a>;
  // A group takes the place of its first part and holds all of them under its name.
  const entries = projects.flatMap((project, i) => {
    if (!project.group) return [choice(project)];
    if (projects[i - 1]?.group === project.group) return [];
    const group = groups.find((item) => item.id === project.group)!;
    return [<div className="browser-group" role="group" aria-label={group.name} key={group.id}>
      <a className="browser-group-head" href={`#${project.id}`} aria-current={project.head ? current(project.id) : undefined} aria-controls={`featured-${project.id}`} onClick={(event) => choose(event, project.id)}><b>{group.name}</b>{group.lines.map((line) => <em key={line}>{line}</em>)}</a>
      {projects.filter((item) => item.group === group.id && !item.head).map(choice)}
    </div>];
  });
  // A phone's folded bar says where the reader is in a line under the name: the screen's number and name, and a short
  // bar for each numbered screen with the current one dark, the product's parts kept together. Pressing it opens the
  // list.
  const at = stack ? -1 : selected === "mini" ? numbered.length : numbered.findIndex((item) => item.id === selected);
  const lead = projects.find((item) => item.id === selected && item.head), leadGroup = lead && groups.find((item) => item.id === lead.group);
  const now = stack ? "기술 스택" : at === numbered.length ? "미니 프로젝트" : at >= 0 ? numbered[at].name : leadGroup?.name ?? lead?.name ?? "";
  const kinds = [...numbered.map((item) => item.group ?? ""), "mini"];
  const peek = <button type="button" className="browser-peek" aria-controls="browser-list" aria-expanded="false" aria-label={`프로젝트 목록 · 지금 ${now}`}>
    <span className="browser-peek-now">{at >= 0 && <i className="num">{no(at)}</i>}<b>{now}</b></span>
    <span className="browser-peek-bars" aria-hidden="true">{kinds.map((kind, i) => <i key={i} className={[
      i === at ? "is-on" : lead && kind === lead.group ? "is-lead" : "", i > 0 && (kind !== kinds[i - 1] || !kind) ? "is-break" : ""].join(" ").trim() || undefined} />)}</span>
    <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </button>;
  return <section className="wrap project-browser" id="about" ref={root} aria-label="소개와 대표 프로젝트">
    <noscript><style>{"html:has(.project-browser){overflow:auto}.project-browser{height:auto}.browser-scenes>article[hidden]{display:grid!important}.browser-scenes>article{min-height:700px;margin-bottom:40px}.browser-main{overflow:visible}"}</style></noscript>
    <aside className="browser-side">
      <div className="browser-identity"><div className="browser-id-row"><h1><a className="browser-home" href={home} onClick={goHome}>{name}<NameMark /></a></h1><ThemeToggle /></div><p>{role}</p><p className="browser-fields">{fields.join(" · ")}</p>{peek}</div>
      <nav className="browser-choices" id="browser-list" aria-label="대표 프로젝트 선택">
        {entries}
        <a href="#mini" aria-current={current("mini")} aria-controls="featured-mini" onClick={(event) => choose(event, "mini")}>
          <span className="browser-no num">{no(numbered.length)}</span><b>미니 프로젝트</b><em>{mini.count}개 프로젝트</em>
        </a>
        {/* The stack is no project: it has no number and opens over the scene, as the resources below do. */}
        <a className="browser-stack" href="#skills" aria-current={stack ? "true" : undefined}><b>기술 스택</b><em>{stackCount}개 기술</em></a>
      </nav>
      <nav className="browser-resources" aria-label="이력과 기록"><a href="#card">이력</a><a className="is-stack" href="#skills">기술 스택</a><a href="#writing">글</a><a href="#commits">개발 기록</a></nav>
      <div className="browser-contact">{links.map((link) => <a href={link.url} key={link.url} {...(link.url.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{CONTACT_MARKS[link.label]}{link.label} ↗</a>)}</div>
    </aside>
    <div className="browser-main" id="projects">
      <div className="browser-scenes">
      {projects.map((project) => <article className={project.head ? "stage stage-product" : "stage"} id={`featured-${project.id}`} key={project.id} hidden={selected !== project.id} aria-labelledby={`featured-title-${project.id}`}>
        <header className="stage-head" id={project.id}>
          <p className="stage-kicker num">{project.head ? <><b>{project.label}</b>{project.role && <strong>{project.role}</strong>}</> : <><b>{no(numbered.indexOf(project))}</b><span>{project.label}</span></>}<span>{project.period}</span>{project.team && <span>{project.team}</span>}</p>
          {project.context && <p className="stage-context">{project.contextLabel && <b>{project.contextLabel}</b>}{project.context}</p>}
          <h2 className="stage-title" id={`featured-title-${project.id}`}>{accented(project.title, project.accent)}</h2>
          {(project.sub || project.line) && <div className="stage-copy">{project.sub && <p className="stage-sub">{project.sub}</p>}{project.line && <p className="stage-line">{project.line}</p>}</div>}
          {project.stats.length > 0 && <ul className="stage-stats">{project.stats.map((item) => <li key={item.label}>{item.label.includes("{value}") ? <span className="stage-said">{item.label.split("{value}").flatMap((piece, i) => i ? [<b key={i} className="num">{item.value}{item.unit}</b>, piece] : [piece])}</span>
            : <><b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span></>}</li>)}</ul>}
          <div className="stage-actions">{project.actions}</div>
        </header>
        <div className="browser-figure stage-figure"><SceneShown.Provider value={selected === project.id}>{project.figure}</SceneShown.Provider></div>
      </article>)}
      <article className="stage stage-mini" id="featured-mini" hidden={selected !== "mini"} aria-labelledby="featured-title-mini">
        <header className="stage-head" id="mini"><p className="stage-kicker num"><b>{no(numbered.length)}</b><span>{mini.count}개 프로젝트</span></p><h2 className="stage-title" id="featured-title-mini">미니 프로젝트</h2></header>
        <div className="browser-figure stage-figure browser-mini">{mini.grid}</div>
      </article>
      </div>
      {details}
    </div>
  </section>;
}

// An app bar for every layout. The name row and the way back always stay on screen; what slides away depends on
// which of the two rails has moved to the top. Where the site's rail lies over the scene in a tall window, where it
// folds into a strip, its rows under the name slide away. Where a detail is narrow enough that its place bar runs
// across the top, the detail's head slides away as well, and that bar, which then holds the way back, stays under the
// name. Where both rails stand at the side nothing moves. Scrolling down slides them by as much as the text moved,
// scrolling up brings them back, and a stop settles them all the way out or in; the detail's foot slides down out of
// the way with them. The text area keeps its size throughout; only the bars move. A new screen or detail shows them
// again, and so does a window that changes width, or a key that moves the focus into a bar that slid away.
// A phone keeps only the name row and, over a scene, a thin line under it that says where the reader is and opens the
// list; the list folds up under them. It is open on a first arrival, so the reader sees what the site holds, and folds
// at the first scroll or touch, or 2.5 seconds after the landing has handed over to the engine (after arriving, where
// the first screen is another). From then on it opens when that line is tapped, the text is scrolled back up or the
// focus moves into it, and folds when the text is scrolled down or another screen is chosen. Open over a scene, the
// scene stands under it and moves up with it, keeping its size; over a detail it lies over the text, and the detail's
// head and place bar move down under it. The detail's head slides with the text as on the other layouts.
const PHONE = "(max-width:680px)", OVER = `${PHONE}, (max-aspect-ratio:5/4)`;
const PEEK_MS = 2500, FOLD_MS = 240, OPEN_PX = 32, SHUT_PX = 6;
function useAppBar(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const phone = window.matchMedia(PHONE), over = window.matchMedia(OVER), last = new WeakMap<Element, number>();
    let shift = 0, total = 0, settle = 0, down = false;
    // The phone's list: whether it is open, how far it folds, the run of scrolling in one direction that moves it,
    // until when a scroll is only the page settling after it moved, and the first arrival's showing of it.
    let open = false, list = 0, run = 0, quiet = 0, peek: "" | "wait" | "time" = "", peekAt = 0, fold = 0, timer = 0, tap = 0;
    const px = (name: string, value: number) => el.style.setProperty(name, `${Math.round(value)}px`);
    const flag = (name: string, on: boolean) => { if (on) el.dataset[name] = ""; else delete el.dataset[name]; };
    const pane = () => el.querySelector<HTMLElement>(".drawer-inline:not(.is-leaving)");
    const apply = () => {
      const folded = phone.matches ? !open : shift < 0;
      flag("collapsed", folded); px("--bar-shift", shift); el.style.setProperty("--bar-hide", total ? (-shift / total).toFixed(3) : "0");
      px("--push", phone.matches && open ? list : 0); px("--side-shift", phone.matches && !open ? -list : 0);
      el.querySelector(".browser-peek")?.setAttribute("aria-expanded", String(phone.matches && open));
    };
    const measure = () => {
      const here = pane();
      const bar = el.querySelector<HTMLElement>(".browser-side"), name = bar?.querySelector<HTMLElement>(".browser-identity");
      // What stays: on a phone the name row (with the line under it over a scene); in a strip its whole first row (the
      // name, the resources, the contact), which ends where the list starts. Folded, it gets as much room under it as
      // it has above (`pad`), which opens only as the rest slides away, so the unfolded bar keeps its size.
      const choices = bar?.querySelector<HTMLElement>(".browser-choices"), style = bar ? getComputedStyle(bar) : null;
      const side = over.matches ? bar?.offsetHeight ?? 0 : 0, head = here?.querySelector<HTMLElement>(".drawer-h")?.offsetHeight ?? 0;
      let row = 0, pad = 0;
      if (over.matches && name && style) {
        if (phone.matches || !choices) { const own = getComputedStyle(name); row = name.offsetTop + name.offsetHeight; pad = Math.max(0, parseFloat(own.paddingTop) - parseFloat(own.paddingBottom)); }
        else { row = choices.offsetTop - (parseFloat(style.rowGap) || 0); pad = parseFloat(style.paddingTop) || 0; }
      }
      const keep = row + pad;
      px("--side-h", side); px("--keep-h", keep); px("--head-h", head); px("--keep-row", row); px("--keep-pad", pad);
      px("--foot-h", here?.querySelector<HTMLElement>(".drawer-f")?.offsetHeight ?? 0);
      const rail = here?.querySelector<HTMLElement>(".dv-rail"), across = !!rail && getComputedStyle(rail).getPropertyValue("--across").trim() === "1";
      px("--rail-h", rail?.offsetHeight ?? 0);
      // On a phone only the detail's head rides with the text; the list folds on its own.
      list = phone.matches ? Math.max(0, side - keep) : 0;
      total = Math.max(0, (phone.matches ? 0 : side - keep) + (across ? head : 0)); shift = Math.max(shift, -total); apply();
      flag("bar", true); flag("ride", over.matches || across); flag("across", across);
    };
    const show = () => { delete el.dataset.snap; shift = 0; apply(); requestAnimationFrame(measure); };
    // The phone's list opens or folds as a whole. A scene under it moves with it, which can move its scroll too, so
    // the scrolling that follows for as long as it moves is not read as the reader's. A detail's text does not move.
    const setOpen = (to: boolean) => {
      if (open === to) return;
      open = to; run = 0; quiet = pane() ? 0 : performance.now() + FOLD_MS + 60;
      el.dataset.fold = ""; window.clearTimeout(fold); fold = window.setTimeout(() => { delete el.dataset.fold; }, FOLD_MS + 40);
      apply();
    };
    const stopPeek = () => { peek = ""; window.clearTimeout(timer); };
    const peekFor = () => { peek = "time"; peekAt = performance.now(); window.clearTimeout(timer); timer = window.setTimeout(() => { peek = ""; setOpen(false); }, PEEK_MS); };
    const onScroll = (event: Event) => {
      const box = event.target;
      if (!(box instanceof HTMLElement) || !box.matches(".browser-main,.drawer-body")) return;
      // A bounce past either end is not a scroll back.
      const end = Math.max(0, box.scrollHeight - box.clientHeight);
      const top = Math.min(end, Math.max(0, box.scrollTop)), before = last.get(box) ?? top, move = top - before;
      last.set(box, top);
      if (phone.matches && (!move || performance.now() < quiet)) return;
      delete el.dataset.snap;
      // Near the top the bars stay attached to the text, so no empty strip ever opens above it.
      shift = Math.min(0, Math.max(-total, shift - move, -top));
      if (move) down = move > 0;
      if (phone.matches) {
        run = Math.sign(move) === Math.sign(run) ? run + move : move;
        if (open && run > SHUT_PX && top > 0) { stopPeek(); setOpen(false); }
        else if (!open && !peek && run < -OPEN_PX) setOpen(true);
      }
      apply();
      window.clearTimeout(settle);
      // A stop settles the bars the way the text was last moving.
      settle = window.setTimeout(() => {
        const to = down && top >= total ? -total : 0;
        if (to !== shift) { el.dataset.snap = ""; shift = to; apply(); }
      }, 160);
    };
    // A new screen folds the phone's list, but the landing's own move to the engine keeps the first showing of it.
    const onNavigate = () => {
      if (phone.matches) {
        if (peek === "wait" && !pane()) peekFor();
        else if (!(peek === "time" && performance.now() - peekAt < 300 && !pane())) { stopPeek(); setOpen(false); }
      }
      show();
    };
    // The first touch folds the first showing of the list, once what it pressed has acted; a link is left to move on.
    const onPress = (event: PointerEvent) => {
      if (!phone.matches || !peek) return;
      stopPeek();
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(".browser-side,a")) return;
      window.clearTimeout(tap); tap = window.setTimeout(() => setOpen(false), 250);
    };
    const onClick = (event: globalThis.MouseEvent) => {
      if (!phone.matches || !(event.target instanceof Element) || !event.target.closest(".browser-peek")) return;
      stopPeek(); setOpen(!open);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !phone.matches || !open) return;
      stopPeek(); setOpen(false);
      if (document.activeElement?.closest(".browser-choices,.browser-resources,.browser-contact")) el.querySelector<HTMLElement>(".browser-peek")?.focus();
    };
    // A slid-away bar is only moved, not hidden, so a focused link in it would sit off screen.
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      if (phone.matches && !open && event.target.closest(".browser-choices,.browser-resources,.browser-contact")) { stopPeek(); setOpen(true); }
      if (shift < 0 && event.target.closest(".browser-side,.drawer-h,.drawer-f")) show();
    };
    // Only the width: a phone's toolbar changes the height while the text scrolls.
    let width = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== width) { width = window.innerWidth; show(); } };
    const onMedia = () => { stopPeek(); open = false; show(); };
    const sized = new ResizeObserver(measure), changed = new MutationObserver(() => { measure(); sized.disconnect(); for (const part of el.querySelectorAll(".browser-side,.drawer-h,.drawer-f,.dv-rail")) sized.observe(part); });
    changed.observe(el.querySelector(".browser-main") ?? el, { childList: true, subtree: true });
    for (const part of el.querySelectorAll(".browser-side")) sized.observe(part);
    const signs = ["hashchange", "popstate", "portfolio:navigate"];
    el.addEventListener("scroll", onScroll, { capture: true, passive: true });
    el.addEventListener("focusin", onFocus);
    el.addEventListener("pointerdown", onPress, { capture: true });
    el.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    for (const sign of signs) window.addEventListener(sign, onNavigate);
    for (const media of [phone, over]) media.addEventListener("change", onMedia);
    // The first arrival: the root's landing moves on to the engine by itself, and the list stays open until it has.
    if (phone.matches && !pane()) {
      open = true;
      if (!location.hash && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) peek = "wait"; else peekFor();
    }
    measure();
    // Moves are eased only once the bar stands where it starts.
    const live = requestAnimationFrame(() => requestAnimationFrame(() => flag("live", true)));
    return () => {
      for (const id of [settle, fold, timer, tap]) window.clearTimeout(id);
      cancelAnimationFrame(live); sized.disconnect(); changed.disconnect();
      for (const name of ["bar", "ride", "across", "live", "fold"]) flag(name, false);
      el.removeEventListener("scroll", onScroll, { capture: true });
      el.removeEventListener("focusin", onFocus);
      el.removeEventListener("pointerdown", onPress, { capture: true });
      el.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      for (const sign of signs) window.removeEventListener(sign, onNavigate);
      for (const media of [phone, over]) media.removeEventListener("change", onMedia);
    };
  }, [ref]);
}
