// A real performance as the signal-chain views read it: Schubert's "Halt!" (vocal track of a recording, 11.0–43.3 s,
// the engine run with the intro's rest already elapsed when the singer comes in, each entry after a long silence
// aligned to the accompaniment), with what the engine made of it at every 10 ms frame. The results were computed offline
// and stored in halt-run.json; only those results ship here, not the rules that produced them. The sound the page
// plays is the same take: the singer and the accompaniment the engine played.
// The pictures keep when things happened as the record has it and tidy how they look, as the made-up example did: the
// voice is the note the singer sang, the accompaniment one chord a beat, the belief a spread column that slides when
// the predicted note changes, and the model's distribution and likelihoods are eased over a few frames.
import RUN from "@/lib/halt-run.json";

export type TempoLayer = { cloud: number[]; before: number[]; fit: number[]; parent: number[]; observed: number; time: number; median: number };
export type EngineEvents = { confirm: number[]; crossing: number[]; fire: number[] };
export type State = { pitch: number | null; start: number; dur: number };
export type PianoNote = { on: number; off: number; midi: number; k: number };
export type Chord = { start: number; end: number; notes: number[] };

export const BEAT = RUN.beat, HOP = RUN.hop, LOOP = RUN.loop, TOTAL = RUN.total;
// A frame i stands for time (i + 1) * HOP into the take; positions are in beats from the start of the take.
export const STATES: State[] = RUN.states.map(([pitch, start, dur]) => ({ pitch: pitch as number | null, start: start as number, dur: dur as number }));
export const PIANO: PianoNote[] = RUN.piano.map(([on, off, midi], k) => ({ on, off, midi, k }));
// The piano part read as one chord a beat (a dotted quarter, half a 6/8 bar): its bass and its top three notes.
export const CHORDS: Chord[] = RUN.chords.map(([start, end, notes]) => ({ start: start as number, end: end as number, notes: notes as number[] }));
// The notes the singer sang (start and end in seconds into the take, the written pitch).
const SUNG = RUN.sung.map(([on, off, midi]) => ({ on, off, midi }));
export const PF_PARTICLES = RUN.layers.particles;
export const SCENES = RUN.scenes;
const NS = STATES.length, PITCH_COLUMN = STATES.map((s) => RUN.pitches.indexOf(s.pitch)), NP = RUN.pitches.length;

export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const modBeat = (b: number) => ((b % TOTAL) + TOTAL) % TOTAL;
export const wrapTime = (t: number) => ((t % LOOP) + LOOP) % LOOP;
// The take loops, and where it starts again the engine's state starts again too. A picture that looks back in time
// reads only the pass it stands in, so that seam is a clean cut; `passShift` takes a position back into its own pass.
export const passStart = (t: number) => Math.floor(t / LOOP) * LOOP;
export const passShift = (t: number) => Math.floor(t / LOOP) * TOTAL;
export const stateIndex = (b: number) => { const x = modBeat(b); const j = STATES.findIndex((s) => x < s.start + s.dur); return j < 0 ? NS - 1 : j; };
export const centOf = (m: number) => 1200 * Math.log2(440 * 2 ** ((m - 69) / 12) / 10);
export const C_LO = 1200 * Math.log2(32.7 / 10), C_HI = 1200 * Math.log2(1975.5 / 10);
export const BIN_CENTS = Array.from({ length: 360 }, (_, b) => C_LO + (C_HI - C_LO) * b / 359);

const bytes = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const floats = (text: string) => new Float32Array(bytes(text).buffer);
const words = (text: string) => new Uint16Array(bytes(text).buffer);

