"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { BUILD_MS, DIVE_MS, ProductAssembly, type AssemblyPart, type Dive, type RingPlace } from "@/components/product-assembly";

// The product's own screen: the four parts its lead engineer built, put together in light, each named with what it
// does and leading to its screen. A reader who arrives at the root of the site sees this first, while the engine's 3D
// is fetched behind it. When the parts are together the picture dives into the engine's ring until it lies on the ring
// the engine's screen opens on, and the two screens cross-fade there; a link to the engine from this screen goes the
// same way. It moves on by itself unless the reader goes somewhere else first; a pointer resting on it, a wheel or a
// touch does not hold it. A reduced-motion setting keeps it, and the product's name in the list always brings it back
// to stay.
export type ProductPart = AssemblyPart;
const STAY_MS = BUILD_MS + 3000, CROSS_MS = 800, WAIT_MS = 1600, SETTLE_MS = 200;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The styles that lay the engine's screen unseen over this one while it draws.
const OVER = ["position", "left", "top", "width", "height", "opacity", "pointer-events", "z-index", "transition"];

export function ProductLanding({ engine, model, app, pipeline, score }: { engine: ProductPart; model: ProductPart; app: ProductPart; pipeline: ProductPart; score: string }) {
  const root = useRef<HTMLDivElement>(null), going = useRef(false), steps = useRef<number[]>([]), undo = useRef<() => void>(() => {});
  const [leaving, setLeaving] = useState(false), [dive, setDive] = useState<Dive | null>(null);

  // To the engine's screen: lay it out unseen over this one so its 3D draws the ring where it will stand, read where
  // that ring is, dive until this picture's ring lies on it, then cross-fade the two screens and hand over the address.
  const handover = useCallback(() => {
    const here = root.current?.closest("article"), there = document.getElementById(`featured-${engine.id}`);
    if (going.current || !here || !there) return;
    going.current = true;
    const later = (ms: number, run: () => void) => steps.current.push(window.setTimeout(run, ms));
    const box = here.getBoundingClientRect();
    Object.assign(there.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, opacity: "0", pointerEvents: "none", zIndex: "6", transition: "none" });
    there.hidden = false;
    undo.current = () => { for (const name of OVER) there.style.removeProperty(name); delete here.dataset.fade; };
    const ring = (): RingPlace | null => {
      const v = there.querySelector<HTMLElement>(".chain3d")?.dataset.ring?.split(",").map(Number);
      return v && v.length === 4 && v.every(Number.isFinite) ? { cx: v[0], cy: v[1], rx: v[2], ry: v[3] } : null;
    };
    const begun = performance.now();
    const look = () => {
      const waited = performance.now() - begun, drawn = !!there.querySelector("canvas.chain-gl");
      // A narrow screen opens the engine on a stage, not on the ring; there the dive goes to the middle.
      if (ring() || (drawn && waited > 500) || waited > WAIT_MS) later(SETTLE_MS, start); else later(50, look);
    };
    const start = () => {
      setDive({ at: performance.now(), to: ring() });
      later(DIVE_MS, () => {
        there.style.transition = `opacity ${CROSS_MS}ms ease-out`; there.style.opacity = "1"; here.dataset.fade = "out";
        later(CROSS_MS, () => {
          history.replaceState(history.state, "", `#${engine.id}`);
          window.dispatchEvent(new Event("portfolio:navigate"));
          // The engine's screen leaves its place over this one only once this one is hidden, so nothing moves.
          const settle = () => {
            if (!here.hidden) { requestAnimationFrame(settle); return; }
            undo.current(); undo.current = () => {};
            setDive(null); setLeaving(false); going.current = false;
          };
          requestAnimationFrame(settle);
        });
      });
    };
    look();
  }, [engine.id]);
  useEffect(() => () => { steps.current.forEach((step) => window.clearTimeout(step)); undo.current(); }, []);

  useEffect(() => {
    // Only a first arrival at the root moves on by itself: an address that names a screen is shown as asked.
    if (location.hash || !root.current?.offsetParent || still()) return;
    let timer = 0, kept = false;
    // Only going somewhere else holds it: a link, the list, the address.
    const signs = ["hashchange", "portfolio:navigate"];
    const release = () => { for (const sign of signs) window.removeEventListener(sign, stay); };
    const stay = () => { kept = true; window.clearTimeout(timer); release(); setLeaving(false); };
    for (const sign of signs) window.addEventListener(sign, stay);
    // The engine's 3D is the large download of the site; it is fetched while this screen is read.
    const fetched = import("@/components/signal-chain-3d").then(() => undefined, () => undefined);
    setLeaving(true);
    timer = window.setTimeout(() => fetched.then(() => {
      if (kept || location.hash || !root.current?.offsetParent) return;
      release(); handover();
    }), STAY_MS);
    return () => { window.clearTimeout(timer); release(); };
  }, [handover]);

  // A plain press on a link to the engine takes the same way; other presses (a new tab, a reduced-motion setting) are
  // left to the link.
  const toEngine = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || still()) return;
    event.preventDefault(); handover();
  };

  return <div className="pm" ref={root}>
    <ProductAssembly score={score} parts={{ engine, model, app, pipeline }} dive={dive}
      label={`${pipeline.name}이 조판한 악보에서 음표가 빛이 되어 ${app.name}의 휴대폰 안으로 날아들고, 가수의 목소리가 음높이 곡선으로 들어와 ${model.name}의 음높이 분포를 밝히며, 그 위에서 ${engine.name}의 빛점 고리가 선율에 맞춰 뛴다.`}>
      {(kind, item) => <a className="pm-part" href={`#${item.id}`} onClick={kind === "engine" ? toEngine : undefined}>
        <span className="pm-name"><i className="num">{item.no}</i><b>{item.name}</b></span>
        {/* The line breaks only between its items, each keeping the dot that follows it. */}
        <span className="pm-line">{item.line.split(" · ").flatMap((piece, i, all) => [i > 0 ? " " : null, <span key={piece}>{piece}{i < all.length - 1 && " ·"}</span>])}</span>
      </a>}
    </ProductAssembly>
    <p className="pm-foot"><a className="pm-go" href={`#${engine.id}`} onClick={toEngine}>{engine.name} 보기<i aria-hidden="true">→</i>{leaving && <span className="pm-bar" style={{ animationDuration: `${STAY_MS}ms` }} aria-hidden="true" />}</a></p>
  </div>;
}
