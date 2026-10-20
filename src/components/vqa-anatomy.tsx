"use client";

import { useId, type ReactNode } from "react";

// The team's starting model, taken apart, in the app's way of drawing (planes pulled apart, seen from the front-right
// and above, ink only): one question goes up from the photo through the image encoder and the input row into the
// language model and out as the four choices' chances. The language model's weights are frozen in 4 bits; only the
// thin LoRA plates beside them learn. On the left, the four axes the lead handed to the teammates, each on the part
// it turns; everything else stays as the starting point.
// Facts: content/details/vqa.json (starting point C0: Qwen3-VL 4B, 4-bit LoRA, 1 epoch, 512²; the sign question at
// 512²: 100m and 300m 49% each, c chosen), Qwen3-VL-4B's published config (36 language layers, 24 vision layers,
// 16-pixel patches merged 2 × 2, so one image token is 32 × 32 pixels).

const W = 360, D = 150, GAP = 120, UX = 0.92, UY = 0.31, VX = -0.92, VY = 0.31, X0 = 430, Y0 = 92;
const at = (u: number, v: number, level: number) => [X0 + u * UX + v * VX, Y0 + u * UY + v * VY + level * GAP];
const poly = (points: number[][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const plane = (level: number, u0 = 0, u1 = W, v0 = 0, v1 = D) => poly([at(u0, v0, level), at(u1, v0, level), at(u1, v1, level), at(u0, v1, level)]);
// Drawing in a plane's own (u, v) units: whatever is inside lies on the plane.
const On = ({ level, children }: { level: number; children: ReactNode }) => <g transform={`matrix(${UX} ${UY} ${VX} ${VY} ${X0} ${Y0 + level * GAP})`}>{children}</g>;
// A repeatable shade for each weight cell: sixteen steps, as four bits hold.
const shade = (i: number) => { let t = (i + 1) * 2654435761 >>> 0; t ^= t >>> 13; t = Math.imul(t, 1274126177) >>> 0; return (t % 16) / 15; };

// The sign photo is 720 × 960; the plane shows the band across the sign. At 512² the photo is cut in 32-pixel tiles,
// about 52 of the photo's pixels each.
const PHOTO = { w: 720, h: 960, band: [330, 630], sign: [156, 478, 214, 116], tile: 52 };
const LEVELS = [
  { name: "출력", what: "보기 넷의 확률" },
  { name: "언어 모델", what: "36층 · 4비트로 동결 · LoRA만 학습" },
  { name: "입력 줄", what: "사진 조각 · 질문 · 보기 a b c d" },
  { name: "이미지 인코더", what: "24층 · 고정" },
  { name: "사진", what: "512² · 조각 하나 32 × 32 픽셀" },
];
// The axes the lead handed out, each beside the plane it turns.
const AXES = [
  { level: 4, name: "사진 확대", what: "512² → 768²" },
  { level: 2, name: "OCR 추가", what: "OCR 글 칸을 더함" },
  { level: 1, name: "모델 크기", what: "4B · 8B · 32B" },
  { level: 0, name: "앙상블", what: "모델 7개의 답을 모음" },
];
// The sign question at the starting point: 100m and 300m 49% each, the rest between the other two.
const CHOICES = [{ k: "a", words: "500m", p: 0.01 }, { k: "b", words: "1km", p: 0.01 }, { k: "c", words: "100m", p: 0.49, picked: true }, { k: "d", words: "300m", p: 0.49, gold: true }];

export function ModelAnatomy({ photo }: { photo: string }) {
  const id = useId().replace(/:/g, ""), s = W / PHOTO.w, bandH = (PHOTO.band[1] - PHOTO.band[0]) * s;
  const path = { u: 128, v: D * 0.5 }, bottom = at(path.u, path.v, 4), top = at(path.u, path.v, 0);
  // The input row: the photo's tokens, the question's, an empty place where OCR text would go, and the four choices.
  const row = [...Array.from({ length: 7 }, () => "img"), "more", ...Array.from({ length: 4 }, () => "q"), "ocr", "ocr", ...CHOICES.map((c) => c.k)];
  const cw = (W - 24) / row.length;
  return <svg className="an" viewBox="40 -16 1120 760" role="img" aria-label="출발점 모델의 해부도. 언주로 표지판 사진이 32×32 픽셀 조각으로 잘려 24층 이미지 인코더(고정)를 지나고, 사진 조각 · 질문 · 보기 a b c d가 한 줄로 36층 언어 모델에 들어간다. 언어 모델의 가중치는 4비트로 얼려 두고 얇은 LoRA 판만 학습한다. 출력은 보기 넷의 확률로, 100m와 300m가 각각 49%였고 100m를 골랐다. 왼쪽은 팀원에게 나눈 네 축이 바꾸는 곳: 사진 확대는 사진, OCR 추가는 입력 줄, 모델 크기는 언어 모델, 다수결은 출력.">
    <clipPath id={`${id}-photo`}><rect width={W} height={D} /></clipPath>
    {/* Bottom up, so each plane lies under the ones above it. */}
    {/* 4 · the photo, cut in tiles. */}
    <g className="an-plane is-photo">
      <polygon points={plane(4)} />
      <On level={4}>
        <g clipPath={`url(#${id}-photo)`}>
          <image href={photo} x="0" y={-(PHOTO.band[0] * s) + (D - bandH) / 2} width={W} height={PHOTO.h * s} preserveAspectRatio="none" />
          {Array.from({ length: Math.ceil(W / (PHOTO.tile * s)) }, (_, i) => <line key={`u${i}`} className="an-tile" x1={i * PHOTO.tile * s} x2={i * PHOTO.tile * s} y1="0" y2={D} />)}
          {Array.from({ length: Math.ceil(D / (PHOTO.tile * s)) + 1 }, (_, i) => <line key={`v${i}`} className="an-tile" x1="0" x2={W} y1={i * PHOTO.tile * s} y2={i * PHOTO.tile * s} />)}
          <rect className="an-sign" x={PHOTO.sign[0] * s} y={(PHOTO.sign[1] - PHOTO.band[0]) * s + (D - bandH) / 2} width={PHOTO.sign[2] * s} height={PHOTO.sign[3] * s} />
        </g>
      </On>
    </g>
    {/* 3 · the image encoder: one feature per tile, frozen. */}
    <g className="an-plane">
      <polygon points={plane(3)} />
      <On level={3}>
        {Array.from({ length: 14 * 6 }, (_, k) => <circle key={k} className="an-dot" cx={14 + (k % 14) * 25.5} cy={18 + Math.floor(k / 14) * 23} r="2.6" />)}
      </On>
      <Lock at={at(W - 22, 22, 3)} />
    </g>
    {/* 2 · the input row. */}
    <g className="an-plane">
      <polygon points={plane(2)} />
      <On level={2}>
        {row.map((kind, k) => {
          const x = 12 + k * cw, y = D * 0.32, h = D * 0.36;
          if (kind === "more") return <text key={k} className="an-on-text" x={x + cw / 2} y={y + h / 2 + 6} textAnchor="middle">…</text>;
          if (kind === "ocr") return <rect key={k} className="an-slot" x={x + 2} y={y} width={cw - 4} height={h} />;
          return <g key={k}>
            <rect className={kind === "img" ? "an-token is-img" : kind === "q" ? "an-token" : "an-token is-choice"} x={x + 2} y={y} width={cw - 4} height={h} />
            {kind.length === 1 && <text className="an-on-text is-choice" x={x + cw / 2} y={y + h / 2 + 6} textAnchor="middle">{kind}</text>}
          </g>;
        })}
        <text className="an-on-cap" x={12} y={D * 0.26}>사진 조각</text>
        <text className="an-on-cap" x={12 + 8 * cw} y={D * 0.26}>질문</text>
        <text className="an-on-cap" x={12 + 12 * cw} y={D * 0.26}>OCR</text>
        <text className="an-on-cap" x={12 + 14 * cw} y={D * 0.26}>보기</text>
      </On>
    </g>
    {/* 1 · the language model: more layers under it, its weights in sixteen shades, frozen; the LoRA plates learn. */}
    {[2, 1].map((k) => <polygon key={k} className="an-under" points={poly([at(0, 0, 1 + k * 0.07), at(W - 70, 0, 1 + k * 0.07), at(W - 70, D, 1 + k * 0.07), at(0, D, 1 + k * 0.07)])} />)}
    <g className="an-plane">
      <polygon points={plane(1, 0, W - 70)} />
      <On level={1}>
        {Array.from({ length: 11 * 5 }, (_, k) => <rect key={k} className="an-weight" x={10 + (k % 11) * 25} y={12 + Math.floor(k / 11) * 26} width="22" height="22" style={{ fillOpacity: 0.08 + shade(k) * 0.62 }} />)}
      </On>
      <Lock at={at(W - 92, 22, 1)} />
    </g>
    {[0, 1].map((k) => <g key={k} className="an-lora">
      <polygon points={plane(1 - 0.12 - k * 0.06, W - 58 + k * 28, W - 38 + k * 28, 0, D)} />
    </g>)}
    {/* 0 · the output: the four choices' chances, standing up off the plane. */}
    <g className="an-plane">
      <polygon points={plane(0)} />
      <On level={0}>
        {CHOICES.map((c, k) => <text key={c.k} className={`an-on-text${c.picked ? " is-wrong" : ""}`} x={42 + k * 84} y={D * 0.78} textAnchor="middle">{c.k} {c.words}</text>)}
      </On>
      {CHOICES.map((c, k) => { const [x, y] = at(42 + k * 84, D * 0.5, 0), h = Math.max(4, c.p * 190); return <g key={c.k}>
        <rect className={c.gold ? "an-bar is-gold" : "an-bar"} x={x - 9} y={y - h} width="18" height={h} />
        {c.p > 0.1 && <text className="an-bar-value num" x={x} y={y - h - 8} textAnchor="middle">{Math.round(c.p * 100)}%</text>}
      </g>; })}
    </g>
    {/* One question, from the photo up to the chances. */}
    <g className="an-path">
      <line x1={bottom[0]} y1={bottom[1]} x2={top[0]} y2={top[1] + 8} />
      <polygon points={poly([[top[0] - 6, top[1] + 14], [top[0] + 6, top[1] + 14], [top[0], top[1] + 4]])} />
      {[4, 3, 2, 1].map((level) => { const [x, y] = at(path.u, path.v, level); return <circle key={level} className="an-node" cx={x} cy={y} r="5" />; })}
      <circle className="an-pulse" r="4"><animateMotion dur="3.4s" repeatCount="indefinite" path={`M${bottom[0]},${bottom[1]} L${top[0]},${top[1] + 8}`} /></circle>
    </g>
    {/* The planes' names, at their right corners. */}
    {LEVELS.map((level, k) => { const [x, y] = at(W, 0, k); return <g key={level.name}>
      <text className="an-name" x={x + 26} y={y + 4}>{level.name}</text>
      <text className="an-what" x={x + 26} y={y + 28}>{level.what}</text>
    </g>; })}
    <text className="an-lora-name" x={at(W - 20, D, 1 - 0.18)[0] + 10} y={at(W - 20, D, 1 - 0.18)[1] + 22}>LoRA · 학습</text>
    {/* The starting point the lead fixed, and the four axes the teammates turned, one each. */}
    <g className="an-head">
      <rect className="an-sq is-lead" x="64" y="2" width="11" height="11" />
      <text className="an-head-name" x="84" y="13">출발점 · 팀장 결정</text>
      <text className="an-head-what" x="64" y="38">Qwen3-VL 4B · 4비트 · 512² · LoRA 1에폭</text>
      <text className="an-head-what" x="64" y="60">나머지는 고정하고 한 번에 한 축</text>
    </g>
    {AXES.map((axis) => { const [x, y] = at(0, D, axis.level), lx = 318; return <g key={axis.name} className="an-axis">
      <line x1={lx + 8} x2={x - 10} y1={y - 6} y2={y - 6} />
      <rect className="an-sq" x={lx - 150} y={y - 20} width="10" height="10" />
      <text className="an-axis-name" x={lx - 134} y={y - 10}>{axis.name}</text>
      <text className="an-axis-what" x={lx - 150} y={y + 13}>{axis.what}</text>
    </g>; })}
  </svg>;
}

// A padlock: this part is frozen.
function Lock({ at: [x, y] }: { at: number[] }) {
  return <g className="an-lock" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
    <path d="M-6 -2 V-7 a6 6 0 0 1 12 0 V-2" />
    <rect x="-9" y="-2" width="18" height="14" rx="2.5" />
  </g>;
}
