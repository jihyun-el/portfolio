"use client";

import { useEffect, useRef } from "react";
import { isDark } from "@/lib/glow-3d";
import { accompU, chordAt, clamp, engineEvents, recentEvents, sungNote } from "@/lib/halt-score";
import { exampleTime } from "@/lib/example-clock";

// The take's sound switch, drawn in the engine's light: white light added up and coloured by how bright it is, on the
// dark stage by the spectrogram ramp and on the light one by the darker "flare" map, as the stages are. A solid
// speaker with curved waves when the sound is on; the waves leap outward at every chord the engine fires, so the mark
// bounces with what is heard. Muted, a slash cuts through the speaker in place of the waves and the mark hops now and then.
const BOX = { w: 50, h: 40 };
const SPEAKER = [[5, 14], [13, 14], [25, 4], [25, 36], [13, 26], [5, 26]];
const MOUTH = [24, 20], WAVES = [8, 14, 20], OPEN = 0.72;
const SLASH = [[2, 3], [32, 37]];

// The two maps of the engine's light (src/lib/glow-3d.ts), from the brightness of a point to its colour.
const STOPS_DARK = [[5, 5, 5], [74, 54, 181], [194, 33, 112], [240, 102, 28], [255, 204, 74]];
const STOPS_LIGHT = [[237, 176, 129], [231, 126, 99], [214, 79, 95], [170, 58, 110], [122, 46, 111], [75, 35, 98]];
const table = (stops: number[][]) => {
  const out = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const y = v / 255 * (stops.length - 1), k = Math.min(Math.floor(y), stops.length - 2), f = y - k;
    for (let c = 0; c < 3; c++) out[v * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return out;
};
const LUT = { dark: table(STOPS_DARK), light: table(STOPS_LIGHT) };
const smooth = (a: number, b: number, x: number) => { const v = clamp((x - a) / (b - a)); return v * v * (3 - 2 * v); };

export function SoundMark({ muted, onToggle, note }: { muted: boolean; onToggle: () => void; note?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext("2d")!, sum = document.createElement("canvas"), add = sum.getContext("2d", { willReadFrequently: true })!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, seen = true, off = mutedRef.current ? 1 : 0, last = performance.now();
    const view = new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; }); view.observe(canvas);
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!seen || document.hidden) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = sum.width = w; canvas.height = sum.height = h; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      off += ((mutedRef.current ? 1 : 0) - off) * (reduced ? 1 : Math.min(1, dt * 10));
      const t = exampleTime(now), on = 1 - off, unit = w / BOX.w;
      // How hard the last chords were struck, and how far out their waves have travelled.
      const fires = reduced ? [] : recentEvents(engineEvents().fire, t, 0.6), voice = reduced ? 0 : sungNote(t).amp, ring = reduced ? 0 : chordAt(accompU(t)).amp;
      const wave = (k: number) => fires.reduce((acc, age) => acc + Math.exp(-(((age - 0.07 * k) / 0.06) ** 2)), 0);
      const grey = (v: number) => { const g = Math.round(255 * clamp(v)); return `rgb(${g},${g},${g})`; };
      add.setTransform(1, 0, 0, 1, 0, 0); add.globalCompositeOperation = "source-over"; add.shadowBlur = 0; add.fillStyle = "#000"; add.fillRect(0, 0, w, h);
      add.setTransform(unit, 0, 0, unit, 0, 0); add.lineCap = add.lineJoin = "round";
      // Light spills round every shape, as bloom does round the stages.
      const glow = (lit: boolean) => { add.shadowColor = "rgba(255,255,255,0.85)"; add.shadowBlur = lit ? 3.2 * unit : 0; };
      add.globalCompositeOperation = "lighter"; glow(true);
      // The speaker, brightest at its mouth.
      const body = 0.62 + 0.1 * on + 0.25 * on * wave(0), fill = add.createRadialGradient(MOUTH[0], MOUTH[1], 0, MOUTH[0], MOUTH[1], 22);
      fill.addColorStop(0, grey(body)); fill.addColorStop(1, grey(body * 0.72));
      add.beginPath(); SPEAKER.forEach(([x, y], i) => (i ? add.lineTo(x, y) : add.moveTo(x, y))); add.closePath();
      add.fillStyle = fill; add.fill(); add.strokeStyle = fill; add.lineWidth = 3; add.stroke();
      WAVES.forEach((r, k) => {
        const leap = wave(k + 1), light = on * (0.45 + 0.12 * (k ? ring : voice) + 0.6 * leap);
        if (light <= 0.01) return;
        add.beginPath(); add.arc(MOUTH[0], MOUTH[1], r + 2.5 * leap, -OPEN, OPEN);
        add.strokeStyle = grey(light); add.lineWidth = 2.6 * (1 + 0.5 * leap); add.stroke();
      });
      if (off > 0.01) {
        // The slash cuts a clear band through the speaker before it is drawn, as a mute mark does.
        add.globalCompositeOperation = "source-over"; glow(false);
        add.beginPath(); add.moveTo(SLASH[0][0], SLASH[0][1]); add.lineTo(SLASH[1][0], SLASH[1][1]);
        add.strokeStyle = `rgba(0,0,0,${off.toFixed(3)})`; add.lineWidth = 8; add.stroke();
        add.globalCompositeOperation = "lighter"; glow(true);
        add.strokeStyle = grey(0.85 * off); add.lineWidth = 3.4; add.stroke();
      }
      // Colour by brightness, as the stages' final pass does.
      const pixels = add.getImageData(0, 0, w, h), px = pixels.data, dark = isDark(), lut = dark ? LUT.dark : LUT.light;
      for (let i = 0; i < px.length; i += 4) {
        const v = px[i], n = v / 255;
        px[i] = lut[v * 3]; px[i + 1] = lut[v * 3 + 1]; px[i + 2] = lut[v * 3 + 2];
        px[i + 3] = 255 * (dark ? Math.min(1, n * 3) : smooth(0, 0.35, n));
      }
      ctx.putImageData(pixels, 0, 0);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); view.disconnect(); };
  }, []);
  return <span className={`title-sound${muted ? " is-muted" : ""}`}>
    <button type="button" aria-pressed={!muted} aria-label={muted ? "소리 켜기" : "소리 끄기"} title={muted ? "소리 켜기" : "소리 끄기"} onClick={onToggle}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </button>
    {note && <small aria-hidden="true">{note}</small>}
  </span>;
}
