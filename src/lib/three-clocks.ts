// The three clocks of the engine design, drawn from the shared example performance:
// the singer (observed, never controlled), the follower (stops when there is no evidence) and the
// accompaniment (never stops, never goes back, never jumps).
import { STATES, TOTAL, accompTempo, accompU, anchorU, coupleGain, frozenFor, sceneAt, singerSeen, singerU, stateIndex, voiceAt } from "@/lib/example-score";

const INK = "#f2f2f2", MID = "#9a9a9a", DIM = "#3a3a3a", FAINT = "#1d1d1d";

export function clockStates(t: number) {
  const scene = sceneAt(t), beat = singerU(t), v = voiceAt(beat), written = STATES[stateIndex(beat)].pitch;
  const singer = scene.name === "전주" ? "아직 부르지 않음" : scene.name === "후주" ? "노래 끝" : v.pitch === null || v.amp < 0.25 ? "쉼 · 소리 없음" : v.pitch !== written ? "옥타브가 튐" : "노래 중";
  const follower = frozenFor(t) > 0.08 ? "증거 없음 · 멈춤" : "듣고 따라감";
  const speed = `${accompTempo(t).toFixed(2)}×`;
  const accomp = !singerSeen(t) ? `혼자 진행 ${speed}` : coupleGain(t) < 0.2 ? `관성으로 진행 ${speed}` : `따라붙는 중 ${speed}`;
  return { scene, singer, follower, accomp };
}

// The singer has finished once the last note ends; after that only the piano plays.
const SONG_END = (() => { const last = [...STATES].reverse().find((s) => s.pitch !== null)!; return last.start + last.dur; })();
const singing = (tau: number) => (singerU(tau) % TOTAL) < SONG_END;
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, size = 11, weight = 600, align: CanvasTextAlign = "left") {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
}

/* ---------- The strip: three cursors on the score around the singer ---------- */
export function drawStrip(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, font: string) {
  ctx.clearRect(0, 0, w, h);
  const span = 6, centre = singerU(t), X = (beat: number) => w / 2 + (beat - centre) / span * (w / 2 - 8), rowH = h / 3;
  const rows: { at: number; draw: (x: number, y: number) => void }[] = [
    { at: centre, draw: (x, y) => { ctx.strokeStyle = singing(t) ? MID : DIM; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); } },
    { at: anchorU(t), draw: (x, y) => { ctx.fillStyle = INK; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); } },
    { at: accompU(t), draw: (x, y) => { ctx.save(); ctx.shadowColor = INK; ctx.shadowBlur = 14; ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.fill(); ctx.restore(); } },
  ];
  const loopStart = Math.floor(centre / TOTAL) * TOTAL;
  rows.forEach((row, r) => {
    const y = rowH * (r + 0.5);
    ctx.fillStyle = FAINT; ctx.fillRect(0, y - 1, w, 2);
    // Written notes as ticks along each row so distance reads in notes.
    for (const base of [loopStart - TOTAL, loopStart, loopStart + TOTAL]) STATES.forEach((s) => {
      const x0 = X(base + s.start), x1 = X(base + s.start + s.dur);
      if (x1 < 0 || x0 > w || s.pitch === null) return;
      ctx.fillStyle = DIM; ctx.fillRect(x0 + 1, y - 4, Math.max(1, x1 - x0 - 3), 8);
    });
    row.draw(X(row.at), y);
  });
  ctx.strokeStyle = "rgba(242,242,242,.18)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, "← 지난 음", 4, h - 6, MID, font, 10, 600);
  text(ctx, "다음 음 →", w - 4, h - 6, MID, font, 10, 600, "right");
}