export const OCTAVE = RUN.octave;
const VOICED = 0.3, KERNEL = [0.02, 0.08, 0.8, 0.08, 0.02], SWEEP = 0.15;
const smooth01 = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
function decode() {
  const f = RUN.frame, L = RUN.layers, P = L.particles, unit = L.tempoUnit, N = RUN.frames;
  const cloud = words(L.cloud), fit = bytes(L.fit), steps = bytes(L.parentStep);
  const layers: TempoLayer[] = [];
  let before = Array.from(words(L.before), (v) => v / unit);
  for (let n = 0; n < L.count; n++) {
    const after = Array.from(cloud.subarray(n * P, n * P + P), (v) => v / unit), parent: number[] = [];
    let p = 0;
    for (let i = 0; i < P; i++) { p += steps[n * P + i]; parent.push(p); }
    layers.push({ cloud: after, before, fit: Array.from(fit.subarray(n * P, n * P + P), (v) => v / L.fitLevels), parent, observed: L.observed[n], time: L.time[n], median: L.median[n] });
    before = after;
  }
  // What the eye follows of the model's voice: its voiced frames with gaps under 120 ms closed and blips under 60 ms
  // dropped, and its pitch eased frame to frame within each voiced run.
  const voicing = bytes(f.voicing), pitch = floats(f.pitch), heard = new Uint8Array(N), heardPitch = new Float32Array(N);
  for (let i = 0; i < N; i++) heard[i] = voicing[i] >= VOICED * 255 ? 1 : 0;
  const runs = (value: number, under: number) => {
    for (let i = 0; i < N;) {
      let j = i;
      while (j < N && heard[j] === heard[i]) j++;
      if (heard[i] === value && j - i < under && i > 0 && j < N) heard.fill(1 - value, i, j);
      i = j;
    }
  };
  runs(0, 12); runs(1, 6);
  for (let i = 0; i < N; i++) {
    const raw = Number.isFinite(pitch[i]) ? pitch[i] : i ? heardPitch[i - 1] : 60;
    heardPitch[i] = i && heard[i - 1] && heard[i] ? heardPitch[i - 1] + 0.2 * (raw - heardPitch[i - 1]) : raw;
  }
  // The model's distribution and the likelihoods followed with a time constant of about 0.06 and 0.12 s.
  const follow = (a: Uint8Array, width: number, tau: number) => {
    const out = new Float32Array(a.length), k = 1 - Math.exp(-HOP / tau);
    for (let i = 0; i < N; i++) for (let j = 0; j < width; j++) {
      const v = a[i * width + j] / 255;
      out[i * width + j] = i ? out[(i - 1) * width + j] + k * (v - out[(i - 1) * width + j]) : v;
    }
    return out;
  };
  // The heard voice on the score's lines: the written pitch the engine's likelihood matches best (an octave apart counts
  // as the same note), so the sheet of light lies on a line of the score and moves when the matched note does.
  const observation = follow(bytes(f.observation), NP, 0.12), onLine = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let best = -1, top = -1;
    RUN.pitches.forEach((m, k) => { if (m !== null && observation[i * NP + k] > top) { top = observation[i * NP + k]; best = m; } });
    onLine[i] = best;
  }
  // The belief as the made-up example drew it, moved by the record: mass slides to a newly predicted note over 0.15 s
  // and leaks toward the next note as the singer reaches the end of the written length; without evidence it holds.
  const predicted = bytes(f.predicted), frozen = floats(f.frozen), singer = floats(f.singer), centre = new Float32Array(N), leak = new Float32Array(N);
  let from = predicted[0], at = 0;
  for (let i = 0; i < N; i++) {
    if (i && predicted[i] !== predicted[i - 1]) { from = centre[i - 1]; at = i; }
    const sweep = smooth01((i - at) * HOP / SWEEP), s = STATES[predicted[i]];
    centre[i] = from + (predicted[i] - from) * sweep;
    leak[i] = frozen[i] > 0 && i ? leak[i - 1] : sweep >= 1 && s.pitch !== null ? 0.3 * smooth01(((singer[i] - s.start) / s.dur - 0.6) / 0.4) : 0;
  }
  return {
    frames: RUN.frames, heard, heardPitch, onLine, centre, leak,
    latent: follow(bytes(f.latent), RUN.bins.count, 0.06), observation, predicted, confirmed: bytes(f.confirmed),
    frozen, confirmAge: floats(f.confirmAge),
    head: floats(f.head), psi: floats(f.psi), anchorTime: floats(f.anchorTime), anchorPos: floats(f.anchorPos), anchorRate: floats(f.anchorRate),
    pf: floats(f.pf), shaped: floats(f.shaped), traj: floats(f.traj), tempo: floats(f.tempo), lead: floats(f.lead), gain: floats(f.gain), seen: bytes(f.seen),
    singer, singerRate: floats(f.singerRate), pitch, voicing,
    events: { confirm: RUN.events.confirm.map((k) => k * HOP), crossing: RUN.events.crossing.map((k) => k * HOP), fire: RUN.events.fire.map((k) => k * HOP) } as EngineEvents,
    layers, arch: floats(RUN.arch.values),
  };
}
let DATA: ReturnType<typeof decode> | null = null;
const run = () => (DATA ??= decode());
// Decoding takes a few tens of milliseconds; views call this right after mounting so it does not land in a slide.
export const prepareFollower = () => { run(); };
// A time maps to a frame of the take; positions shift by whole takes, so a clock that runs on keeps rising.
function frameAt(t: number) {
  const r = run(), x = wrapTime(t) / HOP - 1, lo = clamp(Math.floor(x), 0, r.frames - 2);
  return { r, i: clamp(Math.round(x), 0, r.frames - 1), lo, frac: clamp(x - lo), shift: Math.floor(t / LOOP) * TOTAL };
}
const lerp = (a: ArrayLike<number>, lo: number, frac: number) => a[lo] + (a[lo + 1] - a[lo]) * frac;

