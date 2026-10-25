"use client";

import { useMemo, type ReactNode } from "react";
import { Photo, Say, StepParts, pct, type Box, type StepPart, phrase } from "@/components/step-parts";
import { VqaModel3D, type PhotoSpec } from "@/components/vqa-model-3d";
import { VqaZoomLight } from "@/components/vqa-light";
import { ModelAnatomy } from "@/components/vqa-anatomy";
import { VqaStepLight } from "@/components/vqa-light-steps";
import { VqaStepFix } from "@/components/vqa-light-fix";

// The VQA figure, one part at a time. A part is one step of the contest: the hypothesis (or the principle, the
// measure, the method) stands on the left with who set it, who ran it and its verdict. The first part lays out the
// hypotheses the lead set, one row each; from there on the picture is the team's model in 3D, showing where that step
// changed it on one real question of the contest (src/components/vqa-model-3d.tsx; 사진 확대 in one structure of light, src/components/vqa-light.tsx; without WebGL, a flat figure). The reasons under "근거" stand open and can be folded away.
// Every answer and number below is in the contest's records: the validation runs for the 언주로 sign (a question
// of the team's own validation split, so its answer is known), the submission's saved predictions for the two test
// photos (whose answers were never published, so no answer is marked right there), and the leaderboards.
const LETTERS = ["a", "b", "c", "d"];
// Verdicts typed once for the steps (the photo gain comes from the leaderboard metrics).
const RUN = { start: "70% → 89%", vote: 17, bits: 41, cascade: 6 };
type Photos = { sign: string; vote: string; clock: string; cards: string };
type Props = { photos: Photos; gain: { public: number; private: number } };
type PartProps = Props & { open: (part: number) => void };

// The validation question that the first parts share: at 512² the 4B model gave 100m and 300m the same 49%.
const SIGN = {
  text: "파란색 도로 표지판에 적힌 '언주로'까지의 거리는?",
  choices: ["500m", "1km", "100m", "300m"],
  gold: 3,
  // The photo's size, the sign in it and the line of the sign that holds the answer, in the photo's own pixels.
  size: [720, 960], sign: [156, 478, 214, 116], line: [198, 546, 130, 50],
};
const signBox: Box = [SIGN.sign[0] / 720, SIGN.sign[1] / 960, (SIGN.sign[0] + SIGN.sign[2]) / 720, (SIGN.sign[1] + SIGN.sign[3]) / 960];

const SignPhoto = ({ src, marks }: { src: string; marks?: { box: Box; key?: boolean }[] }) =>
  <Photo src={src} size={SIGN.size} alt="빌딩 앞 도로에 선 파란색 도로 표지판. 언주로 300m라고 적혀 있다." marks={marks ?? [{ box: signBox, key: true }]} />;

// The three photos as the 3D model lays them: each photo's size, the band across what the question is about (twice as
// wide as deep) and the point that holds the answer, in the photo's own pixels.
const useSpec = (src: string, size: [number, number], band: [number, number], key: [number, number], box?: Box): PhotoSpec => useMemo(() => ({ src, size, band, key, box }), [src]); // eslint-disable-line react-hooks/exhaustive-deps
const useSign = (src: string) => useSpec(src, [720, 960], [330, 690], [263, 571]);

// An answer: the letter and its words, struck through when wrong. Test answers carry no mark.
function Ans({ k, words, right }: { k: number; words: string; right?: boolean }) {
  return <b className="vp-ans" data-right={right === true ? "" : undefined} data-wrong={right === false ? "" : undefined}>{LETTERS[k]} {words}</b>;
}
const SignAns = ({ k }: { k: number }) => <Ans k={k} words={SIGN.choices[k]} right={k === SIGN.gold} />;

// Each step's line, said on its part and again in the lead's list on the first part.
const LINES = {
  zoom: "사람도 확대해서 읽음 → 모델에도 고해상도 입력",
  ocr: "VLM은 OCR 전용이 아님 → OCR 인식 결과를 함께 입력",
  size: "122B까지 가야 하는가 → 4B · 8B · 32B 추세선으로 판단",
  vote: "큰 모델은 학습해도 오르지 않는다는 판단 → 앙상블로 전환",
  bits: "오르지 않은 원인: 4비트 학습 · 고정된 보기 순서",
  cascade: "답이 불확실한 문항에만 추가 연산 투입",
};

