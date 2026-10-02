// The example performance as the signal-chain views read it: the inputs from example-input.ts, and what the
// engine made of them. The engine's results were computed offline and stored in example-run.json; only those
// results ship here, not the rules that produced them.
import RUN from "@/lib/example-run.json";
import { BEAT, LOOP, STATES, TOTAL, centOf, chordAt, clamp, modBeat, singerU, voiceAt, wrapTime } from "@/lib/example-input";

export * from "@/lib/example-input";

export type TempoLayer = { cloud: number[]; before: number[]; fit: number[]; parent: number[]; observed: number; time: number; median: number };
export type EngineEvents = { confirm: number[]; crossing: number[]; fire: number[] };

// A frame i stands for time (i + 1) * HOP within one performance; event times are stored as frame ticks.
const HOP = RUN.hop, NS = RUN.states;
export const PF_PARTICLES = RUN.particles;
const bytes = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const floats = (text: string) => new Float32Array(bytes(text).buffer);
const words = (text: string) => new Uint16Array(bytes(text).buffer);

function decode() {
  const f = RUN.frame, L = RUN.layers, P = RUN.particles;
  const cloud = floats(L.cloud), before = floats(L.before), fit = floats(L.fit), parent = bytes(L.parent);
  const pick = (a: ArrayLike<number>, n: number) => Array.from({ length: P }, (_, i) => a[n * P + i]);
  return {
    frames: RUN.frames,
    belief: bytes(f.belief), observation: bytes(f.observation), predicted: bytes(f.predicted), confirmed: bytes(f.confirmed),
    frozen: words(f.frozen), confirmAge: words(f.confirmAge), center: floats(f.center), leak: floats(f.leak),
    head: floats(f.head), psi: floats(f.psi), anchorTicks: words(f.anchorTicks), anchorPos: floats(f.anchorPos), anchorRate: floats(f.anchorRate), settleTicks: words(f.settleTicks),
    pf: floats(f.pf), shaped: floats(f.shaped), traj: floats(f.traj), tempo: floats(f.tempo), lead: floats(f.lead), gain: floats(f.gain), seen: bytes(f.seen),
    events: { confirm: RUN.events.confirm.map((k) => k * HOP), crossing: RUN.events.crossing.map((k) => k * HOP), fire: RUN.events.fire.map((k) => k * HOP) } as EngineEvents,
    layers: Array.from({ length: L.count }, (_, n): TempoLayer => ({ cloud: pick(cloud, n), before: pick(before, n), fit: pick(fit, n), parent: pick(parent, n), observed: L.observed[n], time: L.time[n] * HOP, median: L.median[n] })),
    arch: floats(RUN.arch.values),
  };
}
let DATA: ReturnType<typeof decode> | null = null;
const run = () => (DATA ??= decode());
// Decoding takes a few milliseconds; views call this right after mounting so it does not land in the middle of a slide.
export const prepareFollower = () => { run(); };
// A time maps to a frame of the one computed performance; positions shift by whole performances.
function frameAt(t: number) {
  const r = run(), x = wrapTime(t) / HOP - 1, lo = clamp(Math.floor(x), 0, r.frames - 2);
  return { r, i: clamp(Math.round(x), 0, r.frames - 1), lo, frac: clamp(x - lo), shift: Math.floor(t / LOOP) * TOTAL };
}
const lerp = (a: ArrayLike<number>, lo: number, frac: number) => a[lo] + (a[lo + 1] - a[lo]) * frac;

