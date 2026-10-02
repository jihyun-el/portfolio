import type { Metadata } from "next";
import { SignalChain } from "@/components/signal-chain";

export const metadata: Metadata = { title: "신호 흐름", robots: { index: false } };

export default function FlowPage() {
  return <div className="wrap flow-page"><SignalChain /></div>;
}