// The run's three chapters, each said in one plain line, so the list reads as a story before any row is read.
const CHAPTERS: Record<string, string> = {
  "팀 실험": "출발점 고정, 한 번에 한 축",
  "방향 전환": "학습 중단 → 학습 조건 재설계",
  "마무리": "불확실 문항만 재채점",
};
type Row = { no: string; kind: string; name: string; line: string; by: string; verdict: ReactNode; mark?: string; cut?: boolean; sub?: boolean; at: number };

// 출발점: one starting point, and each axis changes one thing of it. The picture is the lead's list in its chapters:
// every step after it, what kind it was, its line, who ran it and its verdict, a check rejected on the way to a
// step on its own fainter row; a row opens its step.
function StartPart({ photos, gain, open }: PartProps) {
  const pad = (i: number) => String(i).padStart(2, "0");
  const chapters: { name: string; rows: Row[] }[] = [];
  let chapter = PARTS[0].group ?? "";
  PARTS.slice(1, -1).forEach((item, k) => {
    if (item.group) chapter = item.group;
    if (chapters.at(-1)?.name !== chapter) chapters.push({ name: chapter, rows: [] });
    const rows = chapters.at(-1)!.rows;
    if (item.before) rows.push({ no: "", ...item.before, cut: true, sub: true, at: k + 1 });
    rows.push({ no: pad(k + 1), kind: item.kind ?? "", name: item.name, line: item.line ?? "", by: item.by ?? "", verdict: item.verdict?.({ photos, gain }), mark: item.mark, cut: item.cut, at: k + 1 });
  });
  return <section className="vp-part" aria-label="원칙: 출발점">
    <Say kind="원칙" name="출발점" line="출발점 고정 · 한 번에 한 축만 변경"
      more={[["결과", "Public 정확도 70.2%(제공 베이스라인) → 89.0%"],
        ["출발점", "Qwen3-VL 4B · 4비트 양자화 · LoRA 1에폭 · 사진 512², 16GB GPU 1장에서 43분"],
        ["분할", "같은 사진의 문항은 학습과 검증 중 한쪽에만"],
        ["실행", "팀원 4명이 같은 실행 패키지로 각자 PC에서 한 축씩"]]} />
    <figure className="vp-picture" data-wide="">
      <div className="vp-hyps"><div>
        <p className="vp-hyps-head"><b>팀장이 세운 가설 · 결정</b><span>출발점(4B · 4비트 · LoRA 1에폭 · 512²)에서 한 번에 한 축씩</span></p>
        {chapters.map((group) => <section className="vp-hyps-group" key={group.name} aria-label={group.name}>
          <p className="vp-hyps-chapter"><b>{group.name}</b><span>{CHAPTERS[group.name]}</span></p>
          <ol>{group.rows.map((row) => <li key={row.name} className={row.sub ? "vp-hyps-sub" : undefined}><button type="button" onClick={() => open(row.at)}>
            <span className="vp-hyps-no num">{row.no}</span>
            <span className="vp-hyps-kind">{row.kind}</span>
            <span className="vp-hyps-name">{row.name}</span>
            <b className="vp-hyps-line">{phrase(row.line)}</b>
            <span className="vp-hyps-by" data-lead={row.by.startsWith("팀장") ? "" : undefined}>{row.by}</span>
            <b className="vp-hyps-verdict num" data-cut={row.cut ? "" : undefined}>{row.mark && <i>{row.mark}</i>}{row.verdict}</b>
          </button></li>)}</ol>
        </section>)}
      </div></div>
    </figure>
  </section>;
}

// A model step drawn in light: 02 as the structure of light (src/components/vqa-light-steps.tsx), 04 · 05 · 06 drawn
// to what each step changed (src/components/vqa-light-fix.tsx; 06 from its sheet of sample questions).
function Drawn({ step, src, fallback }: { step: "ocr" | "vote" | "bits" | "cascade"; src: string; fallback: ReactNode }) {
  return step === "ocr" ? <VqaStepLight step={step} src={src} fallback={fallback} /> : <VqaStepFix step={step} src={src} fallback={fallback} />;
}

