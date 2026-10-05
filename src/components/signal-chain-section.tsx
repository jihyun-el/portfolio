"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useRef, useState } from "react";

// The panorama sits open under the engine card's header and plays on its own. three.js is large, so it is
// fetched when the reader comes near; until then, and without JavaScript, a still of the first
// scene holds its place.
const still = <div className="pano-poster" aria-hidden="true" />;
const SignalChain3D = dynamic(() => import("@/components/signal-chain-3d").then((m) => m.SignalChain3D), { ssr: false, loading: () => still });

export function SignalChainSection({ poster }: { poster: string }) {
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const seen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); seen.disconnect(); } }, { rootMargin: "1600px 0px" });
    seen.observe(ref.current!);
    return () => seen.disconnect();
  }, []);
  return <div className="part-inside" id="signal-chain" ref={ref} style={{ "--poster": `url(${poster})` } as CSSProperties}>
    {near ? <SignalChain3D /> : still}
  </div>;
}
