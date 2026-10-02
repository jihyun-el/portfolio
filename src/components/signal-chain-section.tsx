"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// three.js is large, so the panorama is fetched only when the reader scrolls near it.
const SignalChain3D = dynamic(() => import("@/components/signal-chain-3d").then((m) => m.SignalChain3D), { ssr: false, loading: () => <div className="chain-lazy" /> });

// Sits inside the engine part of the ClassicMate project, so it is a block, not a page section.
export function SignalChainSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const seen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); seen.disconnect(); } }, { rootMargin: "800px 0px" });
    seen.observe(ref.current!);
    return () => seen.disconnect();
  }, []);
  return <div className="part-inside" id="signal-chain" ref={ref}>{near ? <SignalChain3D /> : <div className="chain-lazy" />}</div>;
}