/* ---------- What the singer did (from the take) ---------- */
// The singer's place in the score: the sung notes' onsets and ends joined up; before the first note, the pianist's.
export const singerU = (t: number) => { const { r, lo, frac, shift } = frameAt(t); return lerp(r.singer, lo, frac) + shift; };
export const singerTempo = (t: number) => { const { r, i } = frameAt(t); return r.singerRate[i]; };
// The sung pitch the pitch model heard (a MIDI number with its cents), or none where it heard no voice, frame by frame.
export function voiceNow(t: number) {
  const { r, i } = frameAt(t), amp = r.voicing[i] / 255;
  return amp < VOICED ? { pitch: null, amp: 0 } : { pitch: r.pitch[i], amp };
}
// The tenor sings the treble-clef part an octave below where it is written, and the engine takes an octave as the
// same note. Pictures that set the sung pitch beside the written notes lift it into the score's register; this one is
// where the model heard a voice (short gaps closed), on the line of the written note its likelihood matches best.
export function voiceInScore(t: number) {
  const { r, i } = frameAt(t);
  return r.heard[i] ? { pitch: r.onLine[i], amp: Math.max(0.5, r.voicing[i] / 255) } : { pitch: null, amp: 0 };
}
// The note the singer is singing, at its written pitch, with a short attack and release: what the singer did.
let sungAt = 0;
export function sungNote(t: number) {
  const u = wrapTime(t);
  if (SUNG[sungAt].on > u) sungAt = 0;
  while (sungAt < SUNG.length - 1 && SUNG[sungAt + 1].on <= u) sungAt++;
  const n = SUNG[sungAt];
  if (u < n.on || u > n.off + 0.08) return { pitch: null, amp: 0 };
  return { pitch: n.midi, amp: Math.min(1, (u - n.on) / 0.04) * (u <= n.off ? 1 : 1 - (u - n.off) / 0.08) };
}
// The same note where the singer's voice is drawn as sound: in the register it was sung in.
export function voiceWave(t: number) { const v = sungNote(t); return v.pitch === null ? v : { pitch: v.pitch - OCTAVE, amp: v.amp }; }
export const sceneAt = (t: number) => { const u = wrapTime(t); return SCENES.find((s) => u >= s.start && u < s.end) ?? SCENES[SCENES.length - 1]; };

