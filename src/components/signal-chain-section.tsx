"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { StageResults } from "@/components/signal-chain-3d";

// The panorama sits open under the engine's head and plays on its own. three.js is large, so it is
// fetched when the reader comes near; until then its place is held empty.
const hold = <div className="pano-hold" aria-hidden="true" />;
const SignalChain3D = dynamic(() => import("@/components/signal-chain-3d").then((m) => m.SignalChain3D), { ssr: false, loading: () => hold });

export function SignalChainSection({ title, solo, results, note, project }: { title?: string; solo?: boolean; results?: StageResults; note?: string; project?: string }) {
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const seen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); seen.disconnect(); } }, { rootMargin: "1600px 0px" });
    seen.observe(ref.current!);
    return () => seen.disconnect();
  }, []);
  return <div className="part-inside" id="signal-chain" ref={ref}>
    {near ? <SignalChain3D title={title} solo={solo} results={results} note={note} project={project} /> : hold}
  </div>;
}
