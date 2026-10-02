import type { Metadata } from "next";
import { SignalChain3D } from "@/components/signal-chain-3d";

export const metadata: Metadata = { title: "신호 흐름 3D 시안", robots: { index: false } };

export default function Flow3DPage() {
  return <div className="wrap flow-page"><SignalChain3D /></div>;
}
