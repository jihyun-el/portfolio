"use client";

import { useState } from "react";
import type { Metrics } from "@/lib/content";

const clocks = [
  {id:"person",label:"가수의 실제 진행",detail:"사람은 자신의 템포로 노래하고 반주를 들으며 다시 맞춥니다. 긴 쉼 뒤의 진입도 이 상호 반응 안에서 봅니다.",role:"사람의 행동을 모델의 위치 추정과 구분"},
  {id:"estimate",label:"추정한 악보 위치",detail:"마이크 입력으로 가수의 위치를 추정합니다. 잡음·쉼·틀린 음 때문에 추정이 흔들릴 수 있으므로 그 값을 곧바로 재생 위치로 사용하지 않습니다.",role:"관측을 해석하고 불확실성을 제어에 전달"},
  {id:"playback",label:"반주가 연주 중인 위치",detail:"반주는 자신의 진행 기준을 유지하면서 추정을 참고해 조절합니다. 위치 추정이 흔들릴 때도 사람이 다시 맞출 수 있는 음악적 기준을 남깁니다.",role:"추정과 실제 재생 사이에 제어 구조 유지"}
];
export function ThreeClocks() {
  const [selected,setSelected]=useState("playback");
  const current=clocks.find(clock=>clock.id===selected)!;
  return <figure className="clock-figure"><figcaption>사람과 반주 사이의 세 시계</figcaption>
    <div className="clock-options" aria-label="세 시계의 역할 선택">{clocks.map((clock,i)=><div className="clock-option" key={clock.id}><button type="button" aria-pressed={selected===clock.id} onClick={()=>setSelected(clock.id)}>
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="16" cy="16" r="12"/><path d="M16 8v8l6 3"/></svg><strong>{clock.label}</strong><span>{i===0 ? "연주와 청취" : i===1 ? "마이크 입력에서 관측" : "재생 진행을 조절"}</span>
    </button>{i<2 && <span className="clock-arrow" aria-hidden="true">→</span>}</div>)}</div>
    <div className="feedback-loop"><svg viewBox="0 0 600 30" aria-hidden="true"><path d="M510 0v16H90V0m-5 6 5-6 5 6" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg><span>반주를 듣고 사람이 다시 반응</span></div>
    <div className="clock-explanation" aria-live="polite"><strong>{current.role}</strong><p>{current.detail}</p></div>
  </figure>;
}

export function VqaMatrix({matrix}: {matrix: Metrics["vqa"]["matrix"]}) {
  const [selected,setSelected]=useState("8B-768");
  const current=matrix.find(row=>`${row.size}-${row.pixels}`===selected)!;
  const baseline=matrix.find(row=>row.size==="4B" && row.pixels===512)!;
  const delta=(current.score-baseline.score)*100;
  return <figure className="matrix-figure"><figcaption><strong>모델 크기 × 추론 해상도</strong><span>조건을 눌러 비교</span></figcaption>
    <table className="matrix-table"><thead><tr><th scope="col">모델</th><th scope="col">512²</th><th scope="col">768²</th></tr></thead><tbody>{["4B","8B"].map(size=><tr key={size}><th scope="row">{size}</th>{[512,768].map(pixels=>{
      const row=matrix.find(row=>row.size===size && row.pixels===pixels)!;
      const key=`${size}-${pixels}`;
      return <td key={key}><button type="button" aria-pressed={selected===key} aria-label={`${size}, 추론 해상도 ${pixels} 제곱, Public ${row.score.toFixed(5)}`} onClick={()=>setSelected(key)}><strong>{row.score.toFixed(5)}</strong><span>{size==="4B" && pixels===512 ? "공통 출발점" : size==="8B" && pixels===768 ? "두 축 결합" : pixels===768 ? "해상도 변경" : "모델 변경"}</span></button></td>;
    })}</tr>)}</tbody></table>
    <div className="matrix-result" aria-live="polite"><span>{current.size} · {current.pixels}²</span><strong>출발점 대비 {delta>0 ? "+" : ""}{delta.toFixed(2)}%p</strong></div>
    <p className="figure-note">4B·512² 대비 해상도 효과 +3.99%p, 모델 효과 +2.23%p. 두 효과의 겹침은 약 −0.03%p였습니다. 최종 답안은 이 위에 학습과 결합을 더해 만들었습니다.</p>
  </figure>;
}
