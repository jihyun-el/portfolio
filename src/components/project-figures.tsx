import Link from "next/link";
import { metrics } from "@/lib/content";

export function ClassicMateMap() {
  return <figure className="diagram-figure"><figcaption>하나의 서비스, 세 구성 부분</figcaption>
    <div className="service-flow">
      <Link href="/projects/classicmate/#pipeline" className="flow-node"><span className="flow-input">MusicXML</span><strong>악보 파이프라인</strong><span>12키 PDF · MIDI · 좌표 맵</span></Link>
      <span className="flow-arrow" aria-hidden="true">→</span>
      <Link href="/projects/classicmate/#app" className="flow-node"><span className="flow-input">악보 자산</span><strong>모바일 앱</strong><span>악보 · 필기 · 재생 · 소유권</span></Link>
      <span className="flow-arrow" aria-hidden="true">⇄</span>
      <Link href="/projects/classicmate/#engine" className="flow-node"><span className="flow-input">마이크 입력</span><strong>반주 엔진</strong><span>위치 추정 · 반주 제어</span></Link>
    </div><p className="figure-note">앱은 iOS·Android에 출시했습니다. 반주 엔진은 iOS 실기기에 통합했습니다.</p>
  </figure>;
}

// How the mirror project's question led to its idea: each step is the reason for the next.
export function MirrorIdeaFlow() {
  const steps = [
    { kicker: "필요", title: "3D 시점이 필요하다", note: "자세를 추정하려면 관절의 3D 좌표가 있어야 함" },
    { kicker: "방법", title: "카메라가 두 대면 된다", note: "두 시점이면 3D를 계산할 수 있음" },
    { kicker: "제약", title: "두 대는 쓰기 불편하다", note: "사용자가 카메라 두 대를 세우고 맞춰야 함" },
    { kicker: "발상", title: "거울 앞에 세운다", note: "거울상이 두 번째 시점이 됨", mark: "is-answer" },
    { kicker: "부수 효과", title: "거울은 이미 있다", note: "운동·재활 공간에는 전신 거울이 있음", mark: "is-bonus" },
  ];
  return <figure className="diagram-figure"><figcaption>카메라 한 대로 3D를 얻기까지</figcaption>
    <ol className="idea-flow">{steps.map((step) => <li key={step.kicker} className={step.mark}>
      <span className="flow-input">{step.kicker}</span><strong>{step.title}</strong><span>{step.note}</span>
    </li>)}</ol>
  </figure>;
}

// The engine's time inside its 10ms budget. The before/after of the front end is the Gain
// chart in the part summary above, so it is not repeated here.
export function EnginePerformance() {
  const engine=metrics.engine, share=Math.round(engine.computeMs/engine.budgetMs*100);
  return <figure className="performance-figure"><figcaption><strong>처리 예산 안에서 도는 계산</strong><span>실기기 기록 · ms</span></figcaption>
    <div className="budget-label"><span>전처리 + 신경망 추론</span><strong>약 {engine.computeMs} / {engine.budgetMs}ms · 예산의 {share}%</strong></div>
    <div className="budget-track" role="img" aria-label={`10ms 처리 예산 중 약 ${engine.computeMs}ms 사용`}><span style={{width:`${share}%`}} /><span className="budget-limit">10ms 예산</span></div>
    <p className="figure-note">{engine.note} 전처리의 증분 계산은 전체를 다시 계산한 값과 비트 단위로 같습니다.</p>
  </figure>;
}