// 사진 확대: the same sign at 512² and at 768², and the chances the same 4B model gave at each.
function ZoomPart({ photos, gain }: PartProps) {
  return <section className="vp-part" aria-label="가설: 사진 확대">
    <Say kind="가설" name="사진 확대" line={LINES.zoom}
      more={[["방법", "같은 사진을 512²에서 768²로 키워 입력"],
        ["결과", "Public +134문항, Private에서도 +133문항"],
        ["이 문항", "512²에서는 100m와 300m에 49%씩 배정해 c를 선택, 768²에서는 300m에 99.98%"]]} />
    <figure className="vp-picture" data-wide=""><VqaZoomLight src={photos.sign} fallback={<ModelAnatomy photo={photos.sign} />} /></figure>
  </section>;
}

// OCR: what the OCR model (PaddleOCR, PP-OCRv5) read on the same photo, in its reading order, as it was cached for
// the run. All eleven lines went into the prompt with the question, on the same photo at 512². It read the answer,
// 300m, and the model still chose 100m, a little more surely than without the text (49% → 53%).
const OCR_LINES: [string, Box][] = [
  ["H", [0.5708, 0.4427, 0.6417, 0.4906]],
  ["수봉은사로", [0.2333, 0.5063, 0.3139, 0.5313]],
  ["·선릉역", [0.3375, 0.5063, 0.3958, 0.5292]],
  ["강남세브란스병원", [0.4111, 0.5052, 0.4819, 0.5281]],
  ["주정차금지", [0.65, 0.4938, 0.7653, 0.524]],
  ["언주로", [0.3208, 0.5406, 0.4014, 0.5708]],
  ["Eonju-ro", [0.3306, 0.5719, 0.3917, 0.5875]],
  ["300m", [0.3347, 0.5958, 0.3861, 0.6115]],
  ["견인지역", [0.6431, 0.5854, 0.775, 0.6156]],
  ["341", [0.7986, 0.7802, 0.8458, 0.8063]],
  ["R0", [0.7556, 0.8458, 0.8167, 0.8615]],
];
// The lines that hold the answer.
const OCR_KEY = [5, 6, 7];

function OcrPart({ photos }: PartProps) {
  return <section className="vp-part" aria-label="가설: OCR">
    <Say kind="가설" name="OCR 추가" line={LINES.ocr}
      more={[["방법", "OCR 모델(PaddleOCR)이 읽은 글 11줄을 질문과 함께 입력, 사진은 같은 512²"],
        ["결과", "자체 검증 1,074문항에서 971 → 976문항(+0.47%p)"],
        ["판정", "95% 신뢰구간 −0.47 ~ +1.49%p가 0을 포함해 우연과 구별되지 않음"],
        ["이 문항", "c 49.1 → 52.7%, d(정답 300m) 49.1 → 46.5%로 고른 답은 c 그대로"]]} />
    <figure className="vp-picture" data-wide=""><Drawn step="ocr" src={photos.sign} fallback={<div className="vp-picture">
      <SignPhoto src={photos.sign} marks={OCR_LINES.map(([, box], k) => ({ box, key: OCR_KEY.includes(k) }))} />
      <div className="vp-side">
        <p className="vp-question">{SIGN.text}</p>
        <ol className="vp-ocr">{OCR_LINES.map(([text], k) => <li key={k} data-key={OCR_KEY.includes(k) ? "" : undefined}>{text}</li>)}</ol>
        <p className="vp-then"><span>OCR 글과 함께</span><SignAns k={2} /></p>
      </div>
    </div>} /></figure>
  </section>;
}

// 모델 크기: the untrained 4B, 8B and 32B scored on the same 400 validation questions (the sign is one of them).
// The size axis is linear in parameters, so the curve fitted through the three runs (least squares on the log of the
// size) bends over toward the 400 ceiling; carried on to 122B it shows the small step that was to be expected.
// The curve is drawn, not a score: nothing is written at 122B. The band is where the contest's Colab could not run a
// model, from about 50B (the user's estimate: the 27B-class ran, beyond 32B-class did not); its start carries no number.
const SIZES = [{ size: "4B", b: 4, right: 338 }, { size: "8B", b: 8, right: 351 }, { size: "32B", b: 32, right: 368 }];

