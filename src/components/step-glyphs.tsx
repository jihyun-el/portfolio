// Symbols for the processing steps between the stages of the signal chain. Each is line art in the current colour;
// the panorama drives the moving parts through CSS: --level (what is flowing), --gain (the coupling pull),
// data-state (the active Forward state) and .is-firing (an event just happened).
import type { ReactNode } from "react";
import { CnnGlyph } from "@/components/showcase-parts";

const sine = (x0: number, x1: number, y: number, amp: number, cycles: number) => {
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, i) => `${i ? "L" : "M"}${(x0 + (x1 - x0) * i / steps).toFixed(1)} ${(y - amp * Math.sin(2 * Math.PI * cycles * i / steps)).toFixed(1)}`).join(" ");
};
const bell = (c: number) => `M${c - 15} 40 C${c - 8} 40 ${c - 6} 10 ${c} 10 C${c + 6} 10 ${c + 8} 40 ${c + 15} 40`;
const head = (x: number, y: number) => `M${x - 5} ${y - 3} L${x} ${y} L${x - 5} ${y + 3}`;
// Fixed scatter for the particle symbol.
const PARTICLES = [[8, 12], [14, 30], [20, 20], [26, 36], [30, 9], [34, 26], [40, 16], [43, 33], [12, 22], [24, 14], [37, 38], [46, 22]];

const GLYPHS: (() => ReactNode)[] = [
  // VQT front end: a wave becomes one new column of pitch bins; older columns stay as they were.
  () => <>
    <path d={sine(4, 40, 23, 9, 1.5)} />
    <g className="glyph-faint">{[50, 58, 66].map((x) => <path key={x} d={`M${x} 6 V40`} strokeDasharray="2 3" />)}</g>
    <g className="glyph-live">{[10, 18, 26, 12, 6, 20, 14, 8].map((width, i) => <rect key={i} x={76} y={6 + i * 4.5} width={width * 0.7} height={2.4} fill="currentColor" stroke="none" />)}</g>
  </>,
  () => null,
  // Observation: a bell-shaped window around each written note; the sung pitch fills the one it lands in.
  () => <>
    <path d="M4 40 H92" className="glyph-faint" />
    <path d={bell(22)} className="glyph-faint" /><path d={bell(74)} className="glyph-faint" />
    <path d={bell(48)} className="glyph-live" />
    <path d="M48 40 V6" className="glyph-live" strokeDasharray="2 2" />
  </>,
  // HSMM Forward: states in score order, each with a duration loop; the lit state only moves on evidence.
  () => <>
    <g className="glyph-states">{[12, 36, 60, 84].map((x) => <circle key={x} cx={x} cy={28} r={6.5} />)}</g>
    {[12, 36, 60, 84].map((x) => <path key={x} className="glyph-faint" d={`M${x - 4} 22 C${x - 7} 9 ${x + 7} 9 ${x + 4} 22`} />)}
    {[12, 36, 60].map((x) => <g key={x}><path d={`M${x + 8} 28 H${x + 16}`} /><path d={head(x + 16, 28)} /></g>)}
  </>,
  // Confirmation, tempo agent and playhead: anchors jump as stairs, the playhead glides over them.
  () => <>
    <path d="M4 40 H24 V31 H44 V22 H64 V13 H82" className="glyph-faint" />
    <path d="M4 42 C30 38 52 24 88 9" className="glyph-live" />
    <circle cx={88} cy={9} r={3} fill="currentColor" stroke="none" />
  </>,
  // Particle filter: tempo guesses gather onto the median when the playhead crosses a note.
  () => <>
    <g className="glyph-particles">{PARTICLES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />)}</g>
    <path d="M56 23 H66" className="glyph-faint" /><path d={head(66, 23)} className="glyph-faint" />
    <path d="M80 40 V8" className="glyph-live" /><circle cx={80} cy={8} r={3} fill="currentColor" stroke="none" />
  </>,
  // Coupling: the tempo carries the accompaniment on; a dashed pull toward the playhead fades without evidence.
  () => <>
    <path d="M4 12 C38 12 46 23 70 23" />
    <path d="M4 34 C38 34 46 23 70 23" className="glyph-gain" strokeDasharray="3 3" />
    <path d="M70 23 H90" /><path d={head(90, 23)} />
  </>,
  // Scheduler: a chord fires once the position plus 50 ms passes its start.
  () => <>
    <path d="M4 32 H92" className="glyph-faint" />
    {[16, 50, 80].map((x) => <rect key={x} x={x} y={20} width={9} height={8} className={x === 50 ? "glyph-live" : "glyph-faint"} />)}
    <path d="M40 8 V40" /><path d="M40 12 H50" strokeDasharray="2 2" /><path d={head(50, 12)} />
  </>,
  // Synthesis: the chord's notes add up to one waveform.
  () => <>
    <path d={sine(4, 44, 11, 4, 2.5)} className="glyph-faint" />
    <path d={sine(4, 44, 23, 4, 3.2)} className="glyph-faint" />
    <path d={sine(4, 44, 35, 4, 4)} className="glyph-faint" />
    <path d="M48 11 L56 23 L48 35" className="glyph-faint" />
    <path d={`M60 23 ${sine(60, 92, 23, 11, 2).slice(1)}`} className="glyph-live" />
  </>,
  // Feedback: what was played comes back as sound in the next block.
  () => <>
    <g className="glyph-spin"><path d="M48 9 A14 14 0 1 1 34.9 18.2" /><path d="M31 13 L34.9 18.2 L41 16.2" /></g>
    <path d={sine(40, 56, 23, 3, 1.5)} className="glyph-live" />
  </>,
];

export function StepGlyph({ step }: { step: number }) {
  if (step === 1) return <CnnGlyph />;
  return <svg className="step-glyph" viewBox="0 0 96 46" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[step]()}</svg>;
}
