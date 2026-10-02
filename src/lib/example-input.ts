// The example performance's inputs: the score, its scenes and one scripted singer. Everything here is invented for
// the illustration; what the engine does with it is computed offline and read from example-run.json.
export const BEAT = 0.5;
// The piano plays the intro and outro alone; rests of 0.6 s or more split phrases, as the real rule does.
export const MELODY: [number | null, number][] = [
  [null, 4],
  [67, 1], [69, 1], [71, 2], [72, 1], [71, 1], [69, 2],
  [null, 4],
  [64, 1], [67, 1], [69, 2], [71, 2], [69, 1], [67, 1], [64, 2],
  [null, 2],
  [67, 1], [69, 1], [71, 1], [72, 1], [71, 1], [69, 1], [67, 1], [69, 1], [71, 1], [69, 1], [67, 2],
  [null, 4],
];
export const STATES = (() => { let start = 0; return MELODY.map(([pitch, dur]) => { const state = { pitch, start, dur }; start += dur; return state; }); })();
export const TOTAL = STATES[STATES.length - 1].start + STATES[STATES.length - 1].dur;
const C: [number, number[]] = [48, [0, 4, 7]], G: [number, number[]] = [43, [0, 4, 7]], F: [number, number[]] = [41, [0, 4, 7]];
const Am: [number, number[]] = [45, [0, 3, 7]], Em: [number, number[]] = [40, [0, 3, 7]];
// One chord per two beats: intro, phrase A, breath, phrase B, rest, phrase C, outro.
export const CHORDS: [number, number[]][] = [C, G, C, G, Am, F, C, G, Em, C, Am, G, G, C, F, G, Am, F, G, C, C, C];
// The singer cracks an octave for 0.3 s in the middle of this note.
const SLIP_STATE = 11, SLIP_FROM = 0.4, SLIP_TO = 0.7;
export const SCENES: { from: number; to: number; name: string; note: string }[] = [
  { from: 0, to: 4, name: "전주", note: "가수 없음 · 반주 혼자" },
  { from: 4, to: 12, name: "노래", note: "세 시계가 함께 간다" },
  { from: 12, to: 16, name: "긴 숨", note: "추종기는 멈추고 반주는 관성으로" },
  { from: 16, to: 20.6, name: "노래", note: "다시 합류" },
  { from: 20.6, to: 21.8, name: "옥타브 실수", note: "악보와 안 맞는 소리는 증거가 아니다" },
  { from: 21.8, to: 31, name: "노래", note: "세 시계가 함께 간다" },
  { from: 31, to: 40, name: "느려짐", note: "음마다 잰 템포로 따라 내려가지만 늦게 반영돼 반주가 조금 앞선다" },
  { from: 40, to: TOTAL, name: "후주", note: "반주 혼자 마무리" },
];

export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth01 = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
export const modBeat = (b: number) => ((b % TOTAL) + TOTAL) % TOTAL;
export const stateIndex = (b: number) => { const x = modBeat(b); const j = STATES.findIndex((s) => x < s.start + s.dur); return j < 0 ? STATES.length - 1 : j; };

/* ---------- The singer: tempo shaped along the score, integrated into a timeline ---------- */
// Ratio to the written tempo: a gentle push inside phrases A and B, a ritardando into the last note.
export function singerRate(beat: number) {
  const b = modBeat(beat);
  if (b >= 4 && b < 12) return 1 + 0.07 * Math.sin(Math.PI * (b - 4) / 8);
  if (b >= 16 && b < 26) return 1 + 0.05 * Math.sin(Math.PI * (b - 16) / 10);
  if (b >= 31 && b < 40) return 1 - 0.32 * smooth01((b - 31) / 8);
  return 1;
}
const STEP = 0.005;
const TIMELINE = (() => { const out = [0]; for (let b = STEP; b <= TOTAL + 1e-9; b += STEP) out.push(out[out.length - 1] + STEP * BEAT / singerRate(b - STEP / 2)); return out; })();
export const LOOP = TIMELINE[TIMELINE.length - 1];
export const wrapTime = (t: number) => ((t % LOOP) + LOOP) % LOOP;
// The singer's score position at a time within one performance.
export function beatAt(u: number) {
  let lo = 0, hi = TIMELINE.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (TIMELINE[mid] <= u) lo = mid; else hi = mid; }
  return (lo + (u - TIMELINE[lo]) / Math.max(TIMELINE[hi] - TIMELINE[lo], 1e-9)) * STEP;
}
export const singerU = (t: number) => Math.floor(t / LOOP) * TOTAL + beatAt(wrapTime(t));
// When the singer reaches a score position, within one performance.
export const timeOfBeat = (b: number) => { const x = clamp(b, 0, TOTAL) / STEP, lo = Math.min(Math.floor(x), TIMELINE.length - 2); return TIMELINE[lo] + (TIMELINE[lo + 1] - TIMELINE[lo]) * (x - lo); };
export const singerTempo = (t: number) => singerRate(beatAt(wrapTime(t)));
export function voiceAt(b: number) {
  const j = stateIndex(b), s = STATES[j];
  if (s.pitch === null) return { pitch: null, amp: 0 };
  const p = (modBeat(b) - s.start) / s.dur, slip = j === SLIP_STATE && p >= SLIP_FROM && p < SLIP_TO;
  return { pitch: slip ? s.pitch + 12 : s.pitch, amp: Math.min(1, p * 10) * (p < 0.86 ? 1 : clamp(1 - (p - 0.86) / 0.08)) };
}
export const sceneAt = (t: number) => { const b = modBeat(singerU(t)); return SCENES.find((s) => b >= s.from && b < s.to) ?? SCENES[0]; };
export function chordAt(b: number) {
  const x = modBeat(b), k = Math.min(CHORDS.length - 1, Math.floor(x / 2)), [root, steps] = CHORDS[k];
  // A short attack keeps chord changes from jumping straight to full level.
  return { notes: steps.map((step) => root + step), amp: Math.min(1, (x - k * 2) / 0.15) * (0.35 + 0.65 * Math.exp(-((x - k * 2) / 2) * 2.2)) };
}

export const centOf = (m: number) => 1200 * Math.log2(440 * 2 ** ((m - 69) / 12) / 10);
export const C_LO = 1200 * Math.log2(32.7 / 10), C_HI = 1200 * Math.log2(1975.5 / 10);
export const BIN_CENTS = Array.from({ length: 360 }, (_, b) => C_LO + (C_HI - C_LO) * b / 359);
export function salience(t: number) {
  const v = voiceAt(singerU(t)), c0 = v.pitch === null ? 0 : centOf(v.pitch), flicker = Math.floor(t / 0.08);
  return BIN_CENTS.map((cent, b) => (v.pitch === null ? 0 : 0.95 * v.amp * Math.exp(-((cent - c0) ** 2) / (2 * 25 * 25))) + 0.003 * hash(b * 7.1 + flicker * 0.37));
}

export const fv = (m: number) => 30 * 2 ** ((m - 60) / 12);
export function voiceSignal(tau: number) { const v = voiceAt(singerU(tau)); if (v.pitch === null) return 0; const f = fv(v.pitch); return v.amp * (0.75 * Math.sin(2 * Math.PI * f * tau) + 0.25 * Math.sin(4 * Math.PI * f * tau)); }