function SizeChart() {
  const x = (b: number) => 40 + b / 130 * 340, y = (right: number) => 170 - (right - 330) / 70 * 140;
  const logs = SIZES.map((s) => Math.log(s.b)), mx = logs.reduce((a, v) => a + v, 0) / logs.length, my = SIZES.reduce((a, s) => a + s.right, 0) / SIZES.length;
  const slope = logs.reduce((a, v, k) => a + (v - mx) * (SIZES[k].right - my), 0) / logs.reduce((a, v) => a + (v - mx) ** 2, 0);
  const fit = (b: number) => my + slope * (Math.log(b) - mx);
  const curve = (from: number, to: number) => Array.from({ length: 49 }, (_, k) => from * (to / from) ** (k / 48)).map((b) => `${x(b).toFixed(1)},${y(fit(b)).toFixed(1)}`).join(" ");
  const end = x(122);
  return <svg className="vp-chart" viewBox="0 0 400 236" role="img" aria-label="122B까지 가야 하는지 판단할 추세선. 학습 전 400문항 중 맞힌 수: 4B 338, 8B 351, 32B 368. 세 점에 맞춘 로그 곡선은 122B로 키워도 향상 폭이 작다. 32B를 크게 넘는 모델은 대회 제공 Colab에서 실행할 수 없었다">
    <text className="vp-chart-cap" x="0" y="12">학습 전 · 400문항 중 맞힌 수</text>
    <rect className="vp-chart-band" x={x(50)} y={y(400)} width={end + 22 - x(50)} height={170 - y(400)} />
    <text className="vp-chart-note" x={(x(50) + end + 22) / 2} y="140" textAnchor="middle">Colab 실행 불가</text>
    <line className="vp-chart-ceiling" x1={x(0)} x2="396" y1={y(400)} y2={y(400)} />
    <text className="vp-chart-note" x={end - 30} y={y(400) - 6} textAnchor="end">만점 400</text>
    <line className="vp-chart-base" x1={x(0)} x2="396" y1="170" y2="170" />
    <polyline className="vp-chart-line" points={curve(4, 32)} />
    <polyline className="vp-chart-dash" points={curve(32, 122)} />
    <circle className="vp-chart-hollow" cx={end} cy={y(fit(122))} r="5" />
    <text className="vp-chart-note" x={x(76)} y={y(fit(76)) + 20} textAnchor="middle">4B · 8B · 32B의 추세선</text>
    {SIZES.map((s) => <circle key={s.size} className="vp-chart-dot" cx={x(s.b)} cy={y(s.right)} r="5" />)}
    <text className="vp-chart-value" x={x(4) - 9} y={y(338) + 6} textAnchor="end">338</text>
    <text className="vp-chart-value" x={x(8) - 6} y={y(351) - 10} textAnchor="end">351</text>
    <text className="vp-chart-value" x={x(32) - 6} y={y(368) - 10} textAnchor="end">368</text>
    <text className="vp-chart-tick" x={x(4) + 2} y="190" textAnchor="end">4B</text>
    <text className="vp-chart-tick" x={x(8) + 1} y="190">8B</text>
    <text className="vp-chart-tick" x={x(32)} y="190" textAnchor="middle">32B</text>
    <text className="vp-chart-tick" x={end} y="190" textAnchor="middle">122B</text>
    <text className="vp-chart-cap" x="396" y="214" textAnchor="end">가로축: 모델 크기(파라미터 수)</text>
  </svg>;
}

function SizePart({ photos }: PartProps) {
  const sign = useSign(photos.sign);
  return <section className="vp-part" aria-label="측정: 모델 크기">
    <Say kind="측정" name="모델 크기" line={LINES.size}
      more={[["측정", "학습 전 자체 검증 400문항 정답 4B 338 · 8B 351 · 32B 368, 세 점에 맞춘 로그 곡선을 122B까지 연장"],
        ["남은 오답", "32B 학습 후에도 남은 오답 17문항 중 사진을 본 12문항은 모델 오류 1, 라벨 · 문항 문제 11"],
        ["비용", "122B는 대회 제공 Colab에서 실행 불가, 예산 초과"]]} />
    <figure className="vp-picture" data-wide="">
      <VqaModel3D stage="size" photo={sign} fallback={<div className="vp-side"><SizeChart /></div>} />
    </figure>
  </section>;
}

