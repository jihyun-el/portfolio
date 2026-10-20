"use client";

import { useEffect, useRef, type ReactNode } from "react";
import example from "@/lib/pipeline-example.json";
import { phoneOutline } from "@/lib/phone-outline";

// The four parts the lead engineer built, put together in light: the pipeline's own engraving of a song glows up,
// its notes leave the page as points of light and fly into a phone, the singer's voice comes in from the left as a
// trace of its pitch and the pitch model turns it into a column of pitch bins lit at the sung note, and inside the
// phone the engine lights as the ring its own screen opens on, beating with the melody. The phone stands on the left
// with the engine and the model in it, the engraving on the right. The frame is drawn as light added up and then
// coloured by its brightness on the engine's ramp, so the picture hands over to the engine's screen in the same light.
// No app screen is drawn.
export type AssemblyPart = { id: string; no: string; name: string; line: string };
type PartKind = "engine" | "model" | "app" | "pipeline";
// Where the engine's own ring stands on the page (middle, half width, half height, in page pixels): the dive ends
// with this ring laid exactly on it. Without one the dive goes to the middle of the picture.
export type RingPlace = { cx: number; cy: number; rx: number; ry: number };
export type Dive = { at: number; to: RingPlace | null };
export const BUILD_MS = 4300, DIVE_MS = 800;
const AT = { score: 0, scoreIn: 1300, phone: 1100, phoneIn: 1200, notes: 1500, notesOver: 1500, fly: 950, engine: 2900, engineIn: 900, voice: 1700, voiceIn: 850 };

// The first two systems of the first page, in the engraving's own units, and the pipeline's note boxes inside them.
const [DOC_W, DOC_H] = example.page.doc;
const CROP = { x0: 1300, x1: 20800, y0: 600, y1: 12400 };
const ASPECT = (CROP.x1 - CROP.x0) / (CROP.y1 - CROP.y0);
const NOTES = example.notes.filter((n) => n[3] >= CROP.y0 && n[5] <= CROP.y1);
const LAST = Math.max(...NOTES.map((n) => n[0]));
const ONSETS = [...new Set(NOTES.map((n) => n[0]))].sort((a, b) => a - b);
// The voice: the notes of the sung line (the top staff of each system), each with how high it stands on the staff,
// as a share of the line's range (1 the highest). Sung at the ring's tempo, round and round with a breath between.
const SYSTEMS = example.page.systems;
const SUNG = NOTES.map((n) => { const y = (n[3] + n[5]) / 2, s = SYSTEMS.find(([a, b]) => y >= a && y <= b)!; return { on: n[0], off: n[1], rel: y - s[0] }; })
  .filter((n) => n.rel < (SYSTEMS[0][1] - SYSTEMS[0][0]) / 4).sort((a, b) => a.on - b.on);
const [REL_LO, REL_HI] = [Math.min(...SUNG.map((n) => n.rel)), Math.max(...SUNG.map((n) => n.rel))];
const SUNG_FROM = SUNG[0].on, SUNG_LOOP = SUNG.at(-1)!.off - SUNG_FROM + 1500, VOICE_RATE = 2.2;
const heightOf = (n: (typeof SUNG)[number]) => (REL_HI - n.rel) / (REL_HI - REL_LO || 1);
// Where the line stands at a time of the melody: the note sung then, glided into from the one before, with a slight
// vibrato; nothing in a rest.
function sungAt(m: number) {
  const k = SUNG.findIndex((n) => m >= n.on && m < n.off);
  if (k < 0) return null;
  const into = clamp((m - SUNG[k].on) / 90), before = k > 0 && SUNG[k - 1].off >= SUNG[k].on - 1 ? heightOf(SUNG[k - 1]) : heightOf(SUNG[k]);
  return before + (heightOf(SUNG[k]) - before) * ease(into) + 0.022 * Math.sin(m / 1000 * 5.6 * 2 * Math.PI) * into;
}
const melodyOf = (sent: number) => SUNG_FROM + (((sent - AT.voice) * VOICE_RATE) % SUNG_LOOP + SUNG_LOOP) % SUNG_LOOP;
const BINS = 44;

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ease = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const rise = (now: number, from: number, over: number) => ease(clamp((now - from) / over));
// Where each note lands in the phone, as a share of the phone's size around the engine's ring.
const LANDING = (() => { const next = rng(31); return NOTES.map(() => [(next() - 0.5) * 0.5, (next() - 0.5) * 0.12]); })();
// The ring as the engine's screen draws it: three lanes of evenly spaced points round an ellipse seen from the front
// and above, the middle lane the strongest, with ten swells of light running round it, one per stage.
const RING_LANES = [{ out: -0.026, size: 6.5, light: 0.6 }, { out: 0, size: 9.5, light: 1 }, { out: 0.026, size: 6.5, light: 0.6 }], RING_EACH = 150, RING_FLAT = 0.38, STAGES = 10;

