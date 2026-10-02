"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BEAT, BIN_CENTS, CHORDS, C_HI, C_LO, PF_PARTICLES, STATES, TOTAL, accompTempo, accompU, pfTempo, shapedTempo, anchorU, belief, beliefFlow, centOf, chordAt, clamp, confirmAge, coupleGain, engineEvents, recentEvents, type EngineEvents, confirmedIndex, followerTempo, frozenFor, hash, latestAnchor, modBeat, observationAt, phraseFactor, playheadU, predictedIndex, prepareFollower, salience, schedulerLead, singerU, tempoLayers, voiceAt, vqtParts } from "@/lib/example-score";
import { StepGlyph } from "@/components/step-glyphs";
import { exampleTime } from "@/lib/example-clock";
import { clockStates, drawStrip } from "@/lib/three-clocks";

// Every stage is a group in one world seen by one camera. A stage draws in its own coordinates, as it did when it
// was a card of its own; the panorama places, turns and tilts the group so it is seen from the same angle as before.
type View = { root: THREE.Group; update: (t: number, wall: number, width: number, height: number) => void; dispose: () => void; bloom?: number };
// Tags are stamped with the frame that placed them, so tags of stages that went off screen can be hidden.
type World = { overlay: HTMLElement; camera: THREE.PerspectiveCamera; frame: number; focus: number };
type Maker = (map: THREE.Texture, pixelRatio: number, stage: World) => View;

// Labels pinned to points of a stage: projected through the world camera every frame and faded with the stage.
function tagger(stage: World, space: THREE.Object3D) {
  const point = new THREE.Vector3(), made: HTMLSpanElement[] = [];
  const offset = { up: "translate(-50%, calc(-100% - 9px))", down: "translate(-50%, 9px)", left: "translate(calc(-100% - 12px), -50%)", right: "translate(12px, -50%)" };
  const make = (text: string, tone = "", side: keyof typeof offset = "up") => {
    const el = document.createElement("span");
    el.className = `scene-tag ${tone} side-${side}`; el.textContent = text; el.style.opacity = "0";
    stage.overlay.appendChild(el); made.push(el);
    return (at: number[] | null, width: number, height: number, label = text) => {
      if (!at) { el.style.opacity = "0"; return; }
      space.localToWorld(point.set(at[0], at[1], at[2])).project(stage.camera);
      if (point.z > 1 || Math.abs(point.x) > 1.1) { el.style.opacity = "0"; return; }
      el.dataset.frame = String(stage.frame);
      el.style.opacity = stage.focus.toFixed(2);
      el.style.transform = `translate(${((point.x + 1) / 2 * width).toFixed(1)}px, ${((1 - point.y) / 2 * height).toFixed(1)}px) ${offset[side]}`;
      if (el.textContent !== label) el.textContent = label;
    };
  };
  return { make, dispose: () => made.forEach((el) => el.remove()) };
}

