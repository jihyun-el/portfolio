"use client";

import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BLOOM_RADIUS, FALLOFF, LIGHT_BLOOM, LIGHT_FALLOFF, LIGHT_RADIUS, RAMP, ZOOM, cloud, glowTexture, isDark, ribbon, segments } from "@/lib/glow-3d";
import { BEAT, BIN_CENTS, CHORDS, C_HI, C_LO, PF_PARTICLES, STATES, TOTAL, accompTempo, accompU, pfTempo, shapedTempo, anchorU, belief, beliefFlow, centOf, chordAt, clamp, confirmAge, coupleGain, engineEvents, recentEvents, type EngineEvents, confirmedIndex, followerTempo, frozenFor, hash, latestAnchor, modBeat, observationAt, phraseFactor, playheadU, predictedIndex, prepareFollower, salience, schedulerLead, singerTempo, singerU, tempoLayers, voiceAt, vqtParts } from "@/lib/example-score";
import { StepGlyph } from "@/components/step-glyphs";
import { StepGo, heading, phrase } from "@/components/step-parts";
import { exampleTime } from "@/lib/example-clock";
import { clockStates, drawStrip } from "@/lib/three-clocks";
import { setSceneStep } from "@/lib/scene-step";
import { useSceneLeave } from "@/lib/scene-shown";
import { useSceneMiddle } from "@/lib/scene-middle";

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
  const tags = tagger(stage, root), hereTag = tags.make("현재 위치 · 예측", "strong"), passTag = tags.make("확정 · 지난 음표"), singerTag = tags.make("가수", "faint");
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

    hereTag(top(pred).map((v, i) => (i === 1 ? v + 0.1 : v)), width, height, still > 0.08 ? "무음 · 추정 정지" : "현재 위치 · 예측");
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
  const tags = tagger(stage, root), headTag = tags.make("추정 위치", "strong", "right"), anchorTag = tags.make("기준점 · 예측 음표가 바뀐 시점", "", "left"), easeTag = tags.make("이차 곡선으로 수렴"), singerTag = tags.make("가수", "faint", "down");
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
  const tags = tagger(stage, root), medianTag = tags.make("추정 템포", "strong"), measureTag = tags.make("직전 측정 템포", "", "right"), archTag = tags.make("프레이즈", "faint", "right");
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
    measureTag(rise > 0.05 && settle < 0.99 ? [mx, RULER + 0.45, 0] : null, width, height, `직전 측정 템포 ${cur.observed.toFixed(2)}×`);
    archTag([AX(cursor), AY(f), 0], width, height, `프레이즈 ×${f.toFixed(2)}`);
    ticks.forEach(({ v, tag }) => tag([X(v), RULER - 0.06, 0], width, height));
  } };
};

