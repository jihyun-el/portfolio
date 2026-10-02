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

// The engine's time inside its 10ms budget. The before/after of the front end is the Gain
// chart in the part summary above, so it is not repeated here.
export function EnginePerformance() {
  const engine=metrics.engine, share=Math.round(engine.computeMs/engine.budgetMs*100);
  return <figure className="performance-figure"><figcaption><strong>처리 예산 안에서 도는 계산</strong><span>실기기 기록 · ms</span></figcaption>
    <div className="budget-label"><span>앞단 + 신경망 본체</span><strong>약 {engine.computeMs} / {engine.budgetMs}ms · 예산의 {share}%</strong></div>
    <div className="budget-track" role="img" aria-label={`10ms 처리 예산 중 약 ${engine.computeMs}ms 사용`}><span style={{width:`${share}%`}} /><span className="budget-limit">10ms 예산</span></div>
    <p className="figure-note">{engine.note} 앞단의 증분 계산은 기존 창 전체 계산과 비트 동일하게 대조했습니다.</p>
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

export function VqaProgress({compact=false}: {compact?: boolean}) {
  const stages=compact ? [metrics.vqa.stages[0],metrics.vqa.stages.at(-1)!] : metrics.vqa.stages;
  return <figure className="score-figure"><figcaption><strong>Public 점수 변화</strong><span>점수 범위 0 — 1</span></figcaption><ol className="score-bars">
    {stages.map((stage,i) => <li key={stage.label} className={i===stages.length-1 ? "is-final" : undefined}><div><span>{stage.label}</span><strong>{stage.score.toFixed(5)}</strong></div><div className="bar-track"><span className={`bar-fill ${i===stages.length-1 ? "bar-accent" : ""}`} style={{width:`${stage.score*100}%`}} /></div></li>)}
    </ol><p className="figure-note">{compact ? `Private 리더보드 ${metrics.vqa.leaderboard.teams}팀 중 ${metrics.vqa.leaderboard.private.overall}위 · 서울 캠퍼스 ${metrics.vqa.leaderboard.private.seoul}위. Public ${metrics.vqa.leaderboard.rank}위에서 올랐습니다.` : metrics.vqa.note}</p></figure>;
}
