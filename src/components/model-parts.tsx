"use client";

import type { ReactNode } from "react";
import { Say, StepParts, type StepPart, type Reason } from "@/components/step-parts";
import { TemplateToDistribution } from "@/components/model-figures";
import { PitchOnly3D } from "@/components/model-3d";
import { DeviceProbe3D, EchoMeasured3D, Evaluation3D, LossTerms3D, ReferenceInput3D, TrainingData3D } from "@/components/model-3d-steps";

// The pitch model, one step at a time, in the frame the app and the pipeline share. The pictures are drawn in the
// engine's light (src/components/model-figures.tsx); a step whose picture is still to be drawn holds its place empty. A step carries a verdict only where the records hold a
// measured number for it. The numbers are the engine repository's records.
type Props = Record<string, never>;

const step = (kind: string, name: string, line: string, more: Reason[], verdict?: ReactNode, picture?: ReactNode): StepPart<Props> => ({
  name,
  Part: () => <section className="vp-part" aria-label={`${kind}: ${name}`}>
    <Say kind={kind} name={name} line={line} verdict={verdict} more={more} />
    <figure className="vp-picture" data-wide="">{picture ?? <div className="vp-placeholder">그림 자리</div>}</figure>
  </section>,
});

const PARTS: StepPart<Props>[] = [
  step("결정", "템플릿 → 분포", "고정 템플릿 비교 → 음높이 분포 전체를 음표별 우도로", [
    ["원래 관측", "92ms 창의 스펙트럼을 음표마다 고정된 배음 템플릿과 비교(Cont 2010). 비브라토 · 모음 변화를 반영하지 못함"],
    ["바꾼 것", "FCPE의 360빈 출력을 한 값으로 줄이지 않고, 소프트맥스 정규화 없이 그대로 음표별 우도로 사용"],
    ["주기", "템플릿 방식에서 온 23ms 간격을 버리고 10ms로 통일"],
    ["버린 이유", "같은 템플릿으로 악보 멜로디(바이올린 합성)는 끝까지 추종, 실제 목소리는 음표가 뭉치고 추정이 빔 → 추종이 아니라 목소리와 고정 템플릿의 불일치"],
    ["그림", "규칙으로 만든 예시"],
  ], undefined, <TemplateToDistribution />),
  step("결정", "분리 대신 음높이만", "분리 후 음높이 추정 → 섞인 입력에서 바로 음높이 분포", [
    ["에코 제거", "재생한 반주를 빼는 에코 제거는 배음까지 깎아 기각 → 보컬 분리(Mel-RoFormer) 후 FCPE로 음높이 추출"],
    ["문제 정의", "필요한 것은 분리된 목소리가 아니라, 피아노와 성악이 섞인 입력에서 가수의 음높이"],
    ["조건", "미래 참조 10~20ms, 휴대폰에서 10ms마다 실행"],
    ["학습 정답", "분리 → FCPE는 기기에서 실시간 실행이 불가해 학습 정답을 만드는 데만 쓰고, 배포에는 넣지 않음"],
    ["구조", "합성곱만 쌓은 CNN(Bittner 2017). 순환 신경망 · 팽창 합성곱은 신경망 가속기 미지원으로 제외"],
  ], undefined, <PitchOnly3D />),
  step("측정", "학습 전 실측", "학습 전 기기 실측 → 10ms 안에 실행되는 구조만 학습", [
    ["방법", "실행 시간은 가중치 값이 아니라 연산 그래프의 모양이 정하므로, 크기별 뼈대를 무작위 가중치로 변환해 측정"],
    ["조건", "iPhone 17 · iPhone 15, 저전력 모드, 10ms마다 한 번 호출할 때의 정상 상태 최악값"],
    ["결과", "합성곱만 쓴 구조는 전 층이 가속기에서 실행. 1천만 파라미터급은 프레임 단위 8.19ms로 10ms 안, 창 전체 재계산은 38.7ms"],
    ["상한", "8.19ms는 상태 전달 비용을 뺀 하한이라 1천만급은 빠듯 → 여유 있는 상한 약 350만. 그 안에서 16층은 학습 실패 → 14층 · 약 117만"],
    ["학습 뒤", "상태를 유지하는 배포 형태가 가속기 컴파일에 실패 → 창 재계산 fp16으로 바꿔 1.59ms, 재학습 없이 해결"],
  ], <>8.19<small>ms</small></>, <DeviceProbe3D />),
  step("결정", "참조 입력", "마이크 + 재생한 반주(참조) 입력 · 멜로디는 제외", [
    ["발상", "반주는 엔진이 재생하므로 걸러 낼 방해음을 미리 앎 → 녹음에서 빼지 않고 참조 입력으로"],
    ["입력", "마이크 6채널 + 참조 반주 6채널. 참조에서 멜로디는 빼, 악보를 베끼는 경로를 차단"],
    ["정렬", "절대 지연은 실행 중에 맞추고, 학습에서는 ±30ms 어긋남만 견디게 함"],
    ["비교", "같은 조건에서 ±2빈 정확도 0.609 → 0.661, 같은 정확도까지 학습 스텝 약 절반"],
  ], <>0.609 → 0.661</>, <ReferenceInput3D />),
  step("설계", "학습 데이터", "편중을 점검한 실연 녹음 140개로 정답 구축 · 표본마다 새로 합성", [
    ["수집", "악보가 있는 곡의 피아노 반주 · 독창 실연 165개(89곡). 소프라노부터 베이스까지, 같은 곡의 다른 음역과 고음 소프라노 · 카운터테너 포함"],
    ["정답 · 정렬", "분리한 보컬에 FCPE를 적용해 음높이 정답, 반주는 12개 조 MIDI에서 맞는 조를 골라 실연 타이밍에 정렬"],
    ["등급", "멜로디와 보컬의 음높이 일치율로 등급화, 등급마다 한 곡씩 청취해 사용 기준(40% 이상) 확정"],
    ["편중 점검", "남은 곡을 음역과 유성음 비율로 집계 → 느린 레가토 편중(유성음 비율 중앙값 0.69) → 빠르고 자음 많은 곡 25개 보강"],
    ["학습 · 검증", "실제 휴대폰 녹음과 같은 곡 실연 4개는 검증으로 → 140개, 표본마다 방 · 비율 · 잡음을 새로 합성"],
  ], undefined, <TrainingData3D />),
  step("측정", "실제 에코 측정", "기존 측정의 잔향 12배 부풀림 교정 → 9개 공간 실측: 차이는 직접음 비율", [
    ["측정 앱", "휴대폰 스피커로 지수 사인 스윕을 재생하며 같은 휴대폰 마이크로 녹음. OS 에코 제거를 끈 iOS 녹음 경로"],
    ["측정법", "같은 거실 녹음에서 스윕 77ms, 기존 음악 역합성 915ms. 기존 방법이 잔향 시간을 12배 부풀림"],
    ["실제 에코", "9개 공간의 잔향 시간 60~744ms, 직접음 비율 +5~+12dB. 학습에 쓰던 공개 잔향 데이터는 −5.3dB"],
    ["반영", "실측 응답 11개를 77개로 늘려 학습 에코를 교체. 가수 쪽에도 잔향을 입혀 잔향 유무로 둘을 가르는 경로를 차단"],
  ], <>−5.3 → +5~+12<small>dB</small></>, <EchoMeasured3D />),
  step("설계", "손실과 지표", "손실 3항: 분포 · 노래 유무 · 음높이 거리 → 휴대폰에서는 분포만 실행", [
    ["노래 유무", "첫 모델은 분포의 확신도로 노래 유무를 판단 → 확신 프레임이 노래 구간의 절반 → 노래 유무를 별도 출력으로 학습, 휴대폰에서는 제외"],
    ["거리 항", "빈별 손실은 반음 옆 출력과 옥타브 위 출력에 같은 벌점 → 음높이 거리 항을 추가. 교사(FCPE)의 학습에도 없던 항이라 가중 0.02"],
    ["선택 점수", "다시 학습하며 쓴 검출률은 모든 프레임을 확신하면 1.0으로 포화 → 검출률 − 오검출률"],
  ], undefined, <LossTerms3D />),
  step("평가", "평가", "교사로 교사를 채점하지 않음: 교차 대조 · 학습에서 뺀 곡 · 청취", [
    ["기준", "깨끗한 보컬에 다섯 모델(FCPE · pYIN · Harvest · CREPE · PESTO)을 적용, 18곡에서 각 모델과 나머지 넷의 합의 차이가 중앙값 8~13센트"],
    ["학습에서 뺀 곡", "「Halt!」 실제 휴대폰 녹음에서 정답과 반음 이내 96%(같은 곡의 깨끗한 보컬 입력 98%)"],
    ["반주 섞인 입력", "공개 모델 넷은 피아노를 따라가 1,000~2,466센트 벗어나고, 이 모델은 중앙값 46센트. 학습에 쓴 곡에 실측 에코를 새로 입힌 입력"],
  ], <>96<small>%</small></>, <Evaluation3D />),
];

export function ModelParts({ project }: { project: string }) {
  return <StepParts parts={PARTS} props={{}} label="음높이 모델의 단계" scene="model" project={project} />;
}