// 앙상블: the lead's decision, from the judgment after the 4-bit training of 32B gained nothing — the larger model already holds the task,
// Qwen has no more signal to give — and what it led to: no more training, an ensemble of models that err differently.
// A test photo where the three base models split. The base answer was their majority; on the 434 questions where
// 32B and Gemma disagreed (or 32B was unsure), seven models voted instead. Votes in the rebuild's order. Reversed
// on the next step.
const VOTE = {
  text: "이 EPS-B 구역에서 금지된 행위는?",
  choices: ["흡연금지", "출입금지", "휴대폰 사용금지", "음식물 반입금지"],
  size: [720, 1280], box: [0.285, 0.477, 0.688, 0.52] as Box,
  three: [0, 1, 0], seven: [0, 1, 1, 0, 0, 1, 1],
};
const majority = (votes: number[]) => {
  const counts = [0, 0, 0, 0];
  votes.forEach((v) => { counts[v] += 1; });
  return counts.indexOf(Math.max(...counts));
};

function VotePart({ photos }: PartProps) {
  const rows = [{ name: "모델 3개", votes: VOTE.three }, { name: "모델 7개", votes: VOTE.seven }];
  return <section className="vp-part" aria-label="결정: 앙상블">
    <Say kind="결정" name="앙상블" line={LINES.vote}
      more={[["판단", "“큰 모델은 문제의 구조와 형식을 이미 파라메트릭 지식으로 갖고 있다. 정보이론 관점에서 Qwen에서는 더 뽑아낼 신호가 없다”(발표 원고, 09-23)"],
        ["관측", "같은 4비트 학습으로 32B가 8B와 같은 수준(Public 0.95621 · 0.95680), 학습 이득 4B +72 · 8B +34 · 32B ≈0"],
        ["한 일", "학습 대신 다수결. 기본 답은 모델 3개, 32B와 Gemma의 답이 갈린 434문항만 모델 7개"],
        ["결과", "Public 3,240 → 3,257문항(0.97021)"],
        ["반증", "다음 단계에서 학습 조건을 바꾸자 27 · 31B 세 모델 모두 상승"]]} />
    <figure className="vp-picture" data-wide=""><Drawn step="vote" src={photos.vote} fallback={<div className="vp-picture">
      <Photo src={photos.vote} size={VOTE.size} alt="통제구역 관계자외출입금지라고 적힌 EPS-B 실 문 표지." marks={[{ box: VOTE.box, key: true }]} />
      <div className="vp-side">
        <p className="vp-question">{VOTE.text}</p>
        {rows.map((row) => {
          const pick = majority(row.votes);
          return <div className="vp-vote" key={row.name}>
            <p className="vp-view-head">{row.name}</p>
            <ol>{row.votes.map((v, k) => <li key={k} data-pick={v === pick ? "" : undefined}>{LETTERS[v]}</li>)}</ol>
            <Ans k={pick} words={VOTE.choices[pick]} />
          </div>;
        })}
      </div>
    </div>} /></figure>
  </section>;
}

// 4비트 · 보기 순서: how many more validation questions training won. Under 4-bit training with the choices in a
// fixed order the gain fell with size (32B: −3 on the 1,037 questions it had not seen, written ≈0); BF16 training
// with the choices shuffled each time brought it back on the 27B models.
const GAINS = [
  { group: 0, label: "4B", gain: 72, text: "+72" }, { group: 0, label: "8B", gain: 34, text: "+34" }, { group: 0, label: "32B", gain: -3, text: "≈0" },
  { group: 1, label: "27B", sub: "Qwen3.8", gain: 41, text: "+41" }, { group: 1, label: "27B", sub: "Qwen3.5", gain: 11, text: "+11" },
];

function GainChart() {
  const y = (gain: number) => 150 - Math.max(gain, 0) / 80 * 120;
  const xs = [52, 112, 172, 270, 330];
  return <svg className="vp-chart" viewBox="0 0 400 236" role="img" aria-label="학습으로 더 맞힌 문항: 4비트 학습 4B +72, 8B +34, 32B 약 0. BF16 학습과 보기 순서 섞기 Qwen3.8 27B +41, Qwen3.5 27B +11">
    <text className="vp-chart-cap" x="0" y="12">학습으로 더 맞힌 문항 · 자체 검증</text>
    <line className="vp-chart-base" x1="20" x2="396" y1="150" y2="150" />
    {GAINS.map((g, k) => <g key={k} data-group={g.group}>
      <rect className="vp-chart-bar" x={xs[k] - 18} y={y(g.gain)} width="36" height={Math.max(150 - y(g.gain), 2)} />
      <text className="vp-chart-value" x={xs[k]} y={y(g.gain) - 8} textAnchor="middle">{g.text}</text>
      <text className="vp-chart-tick" x={xs[k]} y="170" textAnchor="middle">{g.label}</text>
      {g.sub && <text className="vp-chart-sub" x={xs[k]} y="186" textAnchor="middle">{g.sub}</text>}
    </g>)}
    <text className="vp-chart-group" x="112" y="214" textAnchor="middle">4비트 · 순서 고정</text>
    <text className="vp-chart-group" data-group="1" x="300" y="214" textAnchor="middle">BF16 · 순서 섞기</text>
  </svg>;
}