// The same ramp as the engine's picture: dark stage → indigo → magenta → orange → amber, light stage → seaborn flare.
const FINAL = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D base, glow; uniform float light, glowK;
const float STAGE = 5.0 / 255.0;
const vec3 INDIGO = vec3(0.29, 0.21, 0.71), MAGENTA = vec3(0.76, 0.13, 0.44), ORANGE = vec3(0.94, 0.40, 0.11), AMBER = vec3(1.0, 0.80, 0.29);
vec3 ramp(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) { return x < 1.0 ? mix(c0, c1, x) : x < 2.0 ? mix(c1, c2, x - 1.0) : x < 3.0 ? mix(c2, c3, x - 2.0) : mix(c3, c4, x - 3.0); }
vec3 flare(float t) {
  vec3 f0 = vec3(0.929, 0.689, 0.504), f1 = vec3(0.907, 0.494, 0.390), f2 = vec3(0.838, 0.308, 0.372), f3 = vec3(0.666, 0.227, 0.430), f4 = vec3(0.479, 0.180, 0.437), f5 = vec3(0.294, 0.137, 0.384);
  float y = t * 5.0;
  return y < 1.0 ? mix(f0, f1, y) : y < 2.0 ? mix(f1, f2, y - 1.0) : y < 3.0 ? mix(f2, f3, y - 2.0) : y < 4.0 ? mix(f3, f4, y - 3.0) : mix(f4, f5, y - 4.0);
}
void main() {
  float n = clamp(texture(base, vUv).r + glowK * texture(glow, vUv).r, 0.0, 1.0);
  vec3 onDark = ramp(n * 4.0, vec3(STAGE), INDIGO, MAGENTA, ORANGE, AMBER), onLight = mix(vec3(1.0 - STAGE), flare(n), smoothstep(0.0, 0.35, n));
  o = vec4(light > 0.5 ? onLight : onDark, 1.0);
}`;
const QUAD = `#version 300 es
in vec2 q; out vec2 vUv; void main() { vUv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }`;
// The engraving as light: its ink, revealed from the left, carried with the dive: scaled about the ring's middle and
// moved with it.
const SCORE_V = `#version 300 es
in vec2 q; uniform vec4 rect; uniform vec2 view; uniform vec3 dive; uniform vec2 shift; out vec2 vUv;
void main() { vUv = q * 0.5 + 0.5; vec2 p = rect.xy + vUv * rect.zw; p = dive.xy + shift + (p - dive.xy) * dive.z; vec2 c = p / view * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const SCORE_F = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D tex; uniform vec4 crop; uniform float level, reveal;
void main() { float ink = 1.0 - texture(tex, mix(crop.xy, crop.zw, vUv)).r; float shown = 1.0 - smoothstep(reveal - 0.12, reveal, vUv.x); o = vec4(vec3(ink * level * shown), 1.0); }`;
const POINT_V = `#version 300 es
in vec2 pos; in float size; in float alpha; uniform vec2 view; out float vAlpha;
void main() { vec2 p = pos / view * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); gl_PointSize = size; vAlpha = alpha; }`;
const POINT_F = `#version 300 es
precision highp float; in float vAlpha; out vec4 o;
void main() { vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d); if (r2 > 1.0) discard; float g = exp(-r2 * 3.2) * 0.55 + exp(-r2 * 16.0) * 0.75; o = vec4(vec3(g * vAlpha), 1.0); }`;
const DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D src; uniform vec2 texel;
void main() { o = 0.25 * (texture(src, vUv + texel * vec2(-1.0, -1.0)) + texture(src, vUv + texel * vec2(1.0, -1.0)) + texture(src, vUv + texel * vec2(-1.0, 1.0)) + texture(src, vUv + texel * vec2(1.0, 1.0))); }`;
const BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D src; uniform vec2 step;
void main() { vec4 s = texture(src, vUv) * 0.227; s += (texture(src, vUv + step * 1.385) + texture(src, vUv - step * 1.385)) * 0.316; s += (texture(src, vUv + step * 3.231) + texture(src, vUv - step * 3.231)) * 0.070; o = s; }`;

type Gl = WebGL2RenderingContext;
function program(gl: Gl, vs: string, fs: string) {
  const make = (type: number, source: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
  const p = gl.createProgram()!; gl.attachShader(p, make(gl.VERTEX_SHADER, vs)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}
function target(gl: Gl, w: number, h: number, float: boolean) {
  const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h, free: () => { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); } };
}

// Where things stand in a box of w × h: the phone on the left with the engine's ring a little above its middle and
// the model's column under it, the engraving to its right. `fit` is the room the names need, measured: `gut` left of
// the phone for the engine's and the model's names, `foot` under both for the app's and the engraving's, and on a
// phone `stack` under the phone for the engine's, the model's and the app's one above the other. Where a name left of
// the phone would not fit, the phone moves right and, if it must, the phone and the engraving shrink together until
// it does.
const NARROW = 620, TAG_GAP = 14;
function layout(w: number, h: number, fit = { gut: 0, foot: 0, stack: 0 }) {
  const narrow = w < NARROW, right = narrow ? w : w * 0.96, gap = w * 0.08;
  let sw = narrow ? w * 0.52 : Math.min(w * 0.42, h * 0.74 * ASPECT, 2 * (h * 0.52 - TAG_GAP - 2 - fit.foot) * ASPECT);
  let ph = narrow ? Math.min(h * 0.62, h * 0.85 - TAG_GAP - 4 - fit.stack) : Math.min(h * 0.74, 2 * (h * 0.54 - TAG_GAP - 2 - fit.foot));
  let pw = ph * 0.48, pcx = narrow ? w * 0.2 : Math.min(right - sw - pw * 0.5 - gap, w * 0.38);
  if (!narrow && pcx - pw / 2 < fit.gut) {
    const k = Math.min(1, (right - fit.gut - gap) / (pw + sw));
    pw *= k; ph = pw / 0.48; sw *= k; pcx = fit.gut + pw / 2;
  }
  const sh = sw / ASPECT, sx = right - sw, sy = h * 0.48 - sh / 2, pcy = narrow ? h * 0.15 + ph / 2 : h * 0.46;
  const rx = pw * 0.4, ring = { cx: pcx, cy: pcy - ph * 0.06, rx, ry: rx * RING_FLAT };
  // The pitch model's column of bins stands under the ring, the highest bin on top.
  const column = { x: pcx, top: pcy + ph * 0.13, h: ph * 0.24 };
  return { sx, sy, sw, sh, pcx, pcy, pw, ph, ring, column, narrow };
}
// A point of the ring at a share of the way round from its front, `out` beyond its middle lane, breathing by `breath`,
// with how much nearer than the middle it stands.
const onRing = (l: ReturnType<typeof layout>, share: number, out = 0, breath = 1): [number, number, number] => {
  const a = share * 2 * Math.PI, k = (1 + out) * breath;
  return [l.ring.cx + l.ring.rx * k * Math.sin(a), l.ring.cy + l.ring.ry * k * Math.cos(a), 1 + 0.35 * Math.cos(a)];
};

export function ProductAssembly({ score, parts, dive, label, children }: { score: string; parts: Record<PartKind, AssemblyPart>; dive: Dive | null; label: string; children?: (part: PartKind, item: AssemblyPart) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), tags = useRef<HTMLDivElement>(null);
  const live = useRef(dive);
  live.current = dive;

  useEffect(() => {
    const el = canvas.current!, holder = box.current!, marks = tags.current!;
    const gl = el.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) { holder.dataset.flat = ""; return; }
    const float = !!gl.getExtension("EXT_color_buffer_float");
    const points = program(gl, POINT_V, POINT_F), sheet = program(gl, SCORE_V, SCORE_F), down = program(gl, QUAD, DOWN), blur = program(gl, QUAD, BLUR), final = program(gl, QUAD, FINAL);
    const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
    const quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const quadVao = gl.createVertexArray()!; gl.bindVertexArray(quadVao); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    for (const p of [sheet, down, blur, final]) { const at = gl.getAttribLocation(p, "q"); if (at >= 0) { gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0); } }
    const MAX = 6000, data = new Float32Array(MAX * 4), buffer = gl.createBuffer()!, vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, size, offset] of [["pos", 2, 0], ["size", 1, 8], ["alpha", 1, 12]] as const) { const at = gl.getAttribLocation(points, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, size, gl.FLOAT, false, 16, offset); }

    // The engraving, drawn once into a texture: dark ink on white, read back as light.
    const sheetTex = gl.createTexture()!;
    let ready = false;
    const image = new Image();
    image.onload = () => {
      const c = document.createElement("canvas"); c.width = 2000; c.height = Math.round(2000 * DOC_H / DOC_W);
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0, c.width, c.height);
      gl.bindTexture(gl.TEXTURE_2D, sheetTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
    };
    image.onerror = () => { ready = true; };
    image.src = score;

    const named = [...marks.querySelectorAll<HTMLElement>("[data-tag]")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dark = document.documentElement.classList.contains("dark");
    const theme = new MutationObserver(() => { dark = document.documentElement.classList.contains("dark"); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let size = "", W = 0, H = 0, dpr = 1, base: ReturnType<typeof target> | null = null, half: ReturnType<typeof target> | null = null, swap: ReturnType<typeof target> | null = null;
    let l = layout(1, 1), edge: [number, number][] = [], voiceX = 0;
    let started = -1, hidden = true, diveFrom = -1, raf = 0, goal: RingPlace = { cx: 0, cy: 0, rx: 1, ry: 1 };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // Hidden while another scene is shown, and waiting for the engraving: the clock starts when both are there, and
      // the parts are put together afresh each time the screen is seen.
      if (!holder.offsetParent || !ready) { if (!holder.offsetParent) hidden = true; return; }
      if (hidden) { hidden = false; started = now; diveFrom = -1; }
      const w = holder.clientWidth, h = holder.clientHeight;
      if (`${w}x${h}` !== size) {
        size = `${w}x${h}`; dpr = Math.min(window.devicePixelRatio || 1, 2); W = Math.max(1, Math.round(w * dpr)); H = Math.max(1, Math.round(h * dpr));
        el.width = W; el.height = H; base?.free(); half?.free(); swap?.free();
        base = target(gl, W, H, float); half = target(gl, Math.max(1, W >> 2), Math.max(1, H >> 2), float); swap = target(gl, Math.max(1, W >> 2), Math.max(1, H >> 2), float);
        // The names are measured before the parts are placed: unwrapped from the box's left edge, then at the width
        // they will be given. The engine's name may wrap its line to two beside the phone, never past the edge.
        const tag = (kind: PartKind) => named.find((item) => item.dataset.tag === kind)!, engine = tag("engine"), model = tag("model"), app = tag("app"), pipeline = tag("pipeline");
        const across = (el: HTMLElement, part: string) => { const range = document.createRange(); range.selectNodeContents(el.querySelector(part)!); return range.getBoundingClientRect().width; };
        const wide = (el: HTMLElement) => Math.max(across(el, ".pm-name"), across(el, ".pm-line") * 0.6);
        for (const item of named) { item.style.left = "0px"; item.style.maxWidth = "none"; }
        const fit = { gut: 0, foot: 0, stack: 0 }, column = w * 0.48 - 12;
        if (w < NARROW) { engine.style.maxWidth = model.style.maxWidth = app.style.maxWidth = `${column}px`; fit.stack = engine.offsetHeight + 10 + model.offsetHeight + 10 + app.offsetHeight; }
        else { fit.gut = Math.ceil(Math.max(wide(engine), wide(model))) + 36; fit.foot = Math.max(app.offsetHeight, pipeline.offsetHeight); }
        l = layout(w, h, fit); edge = phoneOutline(l.pcx, l.pcy, l.pw, l.ph, 1.6);
        // The engraving's name and the phone's stand on one line under both, each from its part's left edge; the
        // engine's stands left of the phone, joined to its ring by a rule (--lead), and the model's under the voice
        // that comes in to its column. On a phone the engine's, the model's and the app's stand one above the other
        // under the phone, and the engraving's under it.
        const under = Math.max(l.sy + l.sh, l.pcy + l.ph / 2) + TAG_GAP, phoneLeft = l.pcx - l.pw / 2, beside = phoneLeft - 30;
        pipeline.style.left = `${l.sx}px`; pipeline.style.top = `${l.narrow ? l.sy + l.sh + TAG_GAP : under}px`; pipeline.style.maxWidth = `${l.sw}px`;
        model.style.removeProperty("--lead");
        if (l.narrow) {
          const top = l.pcy + l.ph / 2 + TAG_GAP;
          engine.style.top = `${top}px`; engine.style.removeProperty("--lead");
          model.style.top = `${top + engine.offsetHeight + 10}px`;
          app.style.top = `${top + engine.offsetHeight + 10 + model.offsetHeight + 10}px`;
        } else {
          engine.style.left = `${beside}px`; engine.style.top = `${l.ring.cy}px`; engine.style.maxWidth = `${beside - 6}px`; engine.style.setProperty("--lead", `${l.ring.cx - l.ring.rx - beside - 16}px`);
          model.style.left = `${beside}px`; model.style.top = `${l.column.top + l.column.h + 22}px`; model.style.maxWidth = `${beside - 6}px`;
          app.style.left = `${phoneLeft}px`; app.style.top = `${under}px`; app.style.maxWidth = `${l.pw * 1.6}px`;
        }
        for (const item of named) item.dataset.side = (item === engine || item === model) && !l.narrow ? "left" : "under";
        // The voice comes in across the room left of the phone.
        voiceX = l.narrow ? Math.max(4, phoneLeft - 24) : Math.max(12, phoneLeft - Math.min(fit.gut, l.pw * 1.25));
      }
      const t = reduced ? BUILD_MS + 4000 : now - started, sec = now / 1000;
      // The dive: everything is scaled about the ring's middle and carried along with it until the ring lies on the
      // engine's own ring, its height brought to that ring's height as well.
      const leaving = live.current;
      if (leaving === null) diveFrom = -1;
      else if (diveFrom < 0) {
        diveFrom = leaving.at;
        const box = holder.getBoundingClientRect(), to = leaving.to;
        goal = to ? { cx: to.cx - box.left, cy: to.cy - box.top, rx: to.rx, ry: to.ry } : { cx: w / 2, cy: h / 2, rx: Math.min(w * 0.42, h), ry: Math.min(w * 0.42, h) * RING_FLAT };
      }
      const d = diveFrom < 0 ? 0 : ease(clamp((now - diveFrom) / DIVE_MS)), { cx, cy } = l.ring;
      const zoom = 1 + (goal.rx / l.ring.rx - 1) * d, ox = cx + (goal.cx - cx) * d, oy = cy + (goal.cy - cy) * d, squash = 1 + (goal.ry / (l.ring.ry * goal.rx / l.ring.rx) - 1) * d;
      const scale = dpr * clamp(w / 1150, 0.6, 1.1), fade = 1 - d;
      let n = 0;
      const put = (x: number, y: number, s: number, a: number, ky = 1) => { if (n >= MAX || a <= 0.002) return; data[n * 4] = (ox + (x - cx) * zoom) * dpr; data[n * 4 + 1] = (oy + (y - cy) * zoom * ky) * dpr; data[n * 4 + 2] = s * scale * (1 + 0.6 * d); data[n * 4 + 3] = a; n++; };

      // The phone's outline, drawn round from the top.
      const traced = rise(t, AT.phone, AT.phoneIn), shown = Math.floor(edge.length * traced);
      for (let i = 0; i < shown; i++) put(edge[i][0], edge[i][1], 3, 0.32 * fade);
      if (shown > 0 && shown < edge.length) put(edge[shown - 1][0], edge[shown - 1][1], 7, 1.2 * fade);

      // The notes leave the engraving one after another, in the order they are sung, and fly into the phone.
      let landed = 0;
      NOTES.forEach((note, i) => {
        const sx = l.sx + ((note[2] + note[4]) / 2 - CROP.x0) / (CROP.x1 - CROP.x0) * l.sw, sy = l.sy + ((note[3] + note[5]) / 2 - CROP.y0) / (CROP.y1 - CROP.y0) * l.sh;
        const ex = cx + LANDING[i][0] * l.pw, ey = cy + LANDING[i][1] * l.ph, mx = (sx + ex) / 2, my = Math.min(sy, ey) - l.ph * 0.28;
        const launch = AT.notes + AT.notesOver * note[0] / LAST, q = (t - launch) / AT.fly;
        if (q < 0) return;
        put(sx, sy, 14, 1.8 * Math.exp(-(t - launch) / 300) * fade);
        if (q >= 1) { landed++; put(ex, ey, 6, 1.1 * Math.exp(-(t - launch - AT.fly) / 420) * fade); return; }
        // A comet: a bright head and a tail along the way it came.
        for (let k = 0; k < 14; k++) {
          const e = ease(clamp(q - k * 0.022)), x = (1 - e) ** 2 * sx + 2 * (1 - e) * e * mx + e * e * ex, y = (1 - e) ** 2 * sy + 2 * (1 - e) * e * my + e * e * ey;
          put(x, y, k ? 7 - k * 0.35 : 11, (k ? (1 - k / 15) * 0.85 : 1.6) * fade);
        }
      });

      // The voice: a trace of the sung line comes in from the left at the height it is sung, crosses into the phone
      // and reaches the model's column, where the bin of the note sung lights; at each note a spark of that bin rises
      // into the ring.
      const col = l.column, colY = (p: number) => col.top + (0.9 - 0.8 * p) * col.h, travel = AT.voiceIn, path = Math.max(1, col.x - voiceX);
      for (let x = voiceX; x <= col.x; x += 2.4) {
        const sent = t - (x - voiceX) / path * travel;
        if (sent < AT.voice) continue;
        const p = sungAt(melodyOf(sent));
        if (p === null) continue;
        put(x, colY(p), 3.6, 0.55 * clamp((x - voiceX) / (path * 0.3)) * fade);
      }
      const arrived = t - travel, heard = rise(t, AT.voice + travel * 0.7, 500), sung = arrived >= AT.voice ? sungAt(melodyOf(arrived)) : null;
      if (heard > 0) {
        for (let i = 0; i < BINS; i++) {
          const y = col.top + col.h * i / (BINS - 1), off = sung === null ? 9 : (y - colY(sung)) / (col.h * 0.05);
          const peak = Math.exp(-off * off), spread = Math.exp(-off * off / 16);
          put(col.x, y, 4.2 + 5 * peak, (0.24 + 0.5 * spread + 1.1 * peak) * heard * fade);
        }
        const lap = Math.floor((arrived - AT.voice) * VOICE_RATE / SUNG_LOOP);
        for (const note of SUNG) for (const k of [lap - 1, lap]) {
          const at = AT.voice + travel + (note.on - SUNG_FROM + k * SUNG_LOOP) / VOICE_RATE, q = (t - at) / 520;
          if (k < 0 || q < 0 || q >= 1) continue;
          const from = colY(heightOf(note)), to = cy + l.ring.ry * 0.85;
          for (let j = 0; j < 6; j++) put(col.x, from + (to - from) * ease(clamp(q - j * 0.03)), j ? 5 - j * 0.6 : 7, (j ? 0.5 * (1 - j / 7) : 1.1) * (1 - q) * heard * fade);
        }
      }

      // The engine: the ring its own screen opens on, lit in the phone and beating with the melody's notes, harder
      // as the notes arrive.
      const lit = rise(t, AT.engine, AT.engineIn), melody = ((t - AT.engine) * 2.2) % (LAST + 1000);
      let since = Infinity;
      for (const onset of ONSETS) if (onset <= melody) since = melody - onset;
      const beat = Math.exp(-since / 200), fill = landed / NOTES.length, breath = 1 + (0.02 + 0.05 * fill) * beat * (1 - d), ringSize = clamp(l.ring.rx / 200, 0.5, 1);
      if (lit > 0) {
        RING_LANES.forEach((lane) => {
          for (let j = 0; j < RING_EACH; j++) {
            const share = (j / RING_EACH + sec * 0.012) % 1, [x, y, near] = onRing(l, share, lane.out, breath);
            const swell = Math.max(0, Math.cos((share * STAGES - sec * 0.55) * 2 * Math.PI)) ** 3;
            put(x, y, lane.size * (1 + 0.5 * swell) * near * ringSize * (1 + 0.3 * beat), lane.light * (0.36 + 0.64 * swell) * lit * (0.75 + (0.35 + 0.4 * fill) * beat) * (1 + 0.6 * d), squash);
          }
        });
        put(cx, cy, l.pw * 1.1, (0.1 + 0.08 * beat) * lit * (0.6 + 0.4 * fill) * fade * (dark ? 0.55 : 1));
      }

      // The names arrive with their parts and leave with the dive.
      for (const tag of named) {
        const from = { pipeline: AT.score + 600, app: AT.phone + 700, model: AT.voice + 900, engine: AT.engine + 400 }[tag.dataset.tag as PartKind];
        tag.style.opacity = String(rise(t, from, 500) * (1 - d));
      }

      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, base!.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      // The engraving glows up from the left.
      const reveal = rise(t, AT.score, AT.scoreIn) * 1.12;
      if (reveal > 0) {
        gl.bindVertexArray(quadVao); gl.useProgram(sheet);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sheetTex); gl.uniform1i(u(sheet, "tex"), 0);
        gl.uniform4f(u(sheet, "rect"), l.sx * dpr, l.sy * dpr, l.sw * dpr, l.sh * dpr); gl.uniform2f(u(sheet, "view"), W, H); gl.uniform3f(u(sheet, "dive"), cx * dpr, cy * dpr, zoom); gl.uniform2f(u(sheet, "shift"), (ox - cx) * dpr, (oy - cy) * dpr);
        gl.uniform4f(u(sheet, "crop"), CROP.x0 / DOC_W, CROP.y0 / DOC_H, CROP.x1 / DOC_W, CROP.y1 / DOC_H);
        gl.uniform1f(u(sheet, "level"), (dark ? 0.62 : 0.5) * fade); gl.uniform1f(u(sheet, "reveal"), reveal);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(vao); gl.useProgram(points); gl.uniform2f(u(points, "view"), W, H); gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quadVao);
      const pass = (prog: WebGLProgram, from: WebGLTexture, to: ReturnType<typeof target>, set: () => void) => { gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb); gl.viewport(0, 0, to.w, to.h); gl.useProgram(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from); gl.uniform1i(u(prog, "src"), 0); set(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
      pass(down, base!.tex, half!, () => gl.uniform2f(u(down, "texel"), 1.5 / W, 1.5 / H));
      for (let k = 0; k < 2; k++) {
        pass(blur, half!.tex, swap!, () => gl.uniform2f(u(blur, "step"), (1 + k) / half!.w, 0));
        pass(blur, swap!.tex, half!, () => gl.uniform2f(u(blur, "step"), 0, (1 + k) / half!.h));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(final);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base!.tex); gl.uniform1i(u(final, "base"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, half!.tex); gl.uniform1i(u(final, "glow"), 1);
      gl.uniform1f(u(final, "light"), dark ? 0 : 1); gl.uniform1f(u(final, "glowK"), (dark ? 0.75 : 0.8) * clamp(w / 1000, 0.5, 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);
    // The context stays with the canvas: a remount on the same canvas gets it back and builds afresh.
    return () => {
      cancelAnimationFrame(raf); theme.disconnect(); image.onload = null; base?.free(); half?.free(); swap?.free();
      for (const p of [points, sheet, down, blur, final]) gl.deleteProgram(p);
      gl.deleteTexture(sheetTex); gl.deleteBuffer(quad); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteVertexArray(quadVao);
    };
  }, [score]);

  return <div className="pa" ref={box}>
    <canvas ref={canvas} role="img" aria-label={label} />
    <div className="pa-tags" ref={tags}>
      {(["engine", "model", "app", "pipeline"] as const).map((kind) => <div key={kind} className="pa-tag" data-tag={kind}>{children?.(kind, parts[kind])}</div>)}
    </div>
  </div>;
}