/* ---------- What the engine did ---------- */
// The pitch model's distribution over 360 bins (20 cents apart), followed over a few frames.
export function salience(t: number) {
  const { r, i } = frameAt(t), out = new Array<number>(360).fill(0), from = RUN.bins.from, n = RUN.bins.count;
  for (let b = 0; b < n; b++) out[from + b] = r.latent[i * n + b];
  return out;
}
// The chance that the singer is at each note: the belief as the example drew it, moved by the record's predictions.
export const belief = (t: number) => {
  const { r, i } = frameAt(t), mass = new Array<number>(NS).fill(0), c = r.centre[i], lk = r.leak[i], f = Math.floor(c), frac = c - f;
  for (const [at, w] of [[f, (1 - frac) * (1 - lk)], [f + 1, frac * (1 - lk)], [Math.round(c) + 1, lk]]) KERNEL.forEach((kw, o) => { const j = at + o - 2; if (j >= 0 && j < NS) mass[j] += w * kw; });
  return mass;
};
// How well what was heard matches each written note, relative to the best one now; notes of one pitch score alike.
export const observationAt = (t: number) => { const { r, i } = frameAt(t); return STATES.map((s, j) => ({ score: r.observation[i * NP + PITCH_COLUMN[j]], rest: s.pitch === null })); };
export const predictedIndex = (t: number) => { const { r, i } = frameAt(t); return r.predicted[i]; };
export const confirmedIndex = (t: number) => { const { r, i } = frameAt(t); return r.confirmed[i] - 1; };
export const frozenFor = (t: number) => { const { r, i } = frameAt(t); return r.frozen[i]; };
export const confirmAge = (t: number) => { const { r, i } = frameAt(t); return r.confirmAge[i]; };
export const followerTempo = (t: number) => { const { r, i } = frameAt(t); return BEAT / r.psi[i]; };
// Where probability is: its centre near the predicted note (in states) and the share on the next note.
export const beliefFlow = (t: number) => { const { r, i } = frameAt(t); return { center: r.centre[i], leak: r.leak[i] }; };
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
  const { r, i, shift } = frameAt(t), now = (i + 1) * HOP, time = t - (now - r.anchorTime[i]);
  return { time, beat: r.anchorPos[i] / BEAT + shift, rate: r.anchorRate[i], settle: time + RUN.layers.settle };
};
// The phrase shaping planned from the score; 1 outside phrases. It jumps at phrase edges, so samples on either side
// of a jump are not blended.
export function phraseFactor(beat: number) {
  const a = run().arch, x = modBeat(beat) / RUN.arch.step, lo = Math.min(Math.floor(x), a.length - 2), frac = clamp(x - lo);
  return Math.abs(a[lo + 1] - a[lo]) > 0.05 ? a[frac < 0.5 ? lo : lo + 1] : lerp(a, lo, frac);
}
export const engineEvents = (): EngineEvents => run().events;
// Ages of the events in the last `within` seconds of this pass, newest first.
export function recentEvents(times: number[], t: number, within: number) {
  const u = wrapTime(t), ages: number[] = [];
  for (let k = times.length - 1; k >= 0; k--) { const age = u - times[k]; if (age < 0) continue; if (age > within) break; ages.push(age); }
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

/* ---------- The accompaniment the engine played ---------- */
// The chord of the beat at a score position, and how loud: struck at the beat and ringing out over it.
let chordIx = 0;
export function chordAt(b: number) {
  const x = modBeat(b);
  if (CHORDS[chordIx].start > x) chordIx = 0;
  while (chordIx < CHORDS.length - 1 && CHORDS[chordIx + 1].start <= x) chordIx++;
  const c = CHORDS[chordIx];
  if (x < c.start || x >= c.end) return { notes: [] as number[], amp: 0 };
  const age = x - c.start;
  return { notes: c.notes, amp: Math.min(1, age / 0.15) * (0.35 + 0.65 * Math.exp(-(age / 2) * 2.2)) };
}
// The piano notes themselves sounding at a score position, each ringing out from its own onset. The spectrogram asks
// thousands of times a frame, so the answer is kept per 0.02 beat.
const CHORD_STEP = 0.02, chords = new Map<number, { notes: number[]; amp: number }>();
export function pianoAt(b: number) {
  const k = Math.floor(modBeat(b) / CHORD_STEP), kept = chords.get(k);
  if (kept) return kept;
  const x = k * CHORD_STEP, notes: number[] = [];
  let amp = 0;
  for (const n of PIANO) {
    if (n.on > x) break;
    if (x >= n.off) continue;
    notes.push(n.midi);
    const age = x - n.on;
    amp = Math.max(amp, Math.min(1, age / 0.15) * (0.35 + 0.65 * Math.exp(-age * 1.1)));
  }
  const chord = { notes, amp };
  chords.set(k, chord);
  return chord;
}
// The piano notes that start or still sound between two score positions.
export const notesBetween = (lo: number, hi: number) => PIANO.filter((n) => n.off > lo && n.on < hi);

/* ---------- Signals the views draw ---------- */
// Pitch components (cents, amplitude) that light up one VQT column for each lane: the microphone hears the voice
// and the piano, the reference is the piano alone.
export function vqtParts(tau: number, lane: "mic" | "ref"): [number, number][] {
  const c = pianoAt(accompU(tau - 0.02)), out: [number, number][] = [];
  if (lane === "mic") {
    const v = voiceNow(tau);
    if (v.pitch !== null) for (let k = 1; k <= 4; k++) out.push([centOf(v.pitch) + 1200 * Math.log2(k), v.amp / k]);
    c.notes.forEach((m) => out.push([centOf(m), c.amp * 0.3]));
  } else c.notes.forEach((m) => { out.push([centOf(m), c.amp]); out.push([centOf(m) + 1200, c.amp * 0.4]); });
  return out;
}