function BitsPart({ photos }: PartProps) {
  return <section className="vp-part" aria-label="가설: 4비트 학습과 보기 순서">
    <Say kind="가설" name="BF16 · 순서 섞기" line={LINES.bits}
      more={[["계기", "다른 팀의 단독 모델이 팀의 7표(0.97021)를 넘음. Qwen3.5-27B 0.97169"],
        ["정밀도", "추론만 BF16으로 바꾸자 +7, 미리 정한 판정선 +13 미달로 기각"],
        ["보기 순서", "추론만 두 순서로 채점해 평균하자 +15, 우연 폭 ±12 밖(09-23)"],
        ["학습", "두 원인을 함께 바꿔 BF16 + 보기 섞기. 자체 검증 Qwen3.8 +41 · Qwen3.5 +11, Gemma Public +32"],
        ["한계", "학습에서 두 요인의 기여도는 분리하지 않음(마감 4일 전, 학습 1회 약 4.5시간)"],
        ["결합", "세 모델의 로그 확률 평균 0.97170으로 7표를 넘음, 7표는 약한 한 표로만"]]} />
    <figure className="vp-picture" data-wide="">
      <Drawn step="bits" src={photos.sign} fallback={<div className="vp-side"><GainChart /></div>} />
    </figure>
  </section>;
}

// 불확실 문항: a test photo where the three trained models split (d, d, b) and the top two choices were close.
// Only such questions (298 of 6,714) were scored again with larger inputs, more orders and the full-data models.
const CLOCK = {
  text: "가로등에 달린 시계는 몇 시를 가리키나요?",
  choices: ["밤 8시 10분", "밤 10시 10분", "밤 7시 10분", "밤 9시 10분"],
  size: [720, 960], box: [0.364, 0.383, 0.467, 0.46] as Box,
  first: [3, 3, 1], firstPick: 3, againPick: 1,
};

function CascadePart({ photos }: PartProps) {
  return <section className="vp-part" aria-label="가설: 불확실 문항에만 추가 연산">
    <Say kind="가설" name="불확실 문항" line={LINES.cascade}
      more={[["대상", "세 모델의 답이 갈리거나 로그 확률 1 · 2등 차가 2.0 미만인 298문항(전체의 4.4%), 목록은 결과 전에 고정"],
        ["방법", "이 문항만 2배 · 3배 확대, 보기 순서 4가지, 전체 데이터로 다시 학습한 모델로 다시 채점"],
        ["결과", "Public +6문항, 대상을 500~700문항으로 넓혀도 새로 바뀐 답 0"],
        ["이 문항", "d(밤 9시 10분)와 b(밤 10시 10분)의 차 0.1 → 다시 채점해 b"]]} />
    <figure className="vp-picture" data-wide=""><Drawn step="cascade" src={photos.cards} fallback={<div className="vp-picture">
      <Photo src={photos.clock} size={CLOCK.size} alt="밤거리 가로등에 달린 보라색 시계들. 바늘이 10시 10분을 가리킨다." marks={[{ box: CLOCK.box, key: true }]} />
      <div className="vp-side">
        <p className="vp-question">{CLOCK.text}</p>
        <div className="vp-vote">
          <p className="vp-view-head">처음 · 세 모델</p>
          <ol>{CLOCK.first.map((v, k) => <li key={k} data-pick={v === CLOCK.firstPick ? "" : undefined}>{LETTERS[v]}</li>)}</ol>
          <Ans k={CLOCK.firstPick} words={CLOCK.choices[CLOCK.firstPick]} />
        </div>
        <div className="vp-vote">
          <p className="vp-view-head">다시 채점</p>
          <Ans k={CLOCK.againPick} words={CLOCK.choices[CLOCK.againPick]} />
        </div>
        <div className="vp-share" aria-label="6,714문항 중 298문항">
          <span style={{ width: pct(298 / 6714) }} />
          <p className="num"><b>298</b> / 6,714문항</p>
        </div>
      </div>
    </div>} /></figure>
  </section>;
}