export function PipelineFlow() {
  return <figure className="diagram-figure"><figcaption>악보 정보와 곡 해설의 처리 경계</figcaption>
    <div className="pipeline-branches"><div><h3>결정적 악보 자산</h3><div className="pipeline-stage"><strong>verovio</strong><span>조판 · 페이지와 음표 좌표</span></div><div className="pipeline-stage"><strong>music21</strong><span>12키 MIDI · 연주 시각</span></div><p>시간축을 맞춰 PDF·MIDI·좌표 맵을 앱에 공급</p></div>
    <div><h3>Gemini 곡 해설</h3><ol className="process-list"><li><strong>사실 수집</strong><span>검색 근거 확보</span></li><li><strong>구조화</strong><span>악보 정보와 해설 분리</span></li><li><strong>코칭</strong><span>연습 조언과 basis 근거 필드</span></li></ol></div></div>
    <p className="figure-note">악보에 없는 템포는 결측으로 남깁니다. 코칭 검사는 항목 수·시간 합계·빈 근거를 확인해 경고를 남깁니다.</p>
  </figure>;
}

export function OwnershipFlow() {
  return <figure className="diagram-figure"><figcaption>계정 전환과 결제의 데이터 경계</figcaption>
    <div className="ownership-flow"><div><strong>기기 캐시</strong><span>필기 · 악보 화면 상태</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><strong>동기화 요청</strong><span>현재 계정 확인</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><strong>서버 소유권</strong><span>서버가 잔액·소유권 변경</span></div></div>
    <div className="boundary-notes"><p><strong>계정 전환</strong> 로그아웃·토큰 만료 시 캐시 정리와 동기화 경계를 함께 처리</p><p><strong>결제 중복</strong> 거래 고유성 제약과 조건부 갱신으로 같은 거래의 반복 지급 방지</p></div>
  </figure>;
}