/* ---------- Glowing primitives ---------- */
// Additive white sprites and lines on a black stage: overlapping particles brighten like light.
const POINT_VERTEX = `
attribute float size; attribute float alpha; varying float vAlpha; uniform float pixelRatio; uniform float zoom;
void main() { vAlpha = pow(alpha, 0.8); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pixelRatio * zoom * (4.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
// Point sizes were tuned for a card camera about 4.8 units away; the panorama camera stands farther back, so every
// cloud shares this factor to keep its points as large on screen as the stage around them.
const ZOOM = { value: 1 };
const POINT_FRAGMENT = `
uniform sampler2D map; varying float vAlpha;
void main() { float a = texture2D(map, gl_PointCoord).a * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vec3(1.0), a); }`;

function glowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!, gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)"); gradient.addColorStop(0.22, "rgba(255,255,255,.65)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function cloud(count: number, map: THREE.Texture, pixelRatio: number) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 3), size = new Float32Array(count), alpha = new Float32Array(count);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const material = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, pixelRatio: { value: pixelRatio }, zoom: ZOOM }, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;
  const set = (i: number, x: number, y: number, z: number, s: number, a: number) => { position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z; size[i] = s; alpha[i] = a; };
  const commit = () => { for (const name of ["position", "size", "alpha"]) geometry.getAttribute(name).needsUpdate = true; };
  const hide = (from: number) => { size.fill(0, from); alpha.fill(0, from); };
  return { object: points, set, hide, commit, dispose: () => { geometry.dispose(); material.dispose(); } };
}

// The stage renders in linear output so faint bloom stays dark; line levels are pre-encoded to keep their old brightness.
const encode = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
// Seen from the panorama's farther camera, thin guide lines read too dark; faint levels are lifted, full ones kept.
const lift = (c: number) => c ** 0.72;
function segments(count: number) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 6), color = new Float32Array(count * 6);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geometry, material); lines.frustumCulled = false;
  const set = (i: number, a: number[], b: number[], ca: number, cb = ca) => {
    position.set(a, i * 6); position.set(b, i * 6 + 3);
    color.fill(encode(lift(ca)), i * 6, i * 6 + 3); color.fill(encode(lift(cb)), i * 6 + 3, i * 6 + 6);
  };
  const commit = () => { geometry.getAttribute("position").needsUpdate = true; geometry.getAttribute("color").needsUpdate = true; };
  const clear = (from: number) => { position.fill(0, from * 6); color.fill(0, from * 6); };
  return { object: lines, set, clear, commit, dispose: () => { geometry.dispose(); material.dispose(); } };
}

/* ---------- 01 Live audio: a waterfall of recent waveforms ---------- */
// The melody sets each wave's pitch and loudness, but the drift across the screen runs on its own
// slow clock; tying it to the real carrier frequency makes the waterfall flicker instead of flow.
const FLOW = 0.05;
const cycles = (m: number) => 6 * 2 ** ((m - 60) / 12);
const carrier = (m: number, u: number, w: number, phase = 0) => Math.sin(2 * Math.PI * cycles(m) * (u + w * FLOW) + phase);
function chordWave(tau: number, u: number, w: number) {
  const c = chordAt(accompU(tau - 0.02));
  return c.amp * c.notes.reduce((sum, m, i) => sum + carrier(m, u, w, i), 0) / c.notes.length;
}
function micWave(tau: number, u: number, w: number) {
  const v = voiceAt(singerU(tau));
  const voice = v.pitch === null ? 0 : v.amp * (0.75 * carrier(v.pitch, u, w) + 0.25 * carrier(v.pitch, 2 * u, w));
  return 0.85 * voice + 0.3 * chordWave(tau, u, w);
}

const audioView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const HISTORY = 26, SAMPLES = 150, WINDOW = 0.6;
  const lanes = [{ y: 0.55, gain: 1, scale: 0.3, wave: micWave }, { y: -0.65, gain: 0.6, scale: 0.45, wave: chordWave }];
  const lines = segments(lanes.length * HISTORY * (SAMPLES - 1)), sparks = cloud(lanes.length * SAMPLES, map, pixelRatio);
  root.add(lines.object, sparks.object);
  // Dozens of stacked waveforms add up quickly, so these scenes take less bloom.
  return { root, bloom: 0.3, dispose: () => { lines.dispose(); sparks.dispose(); }, update: (t, wall) => {
    let seg = 0, dot = 0;
    lanes.forEach((lane) => {
      for (let k = 0; k < HISTORY; k++) {
        const z = -k * 0.15, fade = k ? (1 - k / HISTORY) ** 2.2 * lane.gain * 0.5 : lane.gain, t0 = t - k * 0.06, w0 = wall - k * 0.3;
        let prev: number[] = [];
        for (let i = 0; i < SAMPLES; i++) {
          const u = i / (SAMPLES - 1), v = lane.wave(t0 - (1 - u) * WINDOW, u, w0), point = [-1.7 + 3.4 * u, lane.y + v * lane.scale, z];
          if (i) lines.set(seg++, prev, point, fade);
          if (k === 0) sparks.set(dot++, point[0], point[1], z, 2 + 9 * Math.abs(v), lane.gain * (0.25 + 0.75 * Math.abs(v)));
          prev = point;
        }
      }
    });
    lines.commit(); sparks.commit();
  } };
};

/* ---------- 02 VQT: two spectrogram walls, louder cells pushed toward the viewer ---------- */
// Read like a normal spectrogram (time across, pitch up, one row per semitone); depth only adds emphasis.
const vqtView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const COLS = 96, ROWS = 60, LOW = 36, WINDOW = 3.2, rowCents = Array.from({ length: ROWS }, (_, r) => centOf(LOW + r));
  const walls: { lane: "mic" | "ref"; bottom: number; gain: number }[] = [{ lane: "mic", bottom: 0.12, gain: 1 }, { lane: "ref", bottom: -1.28, gain: 0.7 }];
  const HEIGHT = 1.12, group = new THREE.Group();
  const dots = cloud(walls.length * COLS * ROWS, map, pixelRatio), frames = segments(walls.length * 3 * 4 + walls.length * 4), box = segments(8);
  group.add(frames.object, dots.object, box.object); group.rotation.x = -0.16; root.add(group);
  let f = 0;
  walls.forEach(({ bottom, gain }) => {
    // Two offset outlines behind each wall stand in for the other channels of the stack.
    for (let layer = 2; layer >= 0; layer--) {
      const z = -layer * 0.16, c = layer ? 0.09 : 0.22 * gain, x0 = -1.75, x1 = 1.75, y0 = bottom, y1 = bottom + HEIGHT;
      frames.set(f++, [x0, y0, z], [x1, y0, z], c); frames.set(f++, [x1, y0, z], [x1, y1, z], c);
      frames.set(f++, [x1, y1, z], [x0, y1, z], c); frames.set(f++, [x0, y1, z], [x0, y0, z], c);
    }
    [48, 60, 72, 84].forEach((midi) => { const y = bottom + HEIGHT * (midi - LOW + 0.5) / ROWS; frames.set(f++, [-1.75, y, 0], [1.75, y, 0], 0.06); });
  });
  frames.commit();
  // The CNN reads a fixed window of the newest 32 columns (0.32 s) across all 12 channels.
  const wx0 = 1.7 - 3.4 * 0.32 / WINDOW, wx1 = 1.78, wy0 = walls[1].bottom - 0.04, wy1 = walls[0].bottom + HEIGHT + 0.04, wz = 0.36;
  const rect = (i: number, x0: number, y0: number, x1: number, y1: number, c: number) => {
    box.set(i, [x0, y0, wz], [x1, y0, wz], c); box.set(i + 1, [x1, y0, wz], [x1, y1, wz], c); box.set(i + 2, [x1, y1, wz], [x0, y1, wz], c); box.set(i + 3, [x0, y1, wz], [x0, y0, wz], c);
  };
  rect(0, wx0, wy0, wx1, wy1, 1);
  return { root, dispose: () => { dots.dispose(); frames.dispose(); box.dispose(); }, update: (t, wall) => {
    const scan = (wall * 0.35) % 1, ky = wy0 + (wy1 - wy0 - 0.12) * (scan < 0.5 ? scan * 2 : 2 - scan * 2);
    rect(4, wx0 + 0.04, ky, wx0 + 0.16, ky + 0.12, 1);
    box.commit();
    let i = 0;
    walls.forEach(({ lane, bottom, gain }) => {
      for (let c = 0; c < COLS; c++) {
        const parts = vqtParts(t - (1 - (c + 1) / COLS) * WINDOW, lane), x = -1.7 + 3.4 * c / (COLS - 1), edge = c === COLS - 1 ? 1.6 : 1;
        for (let r = 0; r < ROWS; r++) {
          let value = 0;
          for (const [cent, amp] of parts) value += amp * Math.exp(-((rowCents[r] - cent) ** 2) / (2 * 45 * 45));
          const k = 1 - Math.exp(-2.6 * value);
          dots.set(i++, x, bottom + HEIGHT * (r + 0.5) / ROWS, k * 0.32, (1 + 8 * k) * edge, gain * (0.04 + 0.96 * k ** 1.15));
        }
      }
    });
    dots.commit();
  } };
};

/* ---------- 03 Salience: 360 bins rising as light, two frames deep ---------- */
const salienceView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const bars = segments(360 * 2), tips = cloud(360 * 2, map, pixelRatio), grid = segments(5);
  root.add(grid.object, bars.object, tips.object);
  const xOf = (b: number) => -1.8 + 3.6 * (BIN_CENTS[b] - C_LO) / (C_HI - C_LO);
  return { root, dispose: () => { bars.dispose(); tips.dispose(); grid.dispose(); }, update: (t, wall) => {
    [36, 48, 60, 72, 84].forEach((midi, i) => { const x = xOf(Math.round((1200 * Math.log2(440 * 2 ** ((midi - 69) / 12) / 10) - C_LO) / (C_HI - C_LO) * 359)); grid.set(i, [x, 0, 0.35], [x, 0, -0.95], 0.16); });
    grid.commit();
    [salience(t - 0.01), salience(t)].forEach((frame, fi) => {
      const z = fi ? 0 : -0.6, gain = fi ? 1 : 0.5;
      frame.forEach((v, b) => {
        const x = xOf(b), top = v * 1.35;
        bars.set(fi * 360 + b, [x, 0, z], [x, top, z], 0.03 * gain, (0.1 + 0.9 * v) * gain);
        tips.set(fi * 360 + b, x, top, z, 1.4 + 20 * v, gain * (0.08 + 0.92 * v));
      });
    });
    bars.commit(); tips.commit();
  } };
};

/* ---------- Shared axes for the score and time views ---------- */
const stateX = (j: number) => -1.6 + 3.2 * (j + 0.5) / STATES.length;
const pitchY = (m: number) => -0.15 + (m - 62) / 12 * 1.1;
const SPAN = 3.2;
const timeX = (k: number, n: number) => -1.7 + 3.4 * k / (n - 1);
const scoreWindow = (t: number) => { const cur = singerU(t), lo = cur - 9, hi = cur + 1; return (v: number) => -1 + 2 * (v - lo) / (hi - lo); };

/* ---------- 04 Observation: the sung pitch as a sheet of light that notes catch ---------- */
const observationView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const J = STATES.length, LEVELS = 40, SX = 56, SY = 9, FLOOR = -0.95, COLUMN = 1.05, BACK = -0.45, FRONT = 0.3;
  const notes = segments(J * 3 + 1), sheet = cloud(SX * SY, map, pixelRatio), columns = cloud(J * LEVELS, map, pixelRatio);
  root.add(notes.object, sheet.object, columns.object);
  return { root, dispose: () => { notes.dispose(); sheet.dispose(); columns.dispose(); }, update: (t, wall) => {
    const sal = salience(t), obs = observationAt(t), v = voiceAt(singerU(t)), strength = Math.max(...sal);
    let s = 0;
    STATES.forEach((state, j) => {
      const x = stateX(j);
      if (state.pitch === null) { for (let d = 0; d < 3; d++) notes.set(s++, [x - 0.09 + d * 0.07, FLOOR, BACK], [x - 0.06 + d * 0.07, FLOOR, BACK], 0.2); return; }
      const y = pitchY(state.pitch), c = 0.28 + 0.72 * obs[j].score ** 2;
      notes.set(s++, [x - 0.09, y, BACK], [x + 0.09, y, BACK], c);
      notes.set(s++, [x - 0.09, y + 0.012, BACK], [x + 0.09, y + 0.012, BACK], c * 0.6);
      notes.set(s++, [x, y, BACK], [x, FLOOR, BACK], 0.035);
    });
    notes.set(s++, [-1.75, FLOOR, FRONT], [1.75, FLOOR, FRONT], 0.15);
    notes.commit();
    let i = 0;
    const sheetY = v.pitch === null ? 0 : pitchY(v.pitch);
    for (let a = 0; a < SX; a++) for (let b = 0; b < SY; b++) {
      const dy = (b - (SY - 1) / 2) / ((SY - 1) / 2) * 0.14, glow = v.pitch === null ? 0 : strength * Math.exp(-((dy / 0.069) ** 2) / 2);
      sheet.set(i++, -1.75 + 3.5 * a / (SX - 1), sheetY + dy, BACK + 0.02, 5.5, glow * 0.45);
    }
    sheet.commit();
    i = 0;
    obs.forEach((o, j) => {
      for (let l = 0; l < LEVELS; l++) {
        const frac = l / (LEVELS - 1), lit = frac <= o.score;
        columns.set(i++, stateX(j), FLOOR + frac * COLUMN, FRONT, lit ? 6 : 1.4, lit ? (o.rest ? 0.32 : 1) * (0.55 + 0.45 * frac) : 0.035);
      }
    });
    columns.commit();
  } };
};

/* ---------- 05 Belief: the score as tiles on the floor, probability as columns of light ---------- */
// A piano roll lies on the floor (time across, pitch into depth). Over each note stands a column of light as tall
// as the chance that the singer is there. Notes left behind stay lit (confirmed); silence freezes the columns.
const beliefView: Maker = (map, pixelRatio, stage) => {
  const root = new THREE.Group();
  const J = STATES.length, FLOOR = -0.72, HEIGHT = 1.45, LEVELS = 56, ARC = 40, KEEP = 6;
  // The floor scrolls with the singer: seven beats either side of where the singer is.
  let centreBeat = 0;
  const bx = (beat: number) => (beat - centreBeat) / 7 * 1.7, zOf = (pitch: number | null) => (pitch === null ? 0.66 : clamp(0.34 - (pitch - 64) / 8 * 0.8, -0.95, 0.5));
  const middle = (j: number) => [bx(STATES[j].start + STATES[j].dur * 0.45), FLOOR, zOf(STATES[j].pitch)];
  const tiles = segments(J * 8), columns = cloud(J * (LEVELS + 1), map, pixelRatio), flow = cloud(ARC * 2 + 28 + 6, map, pixelRatio);
  root.add(tiles.object, columns.object, flow.object);
  const tags = tagger(stage, root), hereTag = tags.make("지금 여기 · 예측", "strong"), passTag = tags.make("확정 · 지나간 음"), singerTag = tags.make("가수", "faint");
  const arc = (from: number[], to: number[], lift: number, u: number) => [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + lift * 4 * u * (1 - u), from[2] + (to[2] - from[2]) * u];
  return { root, dispose: () => { tiles.dispose(); columns.dispose(); flow.dispose(); tags.dispose(); }, update: (t, wall, width, height) => {
    centreBeat = modBeat(singerU(t));
    const bel = belief(t), pred = predictedIndex(t), conf = confirmedIndex(t), still = frozenFor(t), age = confirmAge(t), { center, leak } = beliefFlow(t);
    const lag = conf >= 0 ? pred - conf : -1;
    let s = 0;
    STATES.forEach((st, j) => {
      const x0 = Math.max(-1.75, bx(st.start) + 0.012), x1 = Math.min(1.75, bx(st.start + st.dur) - 0.03), z = zOf(st.pitch), behind = pred - j;
      if (x1 <= x0) return;
      const passed = lag >= 0 && behind >= lag && behind < lag + KEEP, level = j === pred ? 1 : passed ? 0.8 - 0.1 * (behind - lag) : 0.2;
      if (st.pitch === null) {
        for (let d = 0; d < 4; d++) { const a = x0 + (x1 - x0) * d / 4; tiles.set(s++, [a, FLOOR, z], [a + (x1 - x0) * 0.14, FLOOR, z], level * 0.8); }
        return;
      }
      tiles.set(s++, [x0, FLOOR, z - 0.05], [x1, FLOOR, z - 0.05], level); tiles.set(s++, [x1, FLOOR, z - 0.05], [x1, FLOOR, z + 0.05], level);
      tiles.set(s++, [x1, FLOOR, z + 0.05], [x0, FLOOR, z + 0.05], level); tiles.set(s++, [x0, FLOOR, z + 0.05], [x0, FLOOR, z - 0.05], level);
      if (passed || j === pred) for (let h = 1; h <= 3; h++) tiles.set(s++, [x0, FLOOR, z - 0.05 + 0.025 * h], [x1, FLOOR, z - 0.05 + 0.025 * h], level * 0.75);
    });
    tiles.clear(s); tiles.commit();

    let c = 0;
    bel.forEach((p, j) => {
      const [x, , z] = middle(j), top = FLOOR + p * HEIGHT, main = j === pred, shown = Math.abs(x) < 1.78;
      for (let l = 0; l < LEVELS; l++) {
        const y = FLOOR + l / (LEVELS - 1) * HEIGHT, lit = shown && y <= top;
        columns.set(c++, x, y, z, lit ? (main ? 9 : 6) : 0, lit ? (0.25 + 0.75 * l / (LEVELS - 1)) * Math.min(1, p * 2.2) : 0);
      }
      columns.set(c++, x, top, z, shown && p > 0.02 ? 8 + 34 * p : 0, Math.min(1, p * 1.6));
    });
    columns.commit();

    let f = 0;
    const top = (j: number) => { const m = middle(j); return [m[0], FLOOR + bel[j] * HEIGHT, m[2]]; };
    // Probability on the move: a stream from the note being left to the note just heard.
    const k = Math.floor(center), frac = center - k;
    if (frac > 0.01 && frac < 0.99 && k + 1 < J) {
      const a = top(k), b = top(k + 1);
      for (let i = 0; i < ARC; i++) { const u = (i / ARC + wall * 1.6) % 1, p = arc(a, b, 0.35, u); flow.set(f++, p[0], p[1], p[2], 5, Math.sin(Math.PI * frac) * (0.4 + 0.6 * Math.sin(Math.PI * u))); }
    }
    // Leak toward the next note as the current one reaches its written length (the duration prior).
    if (leak > 0.01 && pred + 1 < J) {
      const a = top(pred), b = top(pred + 1);
      for (let i = 0; i < ARC; i++) { const u = (i / ARC + wall * 0.7) % 1, p = arc(a, b, 0.22, u); flow.set(f++, p[0], p[1], p[2], 3, leak * 2.2 * Math.sin(Math.PI * u)); }
    }
    // A ring opens on the floor when a note is confirmed.
    if (age < 0.6 && conf >= 0) {
      const [x, y, z] = middle(conf);
      for (let i = 0; i < 28; i++) { const ang = i / 28 * Math.PI * 2, rad = 0.06 + age * 0.55; flow.set(f++, x + rad * Math.cos(ang), y, z + rad * Math.sin(ang) * 0.6, 4, 1 - age / 0.6); }
    }
    // The singer, for comparison: keeps moving through rests while the columns stand still.
    const sb = modBeat(singerU(t)), sv = voiceAt(singerU(t)), sx = bx(sb), sz = zOf(sv.pitch ?? null);
    for (let i = 0; i < 6; i++) flow.set(f++, sx, FLOOR + 0.04 * i, sz, i === 5 ? 10 : 3, 0.55);
    flow.hide(f); flow.commit();

    hereTag(top(pred).map((v, i) => (i === 1 ? v + 0.1 : v)), width, height, still > 0.08 ? "소리 없음 · 그대로 멈춤" : "지금 여기 · 예측");
    passTag(lag > 0 && Math.abs(middle(conf)[0]) < 1.7 ? middle(conf) : null, width, height);
    singerTag([sx, FLOOR + 0.24, sz], width, height);
  } };
};

/* ---------- 06 Anchors and playhead: the stairs jump, the playhead glides onto them ---------- */
// Anchors are where the predicted note starts, so they jump. The playhead extends the latest anchor at the
// tracked tempo (dashed target line) and eases onto it over a short window, so the curve it hands on never jumps.
const anchorsView: Maker = (map, pixelRatio, stage) => {
  const root = new THREE.Group();
  const N = 150, GRID = 8, NOW = 1.05, X = (t: number, tau: number) => -1.7 + (NOW + 1.7) * (1 - (t - tau) / SPAN);
  const lines = segments(N * 2 + GRID + 40), glow = cloud(N * 3 + 60 + 40, map, pixelRatio);
  root.add(lines.object, glow.object);
  const tags = tagger(stage, root), headTag = tags.make("플레이헤드", "strong", "right"), anchorTag = tags.make("앵커 · 예측 음이 바뀐 순간", "", "left"), easeTag = tags.make("0.5초에 걸쳐 따라붙음"), singerTag = tags.make("가수", "faint", "down");
  return { root, dispose: () => { lines.dispose(); glow.dispose(); tags.dispose(); }, update: (t, wall, width, height) => {
    const Y = scoreWindow(t), now = singerU(t);
    let s = 0, d = 0;
    for (let g = 0; g < GRID; g++) { const beat = Math.floor(now) - g, y = Y(beat); if (y > -1 && y < 1) lines.set(s++, [-1.7, y, -0.3], [NOW, y, -0.3], 0.03); }
    let prevA = anchorU(t - SPAN), prevX = -1.7;
    for (let k = 0; k < N; k++) {
      const tau = t - (1 - k / (N - 1)) * SPAN, a = anchorU(tau), x = X(t, tau), fresh = Math.exp(-(t - tau) / 0.6);
      lines.set(s++, [prevX, Y(prevA), 0], [x, Y(prevA), 0], 0.55);
      if (a !== prevA) { lines.set(s++, [x, Y(prevA), 0], [x, Y(a), 0], 0.55 + 0.45 * fresh); glow.set(d++, x, Y(a), 0, 10 + 26 * fresh, 0.35 + 0.65 * fresh); }
      if (k % 3 === 0) glow.set(d++, x, Y(singerU(tau)), -0.3, 2.4, 0.4);
      glow.set(d++, x, Y(playheadU(tau)), 0.12, 2.5 + 4 * (k / N) ** 2, 0.12 + 0.8 * (k / N) ** 2.2);
      prevA = a; prevX = x;
    }
    // The dashed target line from the latest anchor at the tracked rate, and the easing window.
    const la = latestAnchor(t), ax = X(t, la.time), since = t - la.time;
    for (let i = 0; i < 20; i += 2) {
      const u0 = la.time + since * i / 20, u1 = la.time + since * (i + 1) / 20;
      lines.set(s++, [X(t, u0), Y(la.beat + (u0 - la.time) * la.rate / BEAT), 0.06], [X(t, u1), Y(la.beat + (u1 - la.time) * la.rate / BEAT), 0.06], 0.7);
    }
    const easing = t < la.settle, bx1 = X(t, la.settle);
    if (easing) for (let i = 0; i < 60; i++) glow.set(d++, ax + (Math.min(bx1, NOW) - ax) * (i % 6) / 5, -0.95 + 1.9 * Math.floor(i / 6) / 9, -0.15, 9, 0.05 * (la.settle - t) / (la.settle - la.time));
    glow.set(d++, X(t, t), Y(playheadU(t)), 0.12, 30, 1);
    lines.set(s++, [-1.7, -1, 0], [NOW, -1, 0], 0.14);
    lines.clear(s); glow.hide(d);
    lines.commit(); glow.commit();
    headTag([X(t, t), Y(playheadU(t)), 0.12], width, height);
    anchorTag(ax > -1.6 ? [ax, Y(la.beat), 0] : null, width, height);
    easeTag(easing ? [(ax + Math.min(bx1, NOW)) / 2, -0.78, -0.15] : null, width, height);
    singerTag([X(t, t), Y(singerU(t)), -0.3], width, height);
  } };
};

/* ---------- 07 Tempo: candidate tempos, tested at every note and read at the median ---------- */
// Each dot is one guess at the singer's tempo. When the playhead passes a note, the gap just measured tests every
// guess: the ones that fit light up, the rest fade, and the survivors are copied and nudged apart. The median of the
// survivors is the estimate. Below, the phrase shaping planned from the score multiplies it.
const ease01 = (x: number) => { const v = clamp(x); return v * v * (3 - 2 * v); };
const tempoView: Maker = (map, pixelRatio, stage) => {
  const root = new THREE.Group();
  const N = PF_PARTICLES, ARCH_N = 160, RULER = -0.12, TOP = 0.6;
  const X = (v: number) => clamp((v - 1) / 0.3, -1.1, 1.1) * 1.5, Yp = (i: number) => 0.28 + (hash(i * 5.5) - 0.5) * 0.62, Zp = (i: number) => (hash(i * 2.3) - 0.5) * 0.2;
  const AX = (b: number) => -1.55 + 3.1 * b / TOTAL, AY = (f: number) => -0.74 + (f - 1) * 1.25;
  const dots = cloud(N * 2 + ARCH_N + 8, map, pixelRatio), lines = segments(28);
  root.add(lines.object, dots.object);
  const tags = tagger(stage, root), medianTag = tags.make("추정 템포", "strong"), measureTag = tags.make("방금 잰 템포", "", "right"), archTag = tags.make("밀당", "faint", "right");
  const ticks = [0.8, 1, 1.2].map((v) => ({ v, tag: tags.make(`${v.toFixed(1)}×`, "faint", "down") }));
  return { root, dispose: () => { dots.dispose(); lines.dispose(); tags.dispose(); }, update: (t, wall, width, height) => {
    const [prev, cur] = tempoLayers(t, 2), since = t - cur.time;
    const rise = ease01(since / 0.12), split = ease01((since - 0.12) / 0.3), settle = ease01((since - 0.25) / 0.17);
    let d = 0, s = 0;
    // The guesses going in: lit by how well each fits the gap just measured, then fading as the survivors take over.
    cur.before.forEach((v, j) => { const fit = cur.fit[j]; dots.set(d++, X(v), Yp(j), Zp(j), 3 + 7 * fit * rise, (1 - split) * (0.7 * (1 - rise) + rise * (0.06 + 0.94 * fit))); });
    // The survivors: each starts on the good guess it was copied from and drifts to its nudged value.
    cur.cloud.forEach((v, i) => {
      const p = cur.parent[i], u = split;
      dots.set(d++, X(cur.before[p]) + (X(v) - X(cur.before[p])) * u, Yp(p) + (Yp(i) - Yp(p)) * u, Zp(p) + (Zp(i) - Zp(p)) * u, 4, 0.7 * u);
    });
    // The measured tempo rises as a dashed line; the median needle then slides to the new estimate.
    const mx = X(cur.observed);
    for (let k = 0; k < 10; k += 2) lines.set(s++, [mx, RULER + 0.08 * k * rise, 0], [mx, RULER + 0.08 * (k + 1) * rise, 0], 1 - 0.65 * settle);
    if (since < 0.35) dots.set(d++, mx, RULER + 0.8 * rise, 0, 24, 1 - since / 0.35);
    const m = prev.median + (cur.median - prev.median) * settle, nx = X(m);
    lines.set(s++, [nx, RULER - 0.04, 0.05], [nx, TOP, 0.05], 1); dots.set(d++, nx, TOP, 0.05, 16, 1);
    lines.set(s++, [X(0.7), RULER, 0], [X(1.3), RULER, 0], 0.35);
    for (const v of [0.8, 0.9, 1, 1.1, 1.2]) lines.set(s++, [X(v), RULER - 0.04, 0], [X(v), RULER + 0.04, 0], v === 1 ? 0.6 : 0.3);
    // The phrase shaping planned from the score, with the playhead on it.
    const cursor = modBeat(playheadU(t)), f = phraseFactor(cursor);
    lines.set(s++, [-1.55, AY(1), 0], [1.55, AY(1), 0], 0.12);
    lines.set(s++, [AX(cursor), AY(0.78), 0], [AX(cursor), AY(1.15), 0], 0.45);
    for (let k = 0; k < ARCH_N; k++) { const b = TOTAL * k / (ARCH_N - 1); dots.set(d++, AX(b), AY(phraseFactor(b)), 0, 2.2, 0.4); }
    dots.set(d++, AX(cursor), AY(f), 0, 15, 1);
    lines.clear(s); dots.hide(d);
    lines.commit(); dots.commit();
    medianTag([nx, TOP + 0.04, 0.05], width, height, `추정 템포 ${m.toFixed(2)}×`);
    measureTag(rise > 0.05 && settle < 0.99 ? [mx, RULER + 0.45, 0] : null, width, height, `방금 잰 템포 ${cur.observed.toFixed(2)}×`);
    archTag([AX(cursor), AY(f), 0], width, height, `밀당 ×${f.toFixed(2)}`);
    ticks.forEach(({ v, tag }) => tag([X(v), RULER - 0.06, 0], width, height));
  } };
};

/* ---------- 08 Accompaniment position: three paths separated in depth ---------- */
const accompView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const N = 160;
  const paths = segments((N - 1) * 2 + 2), glow = cloud(N * 2 + 1, map, pixelRatio);
  root.add(paths.object, glow.object);
  return { root, dispose: () => { paths.dispose(); glow.dispose(); }, update: (t, wall) => {
    const Y = scoreWindow(t);
    let s = 0, d = 0, prev: number[][] = [];
    for (let k = 0; k < N; k++) {
      const tau = t - (1 - k / (N - 1)) * SPAN, x = timeX(k, N);
      const pts = [[x, Y(playheadU(tau)), -0.25], [x, Y(accompU(tau)), 0]];
      if (k) { paths.set(s++, prev[0], pts[0], 0.3); paths.set(s++, prev[1], pts[1], 1); }
      if (k % 3 === 0) glow.set(d++, x, Y(singerU(tau)), -0.5, 2.4, 0.32);
      glow.set(d++, x, pts[1][1], 0, 3.6, 0.2 + 0.5 * (k / N) ** 1.5);
      prev = pts;
    }
    glow.set(d++, timeX(N - 1, N), Y(accompU(t)), 0, 26, 1);
    paths.set(s++, [-1.7, -1, 0], [1.7, -1, 0], 0.13);
    paths.set(s++, [-1.7, -1, 0], [-1.7, 1, 0], 0.13);
    paths.clear(s); glow.hide(d);
    paths.commit(); glow.commit();
  } };
};

/* ---------- 09 Schedule: notes cross a curtain of light and fire ---------- */
const scheduleView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const CHORD_SLOTS = 6, SPARKS = 16, FLOOR = -0.6, CURTAIN = 12 * 16;
  const bars = segments(CHORD_SLOTS * 3 * 2 + 5), light = cloud(CURTAIN + CHORD_SLOTS * 3 * (SPARKS + 1), map, pixelRatio);
  root.add(bars.object, light.object);
  const zOf = (m: number) => 0.85 - (m - 40) / 18 * 1.7;
  return { root, dispose: () => { bars.dispose(); light.dispose(); }, update: (t, wall) => {
    const a = accompU(t), lo = a - 1.5, hi = a + 4.5, look = schedulerLead(t);
    const X = (b: number) => -1.7 + 3.4 * (b - lo) / (hi - lo), xa = X(a);
    let s = 0, d = 0;
    for (let r = 0; r < 12; r++) for (let c = 0; c < 16; c++) light.set(d++, xa, FLOOR + 1.3 * r / 11, -0.9 + 1.8 * c / 15, 4, 0.18 + 0.12 * (1 - r / 11));
    bars.set(s++, [xa, FLOOR, -0.95], [xa, FLOOR, 0.95], 0.9);
    bars.set(s++, [xa, FLOOR + 1.3, -0.95], [xa, FLOOR + 1.3, 0.95], 0.6);
    bars.set(s++, [xa, FLOOR, -0.95], [xa, FLOOR + 1.3, -0.95], 0.6);
    bars.set(s++, [xa, FLOOR, 0.95], [xa, FLOOR + 1.3, 0.95], 0.6);
    bars.set(s++, [X(a + look), FLOOR, -0.95], [X(a + look), FLOOR, 0.95], 0.5);
    const first = Math.floor(lo / 2);
    for (let k = first; k < first + CHORD_SLOTS; k++) {
      const start = k * 2, [root, steps] = CHORDS[((k % CHORDS.length) + CHORDS.length) % CHORDS.length];
      steps.forEach((step, si) => {
        const z = zOf(root + step), x0 = Math.max(-1.75, X(start)), x1 = Math.min(1.75, X(start + 1.9)), fired = start <= a + look, soon = !fired && start <= a + look + 0.25;
        if (x1 > x0) {
          bars.set(s++, [x0, FLOOR, z], [x1, FLOOR, z], fired ? 1 : soon ? 0.6 : 0.22);
          bars.set(s++, [x0, FLOOR + 0.02, z], [x1, FLOOR + 0.02, z], fired ? 0.45 : 0.07);
        }
        if (X(start) > -1.75 && X(start) < 1.75) light.set(d++, X(start), FLOOR, z, fired ? 9 : 3, fired ? 1 : 0.22);
        const age = (a + look - start) * BEAT;
        if (fired && age < 0.9) for (let p = 0; p < SPARKS; p++) {
          const h = hash(k * 31 + si * 7 + p), angle = hash(k * 17 + si * 3 + p * 5) * Math.PI * 2, r = 0.25 * age * hash(p * 11 + k);
          light.set(d++, X(start) + r * Math.cos(angle), FLOOR + age * (0.5 + 0.9 * h), z + r * Math.sin(angle), 3.5, Math.exp(-age / 0.3) * 0.9);
        }
      });
    }
    bars.clear(s); light.hide(d);
    bars.commit(); light.commit();
  } };
};

/* ---------- 10 Output: the accompaniment waterfall and the cursor on the score ---------- */
const outputView: Maker = (map, pixelRatio) => {
  const root = new THREE.Group();
  const HISTORY = 24, SAMPLES = 150, WINDOW = 0.6, RIBBON = -0.95, ax = (b: number) => -1.6 + 3.2 * b / TOTAL;
  const lines = segments(HISTORY * (SAMPLES - 1) + STATES.length + 1), glow = cloud(SAMPLES + 1, map, pixelRatio);
  root.add(lines.object, glow.object);
  return { root, bloom: 0.3, dispose: () => { lines.dispose(); glow.dispose(); }, update: (t, wall) => {
    let s = 0, d = 0;
    for (let k = 0; k < HISTORY; k++) {
      const z = -k * 0.15, fade = k ? (1 - k / HISTORY) ** 2.2 * 0.5 : 1, t0 = t - k * 0.06, w0 = wall - k * 0.3;
      let prev: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const u = i / (SAMPLES - 1), v = chordWave(t0 - (1 - u) * WINDOW, u, w0), point = [-1.7 + 3.4 * u, 0.3 + v * 0.45, z];
        if (i) lines.set(s++, prev, point, fade);
        if (k === 0) glow.set(d++, point[0], point[1], z, 2 + 9 * Math.abs(v), 0.25 + 0.75 * Math.abs(v));
        prev = point;
      }
    }
    STATES.forEach((state) => {
      if (state.pitch === null) return;
      const y = RIBBON + (state.pitch - 62) * 0.03;
      lines.set(s++, [ax(state.start), y, 0.4], [ax(state.start + state.dur * 0.9), y, 0.4], 0.3);
    });
    const cx = ax(modBeat(accompU(t)));
    lines.set(s++, [cx, RIBBON - 0.15, 0.4], [cx, RIBBON + 0.45, 0.4], 1);
    glow.set(d++, cx, RIBBON + 0.45, 0.4, 22, 1);
    lines.clear(s); glow.hide(d);
    lines.commit(); glow.commit();
  } };
};

type Vec3 = [number, number, number];
// How a stage was framed when it was a card: the camera stood `radius` from `target` and `height` above it, turned by
// `base` and swaying by `sway`.
type Pose = { target: Vec3; radius: number; height: number; base: number; sway?: number };
type Stage = { title: string; data: string; make: Maker; pose: Pose; legend?: string[]; live?: (t: number) => string };
const OBJECTS: Stage[] = [
  { title: "라이브 오디오", data: "마이크 + 직전 반주 · 장치 SR 모노 f32 → 32 kHz", make: audioView,
    pose: { target: [0, -0.05, -1.7], radius: 5.3, height: 1.35, base: -0.25 },
    legend: ["위 = 마이크", "아래 = 직전 반주(되먹임)"] },
  { title: "피치 특징 (VQT)", data: "배음 6 × 마이크·되먹임 = 12채널 × 360빈 · 10ms마다 컬럼 1개", make: vqtView,
    pose: { target: [0, -0.05, 0], radius: 5.1, height: 0.4, base: -0.2, sway: 0.08 },
    legend: ["위 = 마이크 6채널", "아래 = 되먹임 6채널", "오른쪽 상자 = CNN 입력 창 · 최근 32칸", "시간 → 최신", "피치 ↑ 반음 한 줄"] },
  { title: "음높이 salience", data: "CNN 로짓 360 → sigmoid · 한 창에서 2프레임 · 칸마다 0~1 독립", make: salienceView,
    pose: { target: [0.3, 0.5, -0.3], radius: 4.3, height: 0.95, base: -0.35 },
    legend: ["C2 · C3 · C4 · C5 · C6 → 피치"],
    live: (t) => { const v = voiceAt(singerU(t)); if (v.pitch === null || v.amp < 0.05) return "쉼표 · 소리 없음"; const sal = salience(t); return `최대 ${Math.max(...sal).toFixed(2)} · 합 ${sal.reduce((a, x) => a + x, 0).toFixed(1)}`; } },
  { title: "음표별 관측 점수", data: "음표마다 폭 75 cent 종 모양 창 · 쉼표 = 1 − 최대 salience", make: observationView,
    pose: { target: [0, -0.15, 0], radius: 4.7, height: 0.7, base: -0.32 },
    legend: ["뒤: 악보 음표 · 빛 = 가수 음높이", "앞: 음표별 점수 기둥", "같은 높이 음표는 같은 점수"] },
  { title: "지금 악보 어디쯤인가", data: "HSMM Forward · Poisson 지속시간 · 소리가 없으면 그대로 멈춤", make: beliefView,
    pose: { target: [0, -0.12, 0.05], radius: 4.2, height: 1.55, base: -0.18 },
    legend: ["빛 기둥 높이 = 그 음에 있을 확률", "바닥 = 악보 음표 · 앞줄 점선 = 쉼표", "악보 →"] },
  { title: "계단을 매끄러운 위치로", data: "예측 음이 바뀌면 앵커 · 확정마다 템포 갱신 · 0.5초에 걸쳐 수렴", make: anchorsView,
    pose: { target: [0, 0, 0], radius: 4.4, height: 0.45, base: -0.3 },
    legend: ["계단 = 앵커 · 점선 = 목표선 · 빛 = 플레이헤드 · 점 = 가수", "연주 시간 → · 악보 위치 ↑"],
    live: (t) => `추종 템포 ${followerTempo(t).toFixed(2)}×` },
  { title: "얼마나 빠르게 따라갈까", data: "입자필터: 음이 지날 때만 후보 갱신(실제 1000개, 그림 150개) · 중앙값 × 밀당(평균 1)", make: tempoView,
    pose: { target: [0, -0.12, 0], radius: 4.5, height: 0.3, base: -0.1 },
    legend: ["점 하나 = 템포 후보 하나", "아래 = 악보에서 미리 정한 밀당"],
    live: (t) => { const m = pfTempo(t), s = shapedTempo(t); return `반주 템포 = ${m.toFixed(2)} × 밀당 ${(s / m).toFixed(2)} = ${s.toFixed(2)}×`; } },
  { title: "반주 위치 곡선", data: "템포로 밀고 위치로 천천히 보정 · 실연 tau 1.5", make: accompView,
    pose: { target: [0, 0, -0.25], radius: 4.5, height: 0.85, base: 0.45 },
    legend: ["점 = 가수 · 가는 선 = 플레이헤드 · 빛 = 반주", "연주 시간 →", "멈추거나 뒤로 가지 않음"] },
  { title: "음 발화 일정", data: "위치가 음표 시작을 처음 넘는 틱에 발화 · 50ms 앞당김", make: scheduleView,
    pose: { target: [0, -0.2, 0], radius: 4.6, height: 1.25, base: -0.72 },
    legend: ["빛 커튼 = 반주 위치", "커튼을 지난 음표가 발화", "악보 →"] },
  { title: "반주 오디오와 커서", data: "44.1 kHz 합성 → 장치 SR · 위치·배속 → 화면 커서", make: outputView,
    pose: { target: [0, -0.1, -1.3], radius: 5.3, height: 1.2, base: -0.25 },
    legend: ["반주 오디오", "아래 = 악보 위 화면 커서"],
    live: (t) => `반주 속도 ${accompTempo(t).toFixed(2)}×` },
];
const STEPS = ["VQT 앞단 · 새 컬럼만 계산", "CNN 본체 · 인과 2D 합성곱 14층", "관측 모델 · 종 모양 창", "HSMM Forward · Poisson 지속시간", "확정 규칙 · 템포 에이전트 · 플레이헤드", "입자필터 · 앵커를 넘을 때만", "결합 · 상보 필터", "스케줄러 · 50ms 앞당김", "합성 · 44.1 kHz", "되먹임 · 다음 블록의 입력"];

/* ---------- The panorama: one row of stages with the processing steps between them ---------- */
// The last stage is repeated before the first and the first three after the last, so the camera wraps without a jump.
const N = OBJECTS.length, WORLD = [N - 1, ...OBJECTS.map((_, i) => i), 0, 1, 2];
const SPACING = 5.2, FOV = 30, TILT = 0.16, GLIDE_MS = 1700, AUTOPLAY_MS = 6000;
const stageX = (k: number) => (k - 1) * SPACING;
// Wide screens show two stages side by side with the step between them in the middle; narrow ones show one stage.
const pairs = (aspect: number) => aspect > 1.3;
const stagesAcross = (aspect: number) => (pairs(aspect) ? clamp(aspect * 0.92, 1.95, 2.3) : 1.15);
// What is flowing out of each stage right now; the step symbol after the stage lights with it.
const voiceLevel = (t: number) => { const v = voiceAt(singerU(t)); return v.pitch === null ? 0 : v.amp; };
const LINK_LEVEL: ((t: number) => number)[] = [
  (t) => clamp(0.12 + 0.75 * voiceLevel(t) + 0.25 * chordAt(accompU(t)).amp),
  (t) => 0.1 + 0.9 * voiceLevel(t),
  (t) => 0.1 + 0.9 * voiceLevel(t),
  // The Forward only moves on evidence; an octave slip is sound but not evidence.
  (t) => (frozenFor(t) > 0 ? 0.06 : 0.85),
  (t) => (frozenFor(t) > 0 ? 0.06 : 0.4),
  // The playhead keeps extrapolating through silence.
  () => 0.35,
  (t) => 0.25 + 0.75 * coupleGain(t),
  // The accompaniment position never stops.
  () => 0.9,
  () => 0.4,
  (t) => 0.15 + 0.85 * chordAt(accompU(t)).amp,
];
// Steps that act only on their own events flash when one happens: a confirmed note updates the tempo agent, a
// crossed onset turns the particle filter, a chord fires and is synthesised.
const LINK_EVENTS: (keyof EngineEvents | null)[] = [null, null, null, null, "confirm", "crossing", null, "fire", "fire", null];
const FLASH = 0.18;

// The three clocks, and which of them the stage in view builds: listening and locating make the follower clock,
// anchors and tempo bridge it to the accompaniment, and the last stages are the accompaniment clock.
const CLOCKS = [{ name: "가수", mark: "○" }, { name: "추종기", mark: "■" }, { name: "반주", mark: "◆" }];
const BUILDS = [
  { upTo: 4, rows: [1], text: "추종기의 시계를 만든다 · 들은 소리로 악보 위치를 찾는다" },
  { upTo: 6, rows: [1, 2], text: "두 시계를 잇는다 · 앵커와 템포가 반주로 넘어간다" },
  { upTo: 9, rows: [2], text: "반주의 시계를 만든다 · 멈추지 않고 따라붙는다" },
];
const pad = (n: number) => String(n).padStart(2, "0");

// "Process · detail" labels: the process name reads first, the detail sits underneath.
function StepLabel({ text }: { text: string }) {
  const [head, ...rest] = text.split(" · ");
  return <><b>{head}</b>{rest.length > 0 && <small>{rest.join(" · ")}</small>}</>;
}

export function SignalChain3D() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), overlayRef = useRef<HTMLDivElement>(null);
  // Titles above the stages and captions at the bottom travel with their stage.
  const titles = useRef<(HTMLElement | null)[]>([]), captions = useRef<(HTMLElement | null)[]>([]), lives = useRef<(HTMLElement | null)[]>([]), steps = useRef<(HTMLElement | null)[]>([]);
  const sectionRef = useRef<HTMLElement>(null), stripRef = useRef<HTMLCanvasElement>(null), statusRefs = useRef<(HTMLElement | null)[]>([]);
  const held = useRef(false), visible = useRef(true), sectionVisible = useRef(true), reduceRef = useRef(false), currentRef = useRef(0);
  // The camera position in stages, gliding from one stage to the next or following a drag.
  const scroll = useRef({ s: 0, from: 0, to: 0, start: 0, glide: false, drag: null as { x: number; s: number } | null });

  const glideTo = useCallback((to: number) => {
    const c = scroll.current;
    if (reduceRef.current) { c.s = ((to % N) + N) % N; c.glide = false; return; }
    c.from = c.s; c.to = to; c.start = performance.now(); c.glide = true;
  }, []);
  const go = useCallback((delta: number) => {
    const c = scroll.current, base = Math.round(c.glide ? c.to : c.s);
    // Going back from the first stage starts from its copy after the last one.
    if (base + delta < 0) { c.s += N; glideTo(base + N + delta); return; }
    glideTo(base + delta);
  }, [glideTo]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceRef.current = reduced; if (reduced) setPlaying(false);
    const canvas = canvasRef.current!, viewport = viewportRef.current!, overlay = overlayRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(pixelRatio); renderer.setClearColor(new THREE.Color().setRGB(5 / 255, 5 / 255, 5 / 255, THREE.LinearSRGBColorSpace), 1);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200), world: World = { overlay, camera, frame: 0, focus: 1 };
    const map = glowTexture(), views = WORLD.map((o) => OBJECTS[o].make(map, pixelRatio, world));
    // Each stage stands at its place in the row, centred on its old camera target and scaled to a common size.
    const holders = WORLD.map((o, k) => {
      const { pose } = OBJECTS[o], holder = new THREE.Group();
      views[k].root.position.set(-pose.target[0], -pose.target[1], -pose.target[2]);
      holder.position.x = stageX(k); holder.scale.setScalar(4.7 / pose.radius); holder.add(views[k].root); scene.add(holder);
      return holder;
    });
    const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.2), output = new OutputPass();
    composer.setPixelRatio(pixelRatio); composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(output);
    let size = "";
    const seen = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; }); seen.observe(viewport);
    const sectionSeen = new IntersectionObserver(([entry]) => { sectionVisible.current = entry.isIntersecting; }); sectionSeen.observe(sectionRef.current!);
    // The strip is a plain 2D canvas sized to its box at the device pixel ratio.
    const paint = (el: HTMLCanvasElement | null, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
      if (!el) return;
      const w = el.clientWidth, h = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      const ctx = el.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(ctx, w, h);
    };
    const font = getComputedStyle(document.body).fontFamily;
    const p = new THREE.Vector3();
    // A label placed at a world point, faded with its distance from the stage in view.
    const place = (el: HTMLElement | null | undefined, x: number, y: number, z: number, focus: number, w: number, h: number, anchor = "translate(-50%, -100%)") => {
      if (!el) return;
      p.set(x, y, z).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.25 || focus <= 0) { el.style.opacity = "0"; return; }
      el.style.opacity = focus.toFixed(2);
      el.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px, ${((1 - p.y) / 2 * h).toFixed(1)}px) ${anchor}`;
    };
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!sectionVisible.current) return;
      const wall = (now - start) / 1000, t = reduced ? 2.1 : exampleTime(now), motion = reduced ? 0 : wall;
      paint(stripRef.current, (ctx, w, h) => drawStrip(ctx, w, h, t, font));
      const states = clockStates(t), texts = [states.scene.name, states.scene.note, states.singer, states.follower, states.accomp];
      texts.forEach((value, k) => { const el = statusRefs.current[k]; if (el && el.textContent !== value) el.textContent = value; });
      if (!visible.current) return;
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (`${w}x${h}` !== size) { size = `${w}x${h}`; renderer.setSize(w, h, false); composer.setSize(w, h); }

      const c = scroll.current;
      if (c.glide) {
        const q = clamp((now - c.start) / GLIDE_MS), e = q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2;
        c.s = c.from + (c.to - c.from) * e;
        if (q >= 1) { c.glide = false; c.s = c.to; if (c.s >= N) { c.s -= N; c.to -= N; } }
      }
      const index = ((Math.round(c.s) % N) + N) % N;
      if (index !== currentRef.current) { currentRef.current = index; setCurrent(index); }

      const aspect = w / h, across = stagesAcross(aspect), half = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), distance = across * SPACING / (2 * half * aspect), paired = pairs(aspect), camX = (c.s + (paired ? 0.5 : 0)) * SPACING;
      viewport.dataset.pairs = paired ? "1" : "0";
      camera.aspect = aspect; camera.updateProjectionMatrix();
      // A stage spans about 0.72 of its slot; as a card it spanned about 450 px.
      ZOOM.value = distance / 4.8 * clamp(w / across * 0.72 / 450, 0.5, 1.2);
      camera.position.set(camX + 0.3 * Math.sin(motion * 0.17), distance * Math.tan(TILT) + 0.15 * Math.sin(motion * 0.11), distance);
      camera.lookAt(camX, -0.1, 0); camera.updateMatrixWorld();
      const reach = distance * half * aspect + SPACING * 0.6, focusOf = (x: number) => clamp(1 - (Math.abs(x - camX) - (paired ? SPACING / 2 : 0)) / SPACING, 0.15, 1);

      world.frame++;
      let soft = 0;
      holders.forEach((holder, k) => {
        const o = WORLD[k], { pose } = OBJECTS[o], x = stageX(k), sway = (pose.sway ?? 0.22) * 0.6 * Math.sin(motion * 0.25 + o * 0.9);
        holder.rotation.set(Math.atan2(pose.height, pose.radius) - TILT, -(pose.base + sway), 0);
        holder.visible = Math.abs(x - camX) < reach;
        holder.updateMatrixWorld(true);
        place(titles.current[k], x, 1.7, 0, holder.visible ? focusOf(x) : 0, w, h);
        if (!holder.visible) return;
        world.focus = focusOf(x);
        views[k].update(t, motion, w, h);
        if (views[k].bloom !== undefined) soft = Math.max(soft, clamp(1.6 - (Math.abs(x - camX) - (paired ? SPACING / 2 : 0)) / SPACING));
      });
      for (const el of overlay.children) if (el instanceof HTMLElement && el.dataset.frame !== String(world.frame)) el.style.opacity = "0";

      // Captions keep their place at the bottom, left and right as before, and slide sideways with their stage. A caption
      // fades while its stage passes the middle, where it changes from a right-hand to a left-hand caption.
      const capW = paired ? (w - 72) / 2 : w - 28, screenX = (x: number) => (p.set(x, -1.65, 0).project(camera).x + 1) / 2 * w;
      const restLeft = screenX(camX - (paired ? SPACING / 2 : 0)), restRight = screenX(camX + SPACING / 2);
      WORLD.forEach((o, k) => {
        const el = captions.current[k];
        if (!el) return;
        const x = stageX(k), rel = (x - camX) / SPACING;
        if (Math.abs(rel) > 1.6) { el.style.opacity = "0"; return; }
        const right = paired && rel > 0, shift = screenX(x) - (right ? restRight : restLeft);
        el.classList.toggle("is-right", right);
        // With one stage on screen a caption is as wide as the screen, so the next one fades in as it arrives.
        el.style.opacity = (paired ? clamp(Math.abs(rel) / 0.25) : clamp((1 - Math.abs(rel)) * 1.4)).toFixed(2);
        el.style.transform = `translateX(${((right ? w - 20 - capW : paired ? 20 : 14) + shift).toFixed(1)}px)`;
        const live = OBJECTS[o].live, readout = lives.current[k];
        if (live && readout) { const value = live(t); if (readout.textContent !== value) readout.textContent = value; }
      });

      // The step symbols stand between the stages, centred on the row.
      const events = engineEvents();
      for (let k = 0; k < WORLD.length - 1; k++) {
        const from = WORLD[k], mid = stageX(k) + SPACING / 2, el = steps.current[k];
        if (!el) continue;
        if (Math.abs(mid - camX) > reach) { el.style.opacity = "0"; continue; }
        place(el, mid, 0.05, 0, focusOf(mid), w, h, "translate(-50%, -50%)");
        el.style.setProperty("--level", LINK_LEVEL[from](t).toFixed(2));
        const kind = LINK_EVENTS[from];
        el.classList.toggle("is-firing", kind !== null && recentEvents(events[kind], t, FLASH).length > 0);
        if (from === 3) el.dataset.state = String(predictedIndex(t) % 4);
        if (from === 6) el.style.setProperty("--gain", coupleGain(t).toFixed(2));
      }
      // The waterfall stages stack many lines, so they take less bloom.
      bloom.strength = 0.8 - 0.5 * soft;
      composer.render();
    };
    frame = requestAnimationFrame(tick);
    const warm = window.setTimeout(prepareFollower, 300);
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(warm); seen.disconnect(); sectionSeen.disconnect();
      views.forEach((view) => view.dispose()); bloom.dispose(); output.dispose(); composer.dispose(); map.dispose(); renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => { if (!held.current && visible.current && !scroll.current.drag) go(1); }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, go]);

  // Dragging moves the camera along the row; letting go settles on the nearest stage.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const c = scroll.current;
    c.glide = false; c.drag = { x: event.clientX, s: c.s };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const c = scroll.current, el = viewportRef.current;
    if (!c.drag || !el) return;
    let s = c.drag.s - (event.clientX - c.drag.x) / (el.clientWidth / stagesAcross(el.clientWidth / el.clientHeight));
    if (s < -0.5) { s += N; c.drag.s += N; } else if (s > N - 0.5) { s -= N; c.drag.s -= N; }
    c.s = s;
  };
  const onPointerUp = () => {
    const c = scroll.current;
    if (!c.drag) return;
    c.drag = null; setDragging(false); glideTo(Math.round(c.s));
  };

  const shown = [current, (current + 1) % N], built = BUILDS.find((b) => current <= b.upTo)!;
  return <section className="chain chain3d" aria-label="소리가 반주가 되기까지" ref={sectionRef}
    onMouseEnter={() => { held.current = true; }} onMouseLeave={() => { held.current = false; }}>
    <div className="chain-head">
      <div><p className="chain-kicker">반주 엔진 안쪽</p><h4>소리가 들어와 반주가 되기까지</h4></div>
      <div className="ctrl">
        <button type="button" aria-label="이전 단계" onClick={() => go(-1)}>←</button>
        <p className="counter num">{pad(shown[0] + 1)} <span>→ {pad(shown[1] + 1)}</span></p>
        <button type="button" aria-label="다음 단계" onClick={() => go(1)}>→</button>
        <button type="button" className="chain-play" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "자동 재생"}</button>
      </div>
    </div>
    <div className="clock-strip">
      <p className="clock-title"><strong>세 개의 시계</strong><span>가수는 관측할 뿐 만들 수 없고, 추종기는 증거가 없으면 멈추고, 반주는 멈추지도 뒤로 가지도 튀지도 않습니다.</span></p>
      <p className="clock-scene"><b ref={(el) => { statusRefs.current[0] = el; }} /><span ref={(el) => { statusRefs.current[1] = el; }} /></p>
      <div className="clock-grid">
        <div className="clock-rows">
          {CLOCKS.map((clock, k) => <p key={clock.name} className={built.rows.includes(k) ? "is-built" : undefined}><i aria-hidden="true">{clock.mark}</i><b>{clock.name}</b><span ref={(el) => { statusRefs.current[k + 2] = el; }} /></p>)}
        </div>
        <canvas ref={stripRef} className="clock-track" aria-hidden="true" />
      </div>
      <p className="clock-built">지금 보는 단계 {pad(shown[0] + 1)}·{pad(shown[1] + 1)} → {built.text}</p>
    </div>
    <div className={`pano${dragging ? " is-dragging" : ""}`} ref={viewportRef} role="img" aria-label={shown.map((i) => `${pad(i + 1)} ${OBJECTS[i].title}: ${OBJECTS[i].data}`).join(" / ")}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <canvas className="chain-gl" ref={canvasRef} aria-hidden="true" />
      <div className="pano-labels" aria-hidden="true">
        {WORLD.map((o, k) => <span key={k} className="pano-title" ref={(el) => { titles.current[k] = el; }}><span className="num">{pad(o + 1)}</span>{OBJECTS[o].title}</span>)}
        {WORLD.slice(0, -1).map((o, k) => <span key={k} className="pano-step" ref={(el) => { steps.current[k] = el; }}><StepGlyph step={o} /><span className="pano-step-label"><StepLabel text={STEPS[o]} /></span></span>)}
      </div>
      <div className="pano-labels" ref={overlayRef} aria-hidden="true" />
      <div className="pano-hud" aria-hidden="true">
        {WORLD.map((o, k) => <div key={k} className="pano-cap" ref={(el) => { captions.current[k] = el; }}>
          <p className="pano-hud-head"><span className="num">{pad(o + 1)}</span><strong>{OBJECTS[o].title}</strong><em className="num" ref={(el) => { lives.current[k] = el; }} /></p>
          <p>{OBJECTS[o].data}</p>
          {OBJECTS[o].legend && <p className="pano-legend">{OBJECTS[o].legend.join(" · ")}</p>}
        </div>)}
      </div>
    </div>
    <div className="chain-segs">{OBJECTS.map((item, i) => <button type="button" key={item.title} className={i === current ? "on" : undefined} aria-label={`${i + 1}번 ${item.title}로 이동`} onClick={() => glideTo(i)} />)}</div>
    <p className="figure-note">반주 엔진의 열 단계를 한 장면에 이은 그림입니다. 단계 사이 기호는 처리를, 번쩍임은 확정·입자필터 갱신·화음 발화 같은 사건을 뜻합니다. 전주·긴 숨·옥타브 실수·느려짐을 넣은 예시 연주이며, 5번 확률 분포만 설명용 모형이고 나머지는 실제 식으로 계산합니다.</p>
  </section>;
}