// 결과: each change the run judged, measured again on the hidden half once the contest closed (the VQA repo's public
// README, "Private에서 다시 확인한 것", and the large-model write-up for the vote → trio row). The adopted ones gained
// there too; the ones judged to do nothing did not. One row per change, in the run's chapters: Public and Private
// on one axis (questions gained, of 3,357 each).
const CHECKED: { group?: string; name: string; verdict: string; kept: boolean; pub: number; pri: number }[] = [
  { group: "팀 실험", name: "사진 확대 512² → 768²", verdict: "채택", kept: true, pub: 134, pri: 133 },
  { name: "모델 4B → 8B", verdict: "채택", kept: true, pub: 75, pri: 79 },
  { group: "방향 전환", name: "32B 4비트 학습", verdict: "효과 없음", kept: false, pub: -2, pri: -14 },
  { name: "추론 정밀도 BF16", verdict: "기각", kept: false, pub: 7, pri: 1 },
  { name: "Gemma BF16 학습", verdict: "채택", kept: true, pub: 32, pri: 11 },
  { name: "7표 → 세 모델 평균", verdict: "채택", kept: true, pub: 5, pri: 13 },
  { group: "마무리", name: "보기 순서 4가지 + 확대", verdict: "채택", kept: true, pub: 16, pri: 9 },
  { name: "불확실 문항 추가 채점", verdict: "채택", kept: true, pub: 6, pri: 4 },
];
const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

// The changes on one axis each: Public a filled dot, Private a ring, joined by a soft bar, so whether a change held is
// read in one row. Gains up to +40 on the wide lane; the two large ones (+75 and more) in a narrow lane of their own to
// the right, its own ticks, so the small changes keep their room. The numbers stand in one column at the right;
// chapters are faint bands; the verdicts are stamps. The changes judged to do nothing are grey.
function HeldChart() {
  const W = 720, A0 = 236, A1 = 520, B0 = 548, B1 = 604, NUM = 716;
  const x = (v: number) => (v <= 40 ? A0 + (v + 20) / 60 * (A1 - A0) : B0 + (Math.min(v, 140) - 60) / 80 * (B1 - B0));
  let y = 50;
  const bands: { name: string; top: number; bottom: number }[] = [];
  const rows = CHECKED.map((row) => {
    if (row.group) { y += 40; bands.push({ name: row.group, top: y - 36, bottom: y }); }
    const at = y; y += 34; bands[bands.length - 1].bottom = y - 10;
    return { ...row, y: at };
  });
  const bottom = y, H = bottom + 26;
  return <svg className="vp-chart vp-held" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`대회 중 판정한 변경을 대회가 끝난 뒤 Private으로 다시 측정한 결과. ${CHECKED.map((r) => `${r.name}(${r.verdict}) Public ${sign(r.pub)} · Private ${sign(r.pri)}`).join(", ")}. 채택한 변경은 Private에서도 모두 올랐고, 효과 없음으로 판정한 변경은 Private에서도 이득이 없었다.`}>
    <circle className="vp-held-pub" cx="7" cy="14" r="6" /><text className="vp-held-key" x="19" y="19">Public</text>
    <circle className="vp-held-pri" cx="88" cy="14" r="5.5" /><text className="vp-held-key" x="100" y="19">Private</text>
    <text className="vp-held-cap" x={NUM} y="19" textAnchor="end">더 맞힌 문항 · 각 3,357문항 중</text>
    {bands.map((band) => <g key={band.name}>
      <rect className="vp-held-band" x="-8" y={band.top} width={W + 16} height={band.bottom - band.top} rx="6" />
      <text className="vp-held-group" x="2" y={band.top + 15}>{band.name}</text>
    </g>)}
    <line className="vp-held-zero" x1={x(0)} x2={x(0)} y1="34" y2={bottom} />
    {rows.map((row) => <g key={row.name} data-off={row.kept ? undefined : ""}>
      <text className="vp-held-name" x="2" y={row.y + 5}>{row.name}</text>
      <rect className="vp-held-stamp" x="166" y={row.y - 10} width={row.verdict.length > 2 ? 52 : 34} height="20" rx="2" />
      <text className="vp-held-verdict" x={166 + (row.verdict.length > 2 ? 26 : 17)} y={row.y + 4.5} textAnchor="middle">{row.verdict}</text>
      <line className="vp-held-bar" x1={x(row.pub)} x2={x(row.pri)} y1={row.y} y2={row.y} />
      <circle className="vp-held-pub" cx={x(row.pub)} cy={row.y} r="6" />
      <circle className="vp-held-pri" cx={x(row.pri)} cy={row.y} r="5.5" />
      <text className="vp-held-value" x={NUM} y={row.y + 5} textAnchor="end">{sign(row.pub)}<tspan className="vp-held-sep"> · </tspan>{sign(row.pri)}</text>
    </g>)}
    <line className="vp-held-axis" x1={A0} x2={A1} y1={bottom} y2={bottom} />
    <line className="vp-held-axis" x1={B0} x2={B1} y1={bottom} y2={bottom} />
    {[-20, 0, 20, 40, 100].map((v) => <text key={v} className="vp-held-tick" x={x(v)} y={bottom + 18} textAnchor="middle">{sign(v)}</text>)}
  </svg>;
}

