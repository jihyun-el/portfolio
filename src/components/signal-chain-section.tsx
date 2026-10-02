"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// three.js is large and the panorama moves on its own, so it stays a still poster until
// the reader asks for it. It sits on the home page right under the engine row.
const SignalChain3D = dynamic(() => import("@/components/signal-chain-3d").then((m) => m.SignalChain3D), { ssr: false, loading: () => <div className="pano-poster is-loading" aria-hidden="true" /> });

export function SignalChainSection({ poster }: { poster: string }) {
  const [play, setPlay] = useState(false);
  return <div className="part-inside" id="signal-chain">
    {play ? <SignalChain3D /> : <button type="button" className="pano-poster" style={{ backgroundImage: `linear-gradient(90deg,rgba(5,5,5,.92) 0,rgba(5,5,5,.6) 38%,rgba(5,5,5,.1) 75%),url(${poster})` }} onClick={() => setPlay(true)}>
      <span className="pano-play" aria-hidden="true">▶</span>
      <span><b>소리가 들어와 반주가 되기까지</b><span>반주 엔진의 열 단계를 한 장면으로 재생합니다 · 예시 연주</span></span>
    </button>}
  </div>;
}