// The final VQA solution as submitted: every question is scored by three models, and only the
// questions they are unsure about are scored again with larger inputs and the retrained models.
// The grid under each model is its TTA plan: rows are input sizes, columns the four answer orders.
// A = scored for every question, M = added for the uncertain questions only, - = not used.
const answerOrders = ["abcd", "bcda", "cdab", "dabc"];
const ttaPlans = [
  { name: "Qwen3.5-27B", axis: "입력 확대", rows: [["원래", "AAAA"], ["2배", "AMMM"], ["3배", "MMMM"]] },
  { name: "Qwen3.8-27B", axis: "입력 확대", rows: [["원래", "AAAA"], ["2배", "AMMM"], ["3배", "----"]] },
  { name: "Gemma 4 31B", axis: "이미지 토큰 상한", rows: [["280", "AAAA"], ["560", "AMAM"], ["1120", "MMMM"]] },
];
export function VqaSolution() {
  const { total, uncertain } = metrics.vqa.extraInference, settled = total - uncertain;
  const share = (count: number) => (count / total * 100).toFixed(1);
  const runs = (plan: typeof ttaPlans[number], marks: string) => plan.rows.reduce((sum, [, row]) => sum + [...row].filter((cell) => marks.includes(cell)).length, 0);
  return <figure className="sol-figure" aria-label="VQA 최종 솔루션: Fine-tuning, TTA, Ensemble, Cascade, Submission">
    <ol className="sol">
      <li><div className="sol-stage"><b>Input</b><span>4지선다 VQA</span></div><div className="sol-body">
        <strong>사진 + 한국어 질문 + 보기 a~d</strong><p>정답 보기의 글자 하나를 고름. test {total.toLocaleString("ko-KR")}문항</p>
      </div></li>
      <li><div className="sol-stage"><b>Fine-tuning</b><span>BF16 LoRA</span></div><div className="sol-body">
        <strong>VLM 세 개를 원래 정밀도로 LoRA 학습</strong>
        <p className="sol-chips">{["rank 16", "2에폭", "보기 순서 섞기", "정답 글자에만 손실", "이미지 인코더 고정"].map((chip) => <span key={chip}>{chip}</span>)}</p>
      </div></li>
      <li><div className="sol-stage"><b>TTA</b><span>Test-Time Augmentation<br />보기 순서 × 입력 크기</span></div><div className="sol-body">
        <div className="sol-lanes">{ttaPlans.map((plan) => <div key={plan.name}>
          <strong>{plan.name}</strong><p className="sol-axis">{plan.axis}</p>
          <div className="tta" role="img" aria-label={`${plan.name}: 문항당 추론 ${runs(plan, "A")}회, 불확실한 문항은 ${runs(plan, "AM")}회`}>
            <span />{answerOrders.map((order) => <em key={order}>{order}</em>)}
            {plan.rows.map(([size, row]) => [<span key={size}>{size}</span>, ...[...row].map((cell, i) => <i key={size + i} data-s={cell} />)])}
          </div>
          <p className="sol-count">문항당 추론 <b>{runs(plan, "A")}회</b> → 불확실 문항 <b>{runs(plan, "AM")}회</b></p>
        </div>)}</div>
        <p className="sol-legend"><span><i data-s="A" />모든 문항</span><span><i data-s="M" />불확실한 문항에만 추가</span><span><i data-s="-" />사용 안 함</span></p>
        <p>보기 순서끼리는 확률을, 입력 크기끼리는 로그 확률을 평균</p>
      </div></li>
      <li><div className="sol-stage"><b>Ensemble</b><span>로그 확률 앙상블</span></div><div className="sol-body">
        <strong>세 모델의 로그 확률 평균 → 가장 높은 보기</strong><p>세 모델에 같은 가중치. 다수결, 확률 평균과 비교해 채택</p>
      </div></li>
      <li><div className="sol-stage"><b>Cascade</b><span>불확실한 문항만 다시 채점</span></div><div className="sol-body">
        <strong>{uncertain}문항({share(uncertain)}%)에만 추가 계산</strong>
        <div className="sol-meter" role="img" aria-label={`${total.toLocaleString("ko-KR")}문항 중 확정 ${share(settled)}%, 불확실 ${share(uncertain)}%`}><span style={{ width: `${share(settled)}%` }} /><span /></div>
        <div className="sol-two">
          <div><b>확정 {settled.toLocaleString("ko-KR")}문항 · {share(settled)}%</b><p>기본 답을 그대로 사용</p></div>
          <div><b>불확실 {uncertain}문항 · {share(uncertain)}%</b><p>세 모델의 답이 갈리거나 1·2등 로그 확률 차 &lt; 2.0. TTA를 넓히고 Qwen 두 모델을 전체 데이터까지 학습한 모델로 교체</p></div>
        </div>
      </div></li>
      <li><div className="sol-stage"><b>Submission</b><span>최종 답안 두 개</span></div><div className="sol-body">
        <div className="sol-two">
          <div className="sol-answer is-final"><b>답안 1 · Ensemble + 초반 모델 7개의 다수결 한 표</b><p>Public {metrics.vqa.stages.at(-1)!.score.toFixed(5)} · Private {metrics.vqa.leaderboard.private.score.toFixed(5)}</p></div>
          <div className="sol-answer"><b>답안 2 · Ensemble</b><p>Public 0.97616 · Private 0.97795 · 미리 정한 규칙만 사용</p></div>
        </div>
      </div></li>
    </ol>
  </figure>;
}

export function VqaProgress({compact=false}: {compact?: boolean}) {
  const stages=compact ? [metrics.vqa.stages[0],metrics.vqa.stages.at(-1)!] : metrics.vqa.stages;
  return <figure className="score-figure"><figcaption><strong>Public 점수 변화</strong><span>점수 범위 0 — 1</span></figcaption><ol className="score-bars">
    {stages.map((stage,i) => <li key={stage.label} className={i===stages.length-1 ? "is-final" : undefined}><div><span>{stage.label}</span><strong>{stage.score.toFixed(5)}</strong></div><div className="bar-track"><span className={`bar-fill ${i===stages.length-1 ? "bar-accent" : ""}`} style={{width:`${stage.score*100}%`}} /></div></li>)}
    </ol><p className="figure-note">{compact ? `Private 리더보드 ${metrics.vqa.leaderboard.teams}팀 중 ${metrics.vqa.leaderboard.private.overall}위 · 서울 캠퍼스 ${metrics.vqa.leaderboard.private.seoul}위. Public ${metrics.vqa.leaderboard.rank}위에서 올랐습니다.` : metrics.vqa.note}</p></figure>;
}
