import type { CSSProperties } from "react";

// The VQA experiments, one column each, read from the top down: the sentence the lead set, who ran
// it, and the verdict as a column on a plain Public accuracy axis. The grey part of a column is the
// score before it and the black part what the change added; a rejected one adds nothing. Smaller
// tries that were rejected are named on the line between two columns.
type Stage = { label: string; score: number };
// `stage` is the stage an adopted column reached; a column without one was rejected and carries its
// own name and reason. `kind` marks the sentences that were the lead's hypothesis or measurement.
type Column = { stage?: number; name?: string; who: "나" | "팀원"; kind?: string; claim: string; reason?: string; cut?: string[] };
const COLUMNS: Column[] = [
  { stage: 1, who: "나", kind: "원칙", claim: "출발점을 고정하고 한 번에 한 축만 바꾼다" },
  { name: "OCR 입력", who: "팀원", kind: "가설", claim: "VLM은 OCR 전문이 아니다. 전문 모델의 결과를 같이 넣으면 오른다", reason: "신뢰구간에 0" },
  { stage: 2, who: "팀원", kind: "가설", claim: "사람도 확대해서 푼다. 모델에도 선명한 사진을 넣는다" },
  { stage: 3, who: "팀원", kind: "측정", claim: "크기별 정확도 추세선을 구해 어디까지 키울지 정한다", cut: ["학습 해상도 768²"] },
  { stage: 4, who: "팀원", claim: "모델 7개의 답을 모아 다수결", cut: ["32B 4비트 학습"] },
  { stage: 5, who: "나", kind: "가설", claim: "큰 모델이 안 오른 원인은 4비트 학습과 고정된 보기 순서다" },
  { stage: 6, who: "나", kind: "가설", claim: "답이 흔들리는 문항에만 계산을 더 쓴다" },
  { stage: 7, who: "나", claim: "Qwen 두 모델을 전체 데이터로 재학습", cut: ["Qwen3.8 3배 확대"] },
];
const AFTER = ["타일링", "추가 에폭"];
const vars = (values: Record<string, string | number>) => values as CSSProperties;

export function VqaScoreSteps({ stages, questions, privateScore }: { stages: Stage[]; questions: number; privateScore: number }) {
  const start = stages[1], final = stages[stages.length - 1], count = (stage: Stage) => Math.round(stage.score * questions);
  // The axis starts just under the common start, so the later steps keep a visible height.
  const low = Math.floor(start.score * 50) / 50, high = Math.ceil((final.score + 0.008) * 100) / 100, at = (score: number) => (score - low) / (high - low);
  const ticks = Array.from({ length: Math.floor((final.score - low) / 0.02 + 1e-9) + 1 }, (_, i) => low + i * 0.02);
  // Each column starts from the score the last adopted one reached.
  let level = low;
  const columns = COLUMNS.map((column) => {
    const from = level, stage = column.stage === undefined ? undefined : stages[column.stage];
    if (stage) level = stage.score;
    return {
      ...column, from, to: level, name: stage?.label ?? column.name!, score: stage?.score.toFixed(5),
      note: stage ? `+${count(stage) - count(stages[column.stage! - 1])}문항` : column.reason!,
    };
  });
  return <figure className="ws" aria-label="VQA 실험: 세운 가설, 맡은 사람, Public 점수로 본 판정"><div className="ws-body">
    <ol className="ws-claims" aria-hidden="true">
      <li className="ws-head"><i>나</i>가설을 세움</li>
      {columns.map((column) => <li key={column.name} data-kind={column.kind}>{column.kind && <em>{column.kind}</em>}{column.claim}</li>)}
    </ol>
    <ol className="ws-runs">
      <li className="ws-head">실험</li>
      {columns.map((column) => <li key={column.name}><i data-me={column.who === "나" ? "" : undefined}>{column.who}</i><b>{column.name}</b><span>{column.claim}</span><small className="num">{column.score ? `${column.score} · ${column.note}` : `기각 · ${column.note}`}</small>{column.cut && <s>기각: {column.cut.join(" · ")}</s>}</li>)}
      <li className="ws-rest"><s>기각: {AFTER.join(" · ")}</s><small className="num">Private {privateScore.toFixed(5)}</small></li>
    </ol>
    <div className="ws-plot" aria-hidden="true">
      <p className="ws-head">판정<small>Public 정확도</small></p>
      <ul className="ws-ticks">{ticks.map((tick) => <li key={tick} style={vars({ "--at": at(tick) })}><span className="num">{tick.toFixed(2)}</span></li>)}</ul>
      {columns.map((column, i) => <div key={column.name} className="ws-col" data-cut={column.score ? undefined : ""} style={vars({ "--from": at(column.from), "--to": at(column.to), "--i": i })}>
        {i > 0 && <span className="ws-link" />}
        {column.cut && <p className="ws-cuts">{column.cut.map((name) => <span key={name}>{name}</span>)}</p>}
        <span className="ws-base" /><span className="ws-block" />
        <p className="ws-value"><b className="num">{column.score ?? "기각"}</b><small className="num">{column.note}</small></p>
      </div>)}
      <div className="ws-col ws-tail" style={vars({ "--from": at(final.score), "--to": at(final.score), "--i": columns.length })}>
        <span className="ws-link" />
        <p className="ws-cuts">{AFTER.map((name) => <span key={name}>{name}</span>)}</p>
        <p className="ws-final"><span>Private</span><b className="num">{privateScore.toFixed(5)}</b></p>
      </div>
      <p className="ws-from">{stages[0].label}<b className="num">{stages[0].score.toFixed(5)}</b></p>
      <p className="ws-key"><span><i />그 변경으로 더 맞힌 문항</span><span><b>×</b>해 보고 기각한 실험</span></p>
    </div>
  </div></figure>;
}
