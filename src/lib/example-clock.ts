// One clock for every view of the take, so the diagram, the strip and the cards show the same moment. It runs at the
// take's own speed. While the take's sound plays (looping, muted or not) the clock follows it: it never runs back,
// eases onto the sound's place when the two drift a little apart and lands on it when they are far apart.
// The sound counts only once it has run in step with the wall clock for a while. A sound reported as playing that
// stalls (still loading, or held by the browser as iOS can do with a muted one) or jumps back out of turn would
// otherwise hold the picture or keep it looping over the moment the sound repeats.
const TRUST_MS = 1500, SLACK = 0.3;
let last: number | null = null, t = 0;
let sound: { el: HTMLAudioElement; loop: number; laps: number; heard: number; since: number | null; from: number } | null = null;
export function exampleTime(now: number) {
  const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now; t += dt;
  if (sound && !sound.el.paused && sound.el.readyState >= 2) {
    const c = sound.el.currentTime;
    // The sound loops: a place that falls back by more than half a take is the next pass.
    if (c < sound.heard - sound.loop / 2) sound.laps++;
    sound.heard = c;
    const at = sound.laps * sound.loop + c;
    if (sound.since === null || Math.abs(at - sound.from - (now - sound.since) / 1000) > SLACK) { sound.since = now; sound.from = at; }
    else if (now - sound.since >= TRUST_MS) {
      const off = at - t;
      t += Math.abs(off) > 0.25 ? off : off * Math.min(1, dt * 4);
    }
  } else if (sound) sound.since = null;
  return t;
}
// Hands the clock to a looping sound `loop` seconds long, or (null) lets it run on by itself.
export function followSound(el: HTMLAudioElement | null, loop = 0) {
  sound = el && loop > 0 ? { el, loop, laps: Math.floor(t / loop), heard: el.currentTime, since: null, from: 0 } : null;
}