export const belief = (t: number) => { const { r, i } = frameAt(t); return Array.from(r.belief.subarray(i * NS, i * NS + NS), (v) => v / 255); };
// How well the sung pitch matches each written note right now; a rest scores what is left when nothing is sung.
export const observationAt = (t: number) => { const { r, i } = frameAt(t); return STATES.map((s, j) => ({ score: r.observation[i * NS + j] / 255, rest: s.pitch === null })); };
export const predictedIndex = (t: number) => { const { r, i } = frameAt(t); return r.predicted[i]; };
export const confirmedIndex = (t: number) => { const { r, i } = frameAt(t); return r.confirmed[i] - 1; };
export const frozenFor = (t: number) => { const { r, i } = frameAt(t); return r.frozen[i] * HOP; };
export const confirmAge = (t: number) => { const { r, i } = frameAt(t); return r.confirmAge[i] * HOP; };
export const followerTempo = (t: number) => { const { r, i } = frameAt(t); return BEAT / r.psi[i]; };
// Where probability is flowing: the moving centre (in states) and the share leaking to the next note.
export const beliefFlow = (t: number) => { const { r, i } = frameAt(t); return { center: r.center[i], leak: r.leak[i] }; };
// Follower clock, in beats: the onset of the predicted note.
export const anchorU = (t: number) => { const { r, i, shift } = frameAt(t); return STATES[r.predicted[i]].start + shift; };
export const playheadU = (t: number) => { const { r, lo, frac, shift } = frameAt(t); return lerp(r.head, lo, frac) / BEAT + shift; };
// Accompaniment clock, in beats, and the tempo it is actually playing at.
export const accompU = (t: number) => { const { r, lo, frac, shift } = frameAt(t); return lerp(r.traj, lo, frac) / BEAT + shift; };
export const accompTempo = (t: number) => { const { r, i } = frameAt(t); return r.tempo[i]; };
export const pfTempo = (t: number) => { const { r, i } = frameAt(t); return r.pf[i]; };
export const shapedTempo = (t: number) => { const { r, i } = frameAt(t); return r.shaped[i]; };
// How hard the accompaniment is pulled toward the playhead.
export const coupleGain = (t: number) => { const { r, i } = frameAt(t); return r.gain[i]; };
export const singerSeen = (t: number) => { const { r, i } = frameAt(t); return r.seen[i] === 1; };
// How far ahead of the accompaniment position the scheduler fires, in beats.
export const schedulerLead = (t: number) => { const { r, i } = frameAt(t); return r.lead[i]; };
// The latest anchor, and when the playhead has finished easing onto it; times are on the caller's clock.
export const latestAnchor = (t: number) => {
  const { r, i, shift } = frameAt(t), now = (i + 1) * HOP;
  return { time: t - (now - r.anchorTicks[i] * HOP), beat: r.anchorPos[i] / BEAT + shift, rate: r.anchorRate[i], settle: t - (now - r.settleTicks[i] * HOP) };
};
// The phrase shaping planned from the score; 1 outside phrases. It jumps at phrase edges, so samples on either side
// of a jump are not blended.
export function phraseFactor(beat: number) {
  const a = run().arch, x = modBeat(beat) / RUN.arch.step, lo = Math.min(Math.floor(x), a.length - 2), frac = clamp(x - lo);
  return Math.abs(a[lo + 1] - a[lo]) > 0.05 ? a[frac < 0.5 ? lo : lo + 1] : lerp(a, lo, frac);
}
export const engineEvents = (): EngineEvents => run().events;
// Ages of the events in the last `within` seconds, newest first. The performance repeats, so events near the end
// of one pass are still recent at the start of the next.
export function recentEvents(times: number[], t: number, within: number) {
  const u = wrapTime(t), ages: number[] = [];
  for (let k = times.length - 1; k >= 0; k--) { const age = u - times[k]; if (age < 0) continue; if (age > within) break; ages.push(age); }
  if (u < within) for (let k = times.length - 1; k >= 0; k--) { const age = u + LOOP - times[k]; if (age > within) break; ages.push(age); }
  return ages;
}
// The particle cloud after the most recent events, oldest first; times are on the caller's clock.
export function tempoLayers(t: number, keep = 2): TempoLayer[] {
  const layers = run().layers, u = wrapTime(t);
  let last = 0;
  layers.forEach((e, n) => { if (e.time <= u) last = n; });
  return Array.from({ length: keep }, (_, n) => {
    const e = layers[Math.max(0, last - keep + 1 + n)];
    return { ...e, time: t - (u - e.time) };
  });
}

/* ---------- Signals the views draw from the accompaniment ---------- */

// Pitch components (cents, amplitude) that light up one VQT column for each lane.
export function vqtParts(tau: number, lane: "mic" | "ref"): [number, number][] {
  const c = chordAt(accompU(tau - 0.02)), out: [number, number][] = [];
  if (lane === "mic") {
    const v = voiceAt(singerU(tau));
    if (v.pitch !== null) for (let k = 1; k <= 4; k++) out.push([centOf(v.pitch) + 1200 * Math.log2(k), v.amp / k]);
    c.notes.forEach((m) => out.push([centOf(m), c.amp * 0.3]));
  } else c.notes.forEach((m) => { out.push([centOf(m), c.amp]); out.push([centOf(m) + 1200, c.amp * 0.4]); });
  return out;
}