/* ---------- 08 The three clocks as tempos, one lane each in depth ---------- */
// Each position differentiated once. The three tempos nearly coincide, so each clock stands in its own lane, from the
// follower at the back through the accompaniment to the singer in front, with its own floor, its own 1× line and a
// faint wall under its curve. The singer's tempo is the one inherent in its true position, so it runs on through rests.
// The playhead's frame-to-frame speed is left unsmoothed on purpose: it stalls while waiting for evidence and rushes
// when it arrives. Each lane's floor runs on past its right end into its name, so a name never sits on another lane.
const HEAD_DT = 0.01;
const headTempo = (t: number) => (playheadU(t) - playheadU(t - HEAD_DT)) / HEAD_DT * BEAT;
const LANES = [
  { name: "추정", z: -1.05, line: 0.6, wall: 0.07, tempo: headTempo },
  { name: "재생", z: -0.3, line: 0.65, wall: 0.09, tempo: accompTempo },
  { name: "가수", z: 0.45, line: 0.65, wall: 0.09, tempo: singerTempo },
];
const accompView: Maker = (map, pixelRatio, stage) => {
  const root = new THREE.Group();
  const N = 160, HW = 1.5, TOP = 2, FLOOR = -0.85, Y = (r: number) => FLOOR + 1.6 * clamp(r / TOP), L = LANES.length, FRONT = LANES[L - 1].z;
  const X = (k: number) => -HW + 2 * HW * k / (N - 1);
  const walls = LANES.map(() => ribbon(N)), paths = segments(L * (N - 1) + L * 2 + 3), glow = cloud(L, map, pixelRatio);
  walls.forEach((w) => root.add(w.object)); root.add(paths.object, glow.object);
  const tags = tagger(stage, root), names = LANES.map((lane) => tags.make(lane.name, "faint", "right"));
  const ticks = [0, 1, 2].map((v) => ({ v, tag: tags.make(`${v}×`, "faint", "left") }));
  return { root, dispose: () => { walls.forEach((w) => w.dispose()); paths.dispose(); glow.dispose(); tags.dispose(); }, update: (t, wall, width, height) => {
    let s = 0;
    LANES.forEach((lane, j) => {
      let prev: number[] = [];
      for (let k = 0; k < N; k++) {
        const tau = t - (1 - k / (N - 1)) * SPAN, x = X(k), pt = [x, Y(lane.tempo(tau)), lane.z];
        if (k) paths.set(s++, prev, pt, lane.line);
        walls[j].set(k, x, pt[1], FLOOR, lane.z, lane.wall);
        prev = pt;
      }
      walls[j].commit();
      glow.set(j, HW, Y(lane.tempo(t)), lane.z, 12, 0.9);
      paths.set(s++, [-HW, FLOOR, lane.z], [HW + 0.12, FLOOR, lane.z], 0.2);
      paths.set(s++, [-HW, Y(1), lane.z], [HW, Y(1), lane.z], 0.24);
      names[j]([HW + 0.12, FLOOR, lane.z], width, height);
    });
    paths.set(s++, [-HW, FLOOR, LANES[0].z], [-HW, FLOOR, FRONT], 0.16);
    paths.set(s++, [HW, FLOOR, LANES[0].z], [HW, FLOOR, FRONT], 0.16);
    paths.set(s++, [-HW, FLOOR, FRONT], [-HW, Y(TOP), FRONT], 0.16);
    paths.clear(s);
    paths.commit(); glow.commit();
    ticks.forEach(({ v, tag }) => tag([-HW, Y(v), FRONT], width, height));
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
// `line` is the problem the stage answers, or the decision made there, as one heading (the engine detail's card line);
// the picture is the answer.
// `span` is how far the picture reaches to each side of its middle, where that is further than most.
type Stage = { title: string; line: string; make: Maker; pose: Pose; span?: number; legend?: string[]; live?: (t: number) => string };
const OBJECTS: Stage[] = [
  { title: "라이브 오디오", line: "재생한 반주의 마이크 재유입 → 반주 제거, 가수 음높이만 추출", make: audioView,
    pose: { target: [0, -0.05, -1.7], radius: 5.3, height: 1.35, base: -0.25 },
    legend: ["위 = 마이크", "아래 = 직전 반주(참조)"] },
  { title: "VQT 전처리", line: "마이크 6채널 + 엔진이 재생한 반주 6채널(참조 채널)", make: vqtView,
    pose: { target: [0, -0.05, 0], radius: 5.1, height: 0.4, base: -0.2, sway: 0.08 }, span: 3.1,
    legend: ["위 = 마이크 6채널", "아래 = 참조 6채널", "오른쪽 상자 = CNN 입력 32프레임", "시간 → 최신", "음높이 ↑ 반음 한 줄"] },
  { title: "음높이 분포", line: "보컬 분리 · 음높이 추정 두 모델 → 14층 CNN 하나로 통합", make: salienceView,
    pose: { target: [0.3, 0.5, -0.3], radius: 4.3, height: 0.95, base: -0.35 },
    legend: ["C2 · C3 · C4 · C5 · C6 → 음높이"],
    live: (t) => { const v = voiceAt(singerU(t)); if (v.pitch === null || v.amp < 0.05) return "쉼표 · 소리 없음"; const sal = salience(t); return `최대 ${Math.max(...sal).toFixed(2)} · 합 ${sal.reduce((a, x) => a + x, 0).toFixed(1)}`; } },
  { title: "음표별 우도", line: "FFT 스펙트럼 · 음표 템플릿 비교 → FCPE argmax 이전 분포를 음표별 우도로", make: observationView,
    pose: { target: [0, -0.15, 0], radius: 4.7, height: 0.7, base: -0.32 },
    legend: ["뒤: 악보 음표 · 빛 = 가수 음높이", "앞: 음표별 우도 기둥", "같은 높이 음표는 같은 우도"] },
  { title: "악보 위치 추정", line: "무음 구간: 관측 정보 없음 → 위치 진행 없이 추정 정지", make: beliefView,
    pose: { target: [0, -0.12, 0.05], radius: 4.2, height: 1.55, base: -0.18 },
    legend: ["빛 기둥 높이 = 그 음에 있을 확률", "바닥 = 악보 음표 · 앞줄 점선 = 쉼표", "악보 →"] },
  { title: "위치 평활화", line: "연주자 템포는 연속적 → 계단형 추정을 연속 위치로 변환", make: anchorsView,
    pose: { target: [0, 0, 0], radius: 4.4, height: 0.45, base: -0.3 },
    legend: ["계단 = 기준점 · 점선 = 목표선 · 빛 = 추정 위치 · 점 = 가수", "연주 시간 → · 악보 위치 ↑"],
    live: (t) => `확정에서 측정한 템포 ${followerTempo(t).toFixed(2)}×` },
  { title: "템포 추정", line: "템포는 직접 관측 불가 → 추정 템포로 예측 가능하게 외삽, 남는 오차는 가수와 반주가 서로 맞추며 축소", make: tempoView,
    pose: { target: [0, -0.12, 0], radius: 4.5, height: 0.3, base: -0.1 },
    legend: ["점 하나 = 템포 후보 하나", "아래 = 악보에서 미리 정한 프레이즈 템포 곡선"],
    live: (t) => { const m = pfTempo(t), s = shapedTempo(t); return `반주 템포 = ${m.toFixed(2)} × 프레이즈 ${(s / m).toFixed(2)} = ${s.toFixed(2)}×`; } },
  { title: "세 위치의 템포", line: "추정 위치: 정확하나 지터 과다로 반주에 직접 사용 불가 → 목표는 예측 가능하고, 음악적으로 자연스러운 반주", make: accompView,
    pose: { target: [0.3, -0.45, -0.3], radius: 4.4, height: 1.3, base: 0.42, sway: 0.05 },
    legend: ["앞 → 뒤: 가수(실제 위치에서 역산) · 재생 · 추정", "높이 = 템포 · 줄마다 가운데 선 = 1×(악보 빠르기)", "연주 시간 →"],
    live: (t) => `가수 ${singerTempo(t).toFixed(2)}× · 추정 ${headTempo(t).toFixed(2)}× · 재생 ${accompTempo(t).toFixed(2)}×` },
  { title: "음표 예약 재생", line: "미래 참조 2프레임 · 연산 지연 → 음표 예약 재생으로 상쇄", make: scheduleView,
    pose: { target: [0, -0.2, 0], radius: 4.6, height: 1.25, base: -0.72 },
    legend: ["빛 커튼 = 재생 위치", "커튼을 지난 음표가 재생", "악보 →"] },
  { title: "반주 오디오와 커서", line: "최종 기준: 최악 조건인 저전력 모드에서의 안정 동작", make: outputView,
    pose: { target: [0, -0.1, -1.3], radius: 5.3, height: 1.2, base: -0.25 },
    legend: ["반주 오디오", "아래 = 악보 위 화면 커서"],
    live: (t) => `반주 템포 ${accompTempo(t).toFixed(2)}×` },
];
const STEPS = ["VQT 전처리 · 새 프레임만 계산", "CNN · 인과 2D 합성곱 14층", "관측 모델 · 가우시안 가중치", "HSMM 전방 추론 · 포아송 지속 시간", "확정 규칙 · 템포 갱신 · 추정 위치", "입자 필터 · 기준점 통과 시 갱신", "결합 · 상보 필터", "스케줄러 · 선행 예약", "합성 · 44.1 kHz", "참조 반주 · 다음 블록의 입력"];

/* ---------- The panorama: one row of stages with the processing steps between them ---------- */
// The last stage is repeated before the first and the first three after the last, so the camera wraps without a jump.
const N = OBJECTS.length, WORLD = [N - 1, ...OBJECTS.map((_, i) => i), 0, 1, 2];
const SPACING = 5.2, FOV = 30, TILT = 0.16, GLIDE_MS = 1700, AUTOPLAY_MS = 6000;
// The wide shot stands the stages on a ring lying flat and looks at it from the front and a little above, because
// the engine runs in a ring: what the last stage plays comes back into the first. The first stage stands at the
// front, the largest, and the rest go round to the right and back, smaller the further away they stand. The ring is
// `x` across and `z` deep from its middle; a stage at its side is turned `turn` outwards. The signal runs round it
// at `floor`, the height of the stages' feet. The camera stands `away` from the ring's middle and looks down on it
// by `tilt`.
const RING = { x: 14, z: 9.5, turn: 0.72, floor: -1.75, away: 17.7, tilt: 0.41 }, RING_X = (N - 1) / 2 * SPACING;
const ringAngle = (stage: number) => stage / N * 2 * Math.PI;
// The point of the ring at an angle from its front, `out` further out than the stages and at height `y`.
const ringPoint = (angle: number, out = 0, y = 0): Vec3 => [RING_X + (RING.x + out) * Math.sin(angle), y, (RING.z + out) * Math.cos(angle)];
// How far to the side and how far up and down the ring reaches as that camera sees it, as tangents of the angle from
// straight ahead, so the lens can be opened just wide enough to hold all of it.
const RING_VIEW = (() => {
  const eye = [RING_X, RING.away * Math.tan(RING.tilt), RING.away], ahead = [0, -0.1 - eye[1], -eye[2]], length = Math.hypot(ahead[1], ahead[2]), fy = ahead[1] / length, fz = ahead[2] / length;
  let side = 0, top = -Infinity, bottom = Infinity;
  const see = (x: number, y: number, z: number) => {
    const depth = (y - eye[1]) * fy + (z - eye[2]) * fz, up = ((y - eye[1]) * -fz + (z - eye[2]) * fy) / depth;
    side = Math.max(side, Math.abs(x - eye[0]) / depth); top = Math.max(top, up); bottom = Math.min(bottom, up);
  };
  // The corners of every stage, and the stream all the way round.
  for (let stage = 0; stage < N; stage++) {
    const angle = ringAngle(stage), [x, , z] = ringPoint(angle), wide = 1.9 * Math.cos(RING.turn * Math.sin(angle));
    for (const dx of [-wide, wide]) for (const y of [RING.floor, 1.75]) see(x + dx, y, z);
  }
  for (let k = 0; k < 72; k++) see(...ringPoint(k / 72 * 2 * Math.PI, 0.6, RING.floor - 0.5));
  return { side, top, bottom };
})();
// What the engine does, in order, and the stages that do it.
const ACTS = [
  { name: "듣는다", what: "마이크 입력에서 가수의 음높이를", from: 0, to: 2 },
  { name: "찾는다", what: "악보에서 현재 위치를", from: 3, to: 4 },
  { name: "친다", what: "그 위치에 맞춰 반주를", from: 5, to: 9 },
];
// The points of light that make the ring: three lanes of evenly spaced points, the middle one the strongest.
const STREAM_LANES = [{ out: -0.36, size: 6.5, light: 0.6 }, { out: 0, size: 9.5, light: 1 }, { out: 0.36, size: 6.5, light: 0.6 }], STREAM_EACH = 250, STREAM = STREAM_LANES.length * STREAM_EACH;
// The wide shot needs room for ten stages; a phone or a narrow window keeps one stage at a time.
const ROOMY = "(min-width: 900px)", FLIGHT_MS = 1500;
// Where the stylesheet stacks the picture over its words; the same condition as there.
const STACKED = "(max-aspect-ratio: 5/4), (max-width: 680px)";
// One stage on the home where the side buttons stand outside the picture; where they lie over it, `LONE` keeps their margin.
const ALONE = 1.14;
const ease = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2);
// The camera frames `W` world units across, centred on (x, y).
type Shot = { x: number; y: number; W: number };
// Wide screens show two stages side by side with the step between them in the middle; narrow ones show
// one stage. A phone shows one however short its view is, so the width decides as well as the shape.
const pairs = (w: number, h: number) => w / h > 1.3 && w >= 600;
// A lone stage keeps a margin on both sides for the side buttons.
const LONE = 1.32;
const stagesAcross = (w: number, h: number) => (pairs(w, h) ? clamp(w / h * 0.92, 1.95, 2.3) : LONE);
// The stages reach this far down from the top of the view, as a share of the width one stage is given.
const STAGE_DEPTH = 0.68;
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
const CLOCKS = [{ name: "가수", mark: "○" }, { name: "추정", mark: "■" }, { name: "재생", mark: "◆" }];
const BUILDS = [
  { upTo: 4, rows: [1], text: "추정 위치 산출 · 입력 음성으로 악보 위치를 추정한다" },
  { upTo: 6, rows: [1, 2], text: "추정을 반주로 전달 · 기준점과 템포를 반주에 넘긴다" },
  { upTo: 9, rows: [2], text: "재생 위치 산출 · 정지 없이 추정을 추종한다" },
];
const pad = (n: number) => String(n).padStart(2, "0");

// "Process · detail" labels: the process name reads first, the detail sits underneath.
function StepLabel({ text }: { text: string }) {
  const [head, ...rest] = text.split(" · ");
  return <><b>{head}</b>{rest.length > 0 && <small>{rest.join(" · ")}</small>}</>;
}

// A measured result that the stages arrive at, keyed by the stage it stands beside.
export type StageResults = Record<number, { value: string; unit?: string; label: string }>;
// With `solo` one stage is on screen at a time and its text stands beside the picture instead of under it. A view
// with room opens on the wide shot of all the stages, and `note` is the one line that shot carries.
export function SignalChain3D({ title = "소리가 들어와 반주가 되기까지", solo = false, results, note, project }: { title?: string; solo?: boolean; results?: StageResults; note?: string; project?: string }) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [roomy, setRoomy] = useState(() => solo && window.matchMedia(ROOMY).matches);
  const [wide, setWide] = useState(roomy);
  const wideRef = useRef(wide), actsBox = useRef<HTMLDivElement>(null), sayBox = useRef<HTMLDivElement>(null), numbers = useRef<(HTMLElement | null)[]>([]), stripBox = useRef<HTMLDivElement>(null), clocksRef = useRef(false), pick = useRef<(x: number, y: number) => number>(() => 0), press = useRef<{ x: number; y: number } | null>(null);
  // The frame loop reads the shot once the view has been laid out for it.
  useLayoutEffect(() => { wideRef.current = wide; }, [wide]);
  useEffect(() => {
    if (!solo) return;
    const query = window.matchMedia(ROOMY), onChange = () => { setRoomy(query.matches); if (!query.matches) setWide(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [solo]);
  const viewportRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), overlayRef = useRef<HTMLDivElement>(null);
  // Titles above the stages and captions at the bottom travel with their stage.
  const titles = useRef<(HTMLElement | null)[]>([]), captions = useRef<(HTMLElement | null)[]>([]), lives = useRef<(HTMLElement | null)[]>([]), steps = useRef<(HTMLElement | null)[]>([]);
  const sectionRef = useRef<HTMLElement>(null), stripRef = useRef<HTMLCanvasElement>(null), statusRefs = useRef<(HTMLElement | null)[]>([]);
  const held = useRef(false), visible = useRef(true), sectionVisible = useRef(true), reduceRef = useRef(false), currentRef = useRef(0);
  const soloRef = useRef(solo), soloLive = useRef<HTMLParagraphElement>(null);
  // On the home, a detail that opens over this figure reads the stage that was showing; the whole ring is none.
  useEffect(() => { if (solo) setSceneStep("engine", wide ? null : pad(current + 1)); }, [solo, wide, current]);
  // The camera position in stages, gliding from one stage to the next or following a drag.
  const scroll = useRef({ s: 0, from: 0, to: 0, start: 0, glide: false, drag: null as { x: number; s: number } | null });
  // Leaving the home screen sends the figure back to where it opens: the whole ring where there is one, the first
  // stage otherwise, playing. The camera is set there without a flight (`jump` holds the shot to land on).
  const jump = useRef<boolean | null>(null), wrapRef = useRef<HTMLDivElement>(null);
  useSceneMiddle(wrapRef);
  useSceneLeave(() => {
    const c = scroll.current; c.s = c.from = c.to = 0; c.glide = false; c.drag = null;
    jump.current = roomy; setWide(roomy); setPlaying(!reduceRef.current); held.current = false;
  });

  const glideTo = useCallback((to: number) => {
    const c = scroll.current;
    if (reduceRef.current) { c.s = ((to % N) + N) % N; c.glide = false; return; }
    c.from = c.s; c.to = to; c.start = performance.now(); c.glide = true;
  }, []);
  // Leaving the wide shot for a stage: the camera flies in from where it is.
  const enter = useCallback((to: number) => { const c = scroll.current; c.s = c.to = to; c.glide = false; setWide(false); }, []);
  const go = useCallback((delta: number) => {
    const c = scroll.current, base = Math.round(c.glide ? c.to : c.s);
    if (wideRef.current) { enter(delta > 0 ? 0 : N - 1); return; }
    // Where there is a wide shot it stands before the first stage and after the last one.
    if (roomy && (base + delta < 0 || base + delta >= N)) { setWide(true); return; }
    // Going back from the first stage starts from its copy after the last one.
    if (base + delta < 0) { c.s += N; glideTo(base + N + delta); return; }
    glideTo(base + delta);
  }, [glideTo, enter, roomy]);

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
    // In a close shot the stages stand in the row; for the wide shot they move to the ring, each copy to its original's place.
    const rowSpots = WORLD.map((_, k): Vec3 => [(k - 1) * SPACING, 0, 0]), ringSpots = soloRef.current ? WORLD.map((o) => ringPoint(ringAngle(o))) : rowSpots, spots = rowSpots.map((spot): Vec3 => [...spot]);
    const holders = WORLD.map((o, k) => {
      const { pose } = OBJECTS[o], holder = new THREE.Group();
      views[k].root.position.set(-pose.target[0], -pose.target[1], -pose.target[2]);
      holder.position.x = spots[k][0]; holder.scale.setScalar(4.7 / pose.radius); holder.add(views[k].root); scene.add(holder);
      return holder;
    });
    // A line stays one pixel wide however small its stage is drawn, so in the wide shot the lines are dimmed; the
    // stages that stack many of them would otherwise fill in.
    const inks = holders.map((holder) => { const found: THREE.Material[] = []; holder.traverse((part) => { if (part instanceof THREE.LineSegments) found.push(part.material as THREE.Material); }); return found; });
    // The shot last drawn, with the width and the place of its view, and the flight from one shot to another. A
    // flight starts at `spread` (0 in the row, 1 on the ring) and keeps the stage `anchor`, which stood at `at`, in the picture.
    let drawn = { x: 0, y: 0, W: 0, w: 0, cx: 0, cy: 0, spread: wideRef.current ? 1 : 0 }, wasWide = wideRef.current;
    let flight: (Shot & { spread: number; anchor: number; at: Vec3; start: number }) | null = null;
    // The ring is the signal itself: points of light running round from stage to stage. Each stretch is as bright as
    // what is flowing out of the stage it leaves, and a swell of light travels along it from that stage to the next.
    const stream = cloud(STREAM, map, pixelRatio);
    stream.object.visible = false; scene.add(stream.object);
    // How much of the view the strip of the three positions covers, eased so the picture makes room for it smoothly.
    let cover = 0, before = performance.now();
    // Stacked, how far the wide shot's picture reaches down past its own row, and how much of that it has taken.
    const stackedQuery = window.matchMedia(STACKED);
    let gapKey = "", rowGap = 0, under = -1, opened = -1;
    const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, BLOOM_RADIUS, 0.2), output = new OutputPass();
    composer.setPixelRatio(pixelRatio); composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(output);
    // The theme can change while the panorama is open; the strip reads the same flag every frame.
    const ramp = new ShaderPass(RAMP); composer.addPass(ramp);
    let dark = true;
    const applyTheme = () => { dark = isDark(); ramp.uniforms.light.value = dark ? 0 : 1; bloom.radius = dark ? BLOOM_RADIUS : LIGHT_RADIUS; FALLOFF.value = dark ? 1 : LIGHT_FALLOFF; };
    applyTheme();
    const theme = new MutationObserver(applyTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    let size = "", band = 0;
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
    // The stage nearest to a point of the page: a press on the wide shot opens it.
    pick.current = (pageX, pageY) => {
      const at = viewport.getBoundingClientRect();
      let best = 0, least = Infinity;
      for (let i = 0; i < N; i++) {
        const [x, y, z] = spots[i + 1], d = Math.hypot(at.left + (p.set(x, y, z).project(camera).x + 1) / 2 * at.width - pageX, at.top + (1 - p.y) / 2 * at.height - pageY);
        if (d < least) { least = d; best = i; }
      }
      return best;
    };
    const start = performance.now();
    let frame = 0, told = false, box = viewport.getBoundingClientRect();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!sectionVisible.current) return;
      const wall = (now - start) / 1000, t = reduced ? 2.1 : exampleTime(now), motion = reduced ? 0 : wall;
      paint(stripRef.current, (ctx, w, h) => drawStrip(ctx, w, h, t, font, dark));
      const states = clockStates(t), texts = [states.scene.name, states.scene.note, states.singer, states.follower, states.accomp];
      texts.forEach((value, k) => { const el = statusRefs.current[k]; if (el && el.textContent !== value) el.textContent = value; });
      if (!visible.current) return;
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (`${w}x${h}` !== size) { size = `${w}x${h}`; renderer.setSize(w, h, false); composer.setSize(w, h); band = soloRef.current ? 0 : (viewport.querySelector<HTMLElement>(".pano-hud")?.offsetHeight ?? 0) * 0.85; }

      const c = scroll.current;
      if (c.glide) {
        const q = clamp((now - c.start) / GLIDE_MS);
        c.s = c.from + (c.to - c.from) * ease(q);
        if (q >= 1) { c.glide = false; c.s = c.to; if (c.s >= N) { c.s -= N; c.to -= N; } }
      }
      const index = ((Math.round(c.s) % N) + N) % N;
      if (index !== currentRef.current) { currentRef.current = index; setCurrent(index); }
      if (soloLive.current) { const value = OBJECTS[index].live?.(t) ?? ""; if (soloLive.current.textContent !== value) soloLive.current.textContent = value; }

      // The captions cover a band at the bottom of the view. In a view too short to hold the stages above
      // that band the camera pulls back and the picture moves up; a taller view is unchanged.
      // On the home the strip lies over the foot of the view while its stages are open; the picture moves up and back to clear it.
      // Stacked, the words and the strip stand under the picture and cover nothing. There the wide shot's picture
      // reaches down over their place to the foot of the strip, so the ring has the height of all three; the acts
      // stand at the foot of that picture and the ring keeps clear of them.
      const strip = stripBox.current, say = sayBox.current, names = actsBox.current, stacked = soloRef.current && stackedQuery.matches;
      const room = stacked && names ? names.offsetHeight + 30 : 0;
      if (stacked && say && strip) {
        const key = `${window.innerWidth}x${window.innerHeight}`;
        if (key !== gapKey) { gapKey = key; rowGap = parseFloat(getComputedStyle(viewport.parentElement!).rowGap) || 0; }
        const below = Math.max(0, strip.getBoundingClientRect().bottom - say.getBoundingClientRect().top + rowGap);
        if (Math.abs(below - under) > 0.5) { under = below; sectionRef.current!.style.setProperty("--under", `${below.toFixed(1)}px`); }
      }
      const covered = stacked ? room * drawn.spread : soloRef.current && clocksRef.current && strip ? Math.max(0, viewport.getBoundingClientRect().bottom - strip.getBoundingClientRect().top) : 0;
      cover += (covered - cover) * Math.min(1, (now - before) / 240); before = now;
      if (Math.abs(covered - cover) < 0.3) cover = covered;
      sectionRef.current!.style.setProperty("--cover", `${cover.toFixed(1)}px`);
      const aspect = w / h, base = soloRef.current ? (viewport.offsetLeft > 40 ? ALONE : LONE) : stagesAcross(w, h), fit = clamp((h - band - cover) * base / (STAGE_DEPTH * w), 0.45, 1), lift = Math.max(0, band / 2 - h * 0.11) + cover / 2;
      const close = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), paired = !soloRef.current && pairs(w, h), wideNow = wideRef.current, cx = viewport.offsetLeft + w / 2, cy = viewport.offsetTop + h / 2;
      // The wide shot opens the lens until the ring fits the view both ways, with room round it for the stages'
      // numbers and for the side buttons where they lie over the picture, and keeps the camera where it is.
      const open = Math.max((RING_VIEW.top - RING_VIEW.bottom) / 2 * (1 + 60 / h) * (stacked ? h / Math.max(1, h - cover) : 1), RING_VIEW.side * (1 + (viewport.offsetLeft > 40 ? 64 : 172) / w) / aspect);
      // What the camera frames: the stage in view, or the whole ring.
      const aim: Shot = wideNow ? { x: RING_X, y: 0, W: 2 * open * aspect * RING.away } : { x: (c.s + (paired ? 0.5 : 0)) * SPACING, y: 0, W: base / fit * SPACING };
      // Where the words stand beside the picture the view changes size when the shot changes. The flight starts from
      // the camera that draws the same picture in the new view, and the stage it started on keeps its way across the
      // view, so it never leaves the picture. A view that changes size for another reason is simply redrawn.
      if (jump.current !== null && wideNow === jump.current) { jump.current = null; wasWide = wideNow; flight = null; }
      if (wideNow !== wasWide) {
        wasWide = wideNow;
        if (!reduced && drawn.w > 0) { const px = drawn.w / drawn.W; flight = { x: drawn.x + (cx - drawn.cx) / px, y: drawn.y - (cy - drawn.cy) / px, W: w / px, spread: drawn.spread, anchor: index, at: [...spots[index + 1]], start: now }; }
      }
      let { x: camX, y: camY, W } = aim, spread = wideNow ? 1 : 0;
      if (flight) {
        const q = clamp((now - flight.start) / FLIGHT_MS), e = ease(q), at = (from: number, to: number) => from + (to - from) * e, k = flight.anchor + 1, to = wideNow ? ringSpots[k] : rowSpots[k];
        spread = at(flight.spread, spread); W = Math.exp(at(Math.log(flight.W), Math.log(aim.W)));
        const hereX = rowSpots[k][0] + (ringSpots[k][0] - rowSpots[k][0]) * spread, hereY = rowSpots[k][1] + (ringSpots[k][1] - rowSpots[k][1]) * spread;
        camX = hereX - at((flight.at[0] - flight.x) / flight.W, (to[0] - aim.x) / aim.W) * W; camY = hereY - at((flight.at[1] - flight.y) / flight.W, (to[1] - aim.y) / aim.W) * W;
        if (q >= 1) flight = null;
      }
      drawn = { x: camX, y: camY, W, w, cx, cy, spread };
      // The stylesheet sizes the stacked picture by this, so its box changes with the flight and not ahead of it.
      const share = stacked ? spread : 0;
      if (share !== opened && (share === 0 || share === 1 || Math.abs(share - opened) > 0.0005)) { opened = share; sectionRef.current!.style.setProperty("--spread", share.toFixed(4)); }
      // The row wraps into the ring as the shot widens.
      if (ringSpots !== rowSpots) spots.forEach((spot, k) => { for (let n = 0; n < 3; n++) spot[n] = rowSpots[k][n] + (ringSpots[k][n] - rowSpots[k][n]) * spread; holders[k].position.set(spot[0], spot[1], spot[2]); });
      // The lens opens and the camera rises as the shot widens. What is written inside a stage shows in a close
      // shot, the names of the acts in a wide one.
      const half = close + (open - close) * spread, tilt = TILT + (RING.tilt - TILT) * spread, raise = lift - spread * (RING_VIEW.top + RING_VIEW.bottom) / 2 / open * h / 2;
      const across = W / SPACING, distance = W / (2 * half * aspect), near = clamp(1 - spread * 2.5), far = clamp(spread * 2 - 1), flying = wideNow || spread > 0;
      viewport.dataset.pairs = paired ? "1" : "0";
      camera.aspect = aspect; camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half));
      if (raise !== 0) camera.setViewOffset(w, h, 0, raise, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      // A stage spans about 0.72 of its slot; as a card it spanned about 450 px.
      ZOOM.value = distance / 4.8 * clamp(w / across * 0.72 / 450, 0.5 - 0.16 * spread, 1.2);
      // The stage a flight follows stands in front of the ring's middle while it is on the ring. The camera backs off
      // by part of that on the way, or it would pass close by the stage and the stage would swell.
      const back = spots[(flight ? flight.anchor : index) + 1][2] * (1 - spread) * 1.3;
      camera.position.set(camX + 0.3 * Math.sin(motion * 0.17), camY + distance * Math.tan(tilt) + 0.15 * Math.sin(motion * 0.11), distance + back);
      camera.lookAt(camX, camY - 0.1, back); camera.updateMatrixWorld();
      const reach = distance * half * aspect + SPACING * 0.6, reachY = distance * half + SPACING * 0.6;
      const off = (x: number, y: number) => Math.max(Math.abs(x - camX) - (paired ? SPACING / 2 : 0), Math.abs(y - camY)), focusOf = (x: number, y: number) => Math.max(far, clamp(1 - off(x, y) / SPACING, 0.15, 1));

      world.frame++;
      let soft = 0;
      const hub = [(p.set(RING_X, 0, 0).project(camera).x + 1) / 2 * w, (1 - p.y) / 2 * h];
      holders.forEach((holder, k) => {
        const o = WORLD[k], { pose } = OBJECTS[o], [x, y, z] = spots[k], sway = (pose.sway ?? 0.22) * 0.6 * Math.sin(motion * 0.25 + o * 0.9), depth = distance + back - z;
        // On the ring every stage faces the camera as it does when it stands alone in the middle, and then the ones at
        // the sides turn outwards with the ring.
        holder.rotation.set(Math.atan2(pose.height, pose.radius) - TILT - spread * (Math.atan2(camera.position.y - y, depth) - TILT), -(pose.base + sway) + spread * (RING.turn * Math.sin(ringAngle(o)) - Math.atan2(x - camera.position.x, depth)), 0);
        // The copies only serve the row's wrap; on the ring the last stage already stands beside the first.
        holder.visible = Math.abs(x - camX) < reach && Math.abs(y - camY) < reachY && !(flying && (k === 0 || k > N));
        holder.updateMatrixWorld(true);
        place(titles.current[k], x, y + 1.7, z, holder.visible ? focusOf(x, y) : 0, w, h);
        // On the ring a stage's number stands just outside the stage, on the side away from the ring's middle, so
        // no number lies on a neighbour.
        const tag = numbers.current[k];
        if (tag && (far <= 0 || k === 0 || k > N)) tag.style.opacity = "0";
        else if (tag) {
          const sx = (p.set(x, y, z).project(camera).x + 1) / 2 * w, sy = (1 - p.y) / 2 * h, unit = sy - (1 - p.set(x, y + 1, z).project(camera).y) / 2 * h;
          const dx = sx - hub[0], dy = sy - hub[1], out = Math.min(((OBJECTS[o].span ?? 2.5) * Math.cos(RING.turn * Math.sin(ringAngle(o))) * unit + 12) / Math.max(Math.abs(dx), 0.001), (1.9 * unit + 11) / Math.max(Math.abs(dy), 0.001));
          tag.style.opacity = far.toFixed(2); tag.style.transform = `translate(${(sx + dx * out).toFixed(1)}px, ${(sy + dy * out).toFixed(1)}px) translate(-50%, -50%)`;
        }
        if (!holder.visible) return;
        world.focus = focusOf(x, y) * near;
        // A stage at the back of the ring is drawn smallest, so its lines are dimmed most.
        const size = clamp(h / (2 * half * depth) / 95), ink = 1 - spread * (1 - (views[k].bloom !== undefined ? clamp(0.08 + size) : clamp(0.45 + size)));
        for (const material of inks[k]) material.opacity = ink;
        views[k].update(t, motion, w, h);
        if (views[k].bloom !== undefined) soft = Math.max(soft, clamp(1.6 - off(x, y) / SPACING));
      });
      for (const el of overlay.children) if (el instanceof HTMLElement && el.dataset.frame !== String(world.frame)) el.style.opacity = "0";

      // Captions keep their place at the bottom, left and right as before, and slide sideways with their stage. A caption
      // fades while its stage passes the middle, where it changes from a right-hand to a left-hand caption.
      const capW = paired ? (w - 72) / 2 : w - 28, screenX = (x: number) => (p.set(x, -1.65, 0).project(camera).x + 1) / 2 * w;
      const restLeft = screenX(camX - (paired ? SPACING / 2 : 0)), restRight = screenX(camX + SPACING / 2);
      WORLD.forEach((o, k) => {
        const el = captions.current[k];
        if (!el) return;
        const x = spots[k][0], rel = (x - camX) / SPACING;
        if (Math.abs(rel) > 1.6) { el.style.opacity = "0"; return; }
        const right = paired && rel > 0, shift = screenX(x) - (right ? restRight : restLeft);
        el.classList.toggle("is-right", right);
        // With one stage on screen a caption is as wide as the screen, so the next one fades in as it arrives.
        // With two, a caption fades as its stage leaves the pair, before it can reach the captions that stay.
        el.style.opacity = (paired ? clamp(Math.abs(rel) / 0.25) * clamp((1.25 - Math.abs(rel)) / 0.5) : clamp((1 - Math.abs(rel)) * 1.4)).toFixed(2);
        el.style.transform = `translateX(${((right ? w - 20 - capW : paired ? 20 : 14) + shift).toFixed(1)}px)`;
        const live = OBJECTS[o].live, readout = lives.current[k];
        if (live && readout) { const value = live(t); if (readout.textContent !== value) readout.textContent = value; }
      });

      // The step symbols stand halfway between their stage and the next. In the wide shot they shrink with the stages
      // and lose their words, and the one between the last stage and the first stands once.
      const events = engineEvents(), small = clamp(base / fit / across, 0.36, 1), middle = small < 0.999 ? `translate(-50%, -50%) scale(${small.toFixed(3)})` : "translate(-50%, -50%)";
      viewport.style.setProperty("--near", near.toFixed(2));
      for (let k = 0; k < WORLD.length - 1; k++) {
        const from = WORLD[k], mid = (spots[k][0] + spots[k + 1][0]) / 2, y = (spots[k][1] + spots[k + 1][1]) / 2, el = steps.current[k];
        if (!el) continue;
        if (Math.abs(mid - camX) > reach || Math.abs(y - camY) > reachY || (flying && k >= N)) { el.style.opacity = "0"; continue; }
        place(el, mid, y + 0.05, (spots[k][2] + spots[k + 1][2]) / 2, focusOf(mid, y), w, h, middle);
        el.style.setProperty("--level", LINK_LEVEL[from](t).toFixed(2));
        const kind = LINK_EVENTS[from];
        el.classList.toggle("is-firing", kind !== null && recentEvents(events[kind], t, FLASH).length > 0);
        if (from === 3) el.dataset.state = String(predictedIndex(t) % 4);
        if (from === 6) el.style.setProperty("--gain", coupleGain(t).toFixed(2));
      }
      // The ring of light, once the stages are near their places on it. The acts are named in its hole.
      stream.object.visible = far > 0;
      if (far > 0) {
        const levels = LINK_LEVEL.map((level) => level(t));
        for (let j = 0; j < STREAM; j++) {
          const lane = STREAM_LANES[j % STREAM_LANES.length], share = (Math.floor(j / STREAM_LANES.length) / STREAM_EACH + motion * 0.012) % 1, [x, y, z] = ringPoint(share * 2 * Math.PI, lane.out, RING.floor + 0.06);
          const swell = Math.max(0, Math.cos((share * N - motion * 0.55) * 2 * Math.PI)) ** 3;
          stream.set(j, x, y, z, lane.size * (1 + 0.5 * swell), far * lane.light * (0.36 + 0.64 * swell) * (0.45 + 0.55 * levels[Math.floor(share * N) % N]));
        }
        stream.commit();
      }
      if (names) {
        // Stacked, the words stand at the foot of the picture, under the ring, and leave as soon as a stage is entered.
        names.style.visibility = far > 0 && (!stacked || wideNow) ? "visible" : "hidden"; names.style.opacity = far.toFixed(2);
        if (stacked) names.style.transform = `translate(${(viewport.offsetLeft + w / 2).toFixed(1)}px, ${(viewport.offsetTop + h - room / 2).toFixed(1)}px) translate(-50%, -50%)`;
        else {
          p.set(RING_X, RING.floor, -0.12 * RING.z).project(camera);
          names.style.transform = `translate(${(viewport.offsetLeft + (p.x + 1) / 2 * w).toFixed(1)}px, ${(viewport.offsetTop + (1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
        }
      }
      // The waterfall stages stack many lines, so they take less bloom. On the light stage a wide bloom turns into
      // a smudge around the ink, so the light theme uses a weaker, short-reach one.
      // In the wide shot the bloom would reach as far as a small stage is wide, so it is turned down there.
      bloom.strength = (0.8 - 0.5 * soft) * (dark ? 1 : LIGHT_BLOOM) * (1 - 0.55 * spread);
      composer.render();
      // The product's screen hands over to this one: it lands its own ring on this ring and fades this screen in over
      // it, so the ring's place on the page (middle, half width and half height, in page pixels) is kept on the section.
      if (soloRef.current && far > 0.99) {
        if (!told || world.frame % 30 === 0) box = viewport.getBoundingClientRect();
        const ends = [0, 0.5, 1, 1.5].map((q) => { p.set(...ringPoint(q * Math.PI, 0, RING.floor + 0.06)).project(camera); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h]; });
        const ring = [box.left + (ends[1][0] + ends[3][0]) / 2, box.top + (ends[0][1] + ends[2][1]) / 2, (ends[1][0] - ends[3][0]) / 2, (ends[0][1] - ends[2][1]) / 2].map((v) => v.toFixed(1)).join(",");
        if (sectionRef.current!.dataset.ring !== ring) sectionRef.current!.dataset.ring = ring;
      }
      if (!told) { told = true; window.dispatchEvent(new Event("portfolio:engine-drawn")); }
    };
    frame = requestAnimationFrame(tick);
    const warm = window.setTimeout(prepareFollower, 300);
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(warm); seen.disconnect(); sectionSeen.disconnect(); theme.disconnect();
      views.forEach((view) => view.dispose()); bloom.dispose(); output.dispose(); ramp.dispose(); composer.dispose(); stream.dispose(); map.dispose(); renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    // The wide shot waits for the reader; the stages turn by themselves once one is open.
    const timer = window.setInterval(() => { if (!held.current && visible.current && !scroll.current.drag && !wideRef.current) go(1); }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, go, wide]);

  // Dragging moves the camera along the row; letting go settles on the nearest stage.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // The wide shot is not dragged; a press on it opens the stage under the pointer.
    if (wideRef.current) { press.current = { x: event.clientX, y: event.clientY }; return; }
    const c = scroll.current;
    c.glide = false; c.drag = { x: event.clientX, s: c.s };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const c = scroll.current, el = viewportRef.current;
    if (!c.drag || !el) return;
    let s = c.drag.s - (event.clientX - c.drag.x) / (el.clientWidth / (solo ? (el.offsetLeft > 40 ? ALONE : LONE) : stagesAcross(el.clientWidth, el.clientHeight)));
    if (s < -0.5) { s += N; c.drag.s += N; } else if (s > N - 0.5) { s -= N; c.drag.s -= N; }
    c.s = s;
  };
  const release = () => {
    const c = scroll.current;
    if (!c.drag) return;
    c.drag = null; setDragging(false); glideTo(Math.round(c.s));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const at = press.current;
    press.current = null;
    if (at && wideRef.current && Math.hypot(event.clientX - at.x, event.clientY - at.y) < 8) enter(pick.current(event.clientX, event.clientY)); else release();
  };
  const onPointerCancel = () => { press.current = null; release(); };

  // The arrow keys turn the stages while this figure is the one on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!sectionVisible.current || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (event.key === "ArrowRight") go(1); else if (event.key === "ArrowLeft") go(-1); else if (event.key === "Escape" && roomy) setWide(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, roomy]);

  const shown = solo ? [current] : [current, (current + 1) % N], built = BUILDS.find((b) => current <= b.upTo)!, stage = OBJECTS[current], result = results?.[current];
  // On the home the three positions are shown with the stages that make the accompaniment's own, the last act.
  const clocks = !solo || (!wide && current >= ACTS[2].from);
  clocksRef.current = clocks;
  return <section className={`chain chain3d${solo ? " is-solo" : ""}${wide ? " is-wide" : ""}${clocks ? "" : " no-clocks"}`} aria-label="소리가 반주가 되기까지" ref={sectionRef}
    onMouseEnter={() => { held.current = true; }} onMouseLeave={() => { held.current = false; }}>
    <div className="chain-head">
      <div><p className="chain-kicker">Signal Processing</p><h4>{title}</h4></div>
      <div className="ctrl">
        <button type="button" aria-label="이전 단계" onClick={() => go(-1)}>←</button>
        <p className="counter num">{pad(shown[0] + 1)} {shown.length > 1 && <span>→ {pad(shown[1] + 1)}</span>}</p>
        <button type="button" aria-label="다음 단계" onClick={() => go(1)}>→</button>
        <button type="button" className="chain-play" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "자동 재생"}</button>
      </div>
    </div>
    <div className="pano-wrap" ref={wrapRef}>
    <div className={`pano${dragging ? " is-dragging" : ""}`} ref={viewportRef} role="img" aria-label={wide ? ACTS.map((act) => `${act.what} ${act.name}`).join(" → ") : shown.map((i) => `${pad(i + 1)} ${OBJECTS[i].title}: ${OBJECTS[i].line}`).join(" / ")}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <canvas className="chain-gl" ref={canvasRef} aria-hidden="true" />
      <div className="pano-labels" aria-hidden="true">
        {WORLD.map((o, k) => <span key={k} className="pano-title" ref={(el) => { titles.current[k] = el; }}><span className="num">{pad(o + 1)}</span>{OBJECTS[o].title}</span>)}
        {solo && WORLD.map((o, k) => <span key={k} className="pano-no num" ref={(el) => { numbers.current[k] = el; }}>{pad(o + 1)}</span>)}
        {WORLD.slice(0, -1).map((o, k) => <span key={k} className="pano-step" ref={(el) => { steps.current[k] = el; }}><StepGlyph step={o} /><span className="pano-step-label"><StepLabel text={STEPS[o]} /></span></span>)}
      </div>
      <div className="pano-labels" ref={overlayRef} aria-hidden="true" />
      <div className="pano-hud" aria-hidden="true">
        {WORLD.map((o, k) => <div key={k} className="pano-cap" ref={(el) => { captions.current[k] = el; }}>
          <p className="pano-hud-head"><span className="num">{pad(o + 1)}</span><strong>{OBJECTS[o].title}</strong><em className="num" ref={(el) => { lives.current[k] = el; }} /></p>
          <p className="pano-line">{phrase(OBJECTS[o].line)}</p>
          {OBJECTS[o].legend && <p className="pano-legend">{OBJECTS[o].legend.join(" · ")}</p>}
        </div>)}
      </div>
    </div>
    {/* Side buttons sit over the scene but outside its image role, so they stay real, focusable controls. */}
    <button type="button" className="pano-side is-prev" aria-label="이전 단계" onClick={() => go(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
    <button type="button" className="pano-side is-next" aria-label="다음 단계" onClick={() => go(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    {/* The wide shot's words, in the ring's hole or, stacked, under the picture: the acts in order, each opening its first stage. The one line about the whole stands apart. */}
    {roomy && <div className="pano-acts" ref={actsBox} aria-hidden={!wide}>
      <div>{ACTS.map((act) => <button type="button" key={act.name} tabIndex={wide ? 0 : -1} onClick={() => enter(act.from)}>
        <small>{act.what}</small><b>{act.name}</b><i className="num">{pad(act.from + 1)} – {pad(act.to + 1)}</i>
      </button>)}</div>
      {note && <p>{note}</p>}
    </div>}
    {solo && <div className="pano-say" ref={sayBox} aria-live="polite">
      <div className="pano-say-head">
        <p className="pano-say-count num"><b>{pad(current + 1)}</b> / {pad(N)}<span>{stage.title}</span></p>
        {project && <StepGo project={project} scene="engine" step={pad(current + 1)} />}
      </div>
      <h4>{heading(stage.line)}</h4>
      {result && <p className="pano-say-result"><b className="num">{result.value}{result.unit && <small>{result.unit}</small>}</b><span>{result.label}</span></p>}
      {stage.legend && <p className="pano-say-legend">{stage.legend.join(" · ")}</p>}
      <p className="pano-say-live num" ref={soloLive} />
      <div className="pano-say-ctrl">
        {roomy && <button type="button" onClick={() => setWide(true)}>전체 보기</button>}
        <button type="button" className="pano-say-play" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "자동 재생"}</button>
      </div>
    </div>}
    </div>
    <div className="clock-strip" ref={stripBox}>
      <p className="clock-title"><strong>세 위치</strong><span>가수 위치는 관측값이고, 추정 위치는 관측이 없으면 정지하며, 재생 위치는 정지 · 역행 · 도약하지 않는다.</span></p>
      <p className="clock-scene"><b ref={(el) => { statusRefs.current[0] = el; }} /><span ref={(el) => { statusRefs.current[1] = el; }} /><span className="clock-built">지금 보는 단계 {shown.map((i) => pad(i + 1)).join("·")} → {built.text}</span></p>
      <div className="clock-grid">
        <div className="clock-rows">
          {CLOCKS.map((clock, k) => <p key={clock.name} className={built.rows.includes(k) ? "is-built" : undefined}><i aria-hidden="true">{clock.mark}</i><b>{clock.name}</b><span ref={(el) => { statusRefs.current[k + 2] = el; }} /></p>)}
        </div>
        <canvas ref={stripRef} className="clock-track" aria-hidden="true" />
      </div>
    </div>
    {/* A stacked or phone frame turns from the ends of this bar instead of from the sides of the picture. */}
    <div className="chain-nav">
      <button type="button" className="chain-step is-prev" aria-label="이전 단계" onClick={() => go(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
      <div className="chain-segs">{OBJECTS.map((item, i) => <button type="button" key={item.title} className={!wide && i === current ? "on" : undefined} aria-label={`${i + 1}번 ${item.title} 단계로 이동`} onClick={() => (wide ? enter(i) : glideTo(i))} />)}</div>
      <button type="button" className="chain-step is-next" aria-label="다음 단계" onClick={() => go(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
  </section>;
}