function ResultPart() {
  return <section className="vp-part" aria-label="결과">
    <Say kind="결과" name="Private" line="비공개 절반(Private)에서도 결과 유지"
      more={[["수상", "Private 리더보드 3 / 217 · 서울 캠퍼스 1위로 최우수상"],
        ["정답 수", "Public 3,278 → Private 3,285문항(각 3,357문항 중)"],
        ["재확인", "대회가 끝난 뒤 제출 78건을 Private으로 다시 비교"],
        ["채택", "대회 중 채택한 변경은 Private에서도 모두 상승"],
        ["기각", "효과 없음으로 판정한 변경은 Private에서도 이득 없음"]]} />
    <figure className="vp-picture" data-wide="">
      <div className="vp-side"><HeldChart /></div>
    </figure>
  </section>;
}

// Each step's facts, shown on its words and on its tab, so the tab row is the ledger of the run, in three chapters:
// the team's experiments (the lead's starting point and the three axes the teammates ran), the turn (the lead's
// judgment that led to the ensemble, reversed by the hypothesis the lead ran next) and the close. The lead set every
// one of them (author). 채택 marks what the final answers kept. kind, line and before (a check rejected on the way
// to a step) feed the lead's list on the first part.
type Before = { kind: string; name: string; line: string; by: string; verdict: string };
const PARTS: (StepPart<Props> & { kind?: string; line?: string; before?: Before })[] = [
  { name: "출발점", Part: StartPart, group: "팀 실험", by: "팀장 결정", verdict: () => <>70% <small>→</small> 89%</> },
  { name: "사진 확대", Part: ZoomPart, kind: "가설", line: LINES.zoom, author: "팀장", by: "팀원 실행", mark: "채택", verdict: ({ gain }) => <>+{gain.public}<small>문항</small></> },
  { name: "OCR 추가", Part: OcrPart, kind: "가설", line: LINES.ocr, author: "팀장", by: "팀원 실행", verdict: () => "기각", cut: true },
  { name: "모델 크기", Part: SizePart, kind: "측정", line: LINES.size, author: "팀장", by: "팀원 실행", verdict: () => "기각", cut: true },
  { name: "앙상블", Part: VotePart, group: "방향 전환", kind: "결정", line: LINES.vote, author: "팀장", act: "결정", by: "팀원 실행", verdict: () => "반증", cut: true },
  { name: "BF16 · 순서 섞기", Part: BitsPart, kind: "가설", line: LINES.bits, author: "팀장", by: "팀장 실행", mark: "채택", verdict: () => <>+{RUN.bits}<small>문항</small></>,
    before: { kind: "측정", name: "추론 정밀도", line: "4비트 추론이 다른 팀과의 격차의 원인인가", by: "팀장 실행", verdict: "기각" } },
  { name: "불확실 문항", Part: CascadePart, group: "마무리", kind: "가설", line: LINES.cascade, author: "팀장", by: "팀장 실행", mark: "채택", verdict: () => <>+{RUN.cascade}<small>문항</small></> },
  { name: "결과", Part: ResultPart, verdict: () => <>14위 <small>→</small> 3위</> },
];

export function VqaParts({ project, ...props }: Props & { project: string }) {
  return <><StepParts parts={PARTS} props={props} label="VQA 대회의 단계" scene="vqa" project={project} /></>;
}
