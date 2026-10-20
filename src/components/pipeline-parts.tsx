"use client";

import { Say, StepParts, type StepPart } from "@/components/step-parts";
import { PaperCommentary, PaperFirstStep, PaperKeys, PaperPatches, PaperTimeline } from "@/components/pipeline-paper";
import example from "@/lib/pipeline-example.json";

// The score pipeline, one step at a time: the question and what was built, the one timeline, the commentary, and the
// retrospective in two parts. The pictures are on the app's paper (src/components/pipeline-paper.tsx).
// They are a real run of the pipeline on OpenScore's CC0 score of Debussy's "L'âme évaporée" (and of Schubert's
// "Der Lindenbaum" for the page check). `pipeline-example.json` is generated from that run; do not edit it by hand.
type Props = { score: string };

function WholePart({ score }: Props & { open: (part: number) => void }) {
  return <section className="vp-part" aria-label="문제와 해결">
    <Say kind="문제" name="악보 파이프라인" by="단독 개발" line="종이 · PDF 악보는 컴퓨터로 재생 불가" verdict={<>12<small>개 조</small></>}
      more={[["산출물", "MusicXML 악보 한 곡에서 12개 조의 악보, 반주 MIDI, 악보 위 커서 좌표, 곡 해설을 만들어 앱에 공급"],
        ["방식", "원본 PDF · MIDI를 복사하지 않고 음악 정보만 읽어 처음부터 다시 조판"],
        ["그림", "OpenScore의 CC0 악보(드뷔시 「L’âme évaporée」)를 이 파이프라인으로 다시 실행한 결과. 칸은 커서가 멈추는 자리이며 악보 템포대로 이동"],
        ["작성", "커밋 64개 모두 단독 작성(2025.12 ~ 2026.07)"]]} />
    <figure className="vp-picture" data-wide=""><PaperKeys score={score} /></figure>
  </section>;
}

function TimelinePart({ score }: Props & { open: (part: number) => void }) {
  return <section className="vp-part" aria-label="결정: 한 시간축">
    <Say kind="결정" name="한 시간축" line="발음 시각은 music21 하나로 · 악보 좌표는 verovio에서" verdict={<>역행 0</>}
      more={[["문제", "조판은 verovio, 연주 · 분석은 music21. 두 도구의 시간이 다르면 커서와 소리가 음표마다 어긋남"],
        ["지표", "곡 중간에 조가 바뀌는 곡을 이조하면 쪽 번호가 역행하는 음표 13~29개. 이 수를 지표로 정하고 네 차례 시도 끝에 0"]]} />
    <figure className="vp-picture" data-wide=""><PaperTimeline score={score} /></figure>
  </section>;
}

function CommentaryPart({ score }: Props & { open: (part: number) => void }) {
  return <section className="vp-part" aria-label="설계: 곡 해설">
    <Say kind="설계" name="곡 해설" line="사실 수집 → 구조화 → 코칭 항목별 근거"
      more={[["분리", "Gemini는 검색 근거와 구조화 출력을 한 호출에서 함께 쓸 수 없어 사실 수집 → 구조화로 나누고, 코칭은 셋째 단계에서 따로 생성"],
        ["근거 칸", "코칭 항목마다 근거 칸(악보 · 가사 · 양식)을 요구하고 규칙으로 사후 검사"],
        ["기준값", "악보에서 추출한 박자 · 템포 · 마디 수 · 음역을 함께 입력"],
        ["그림", "같은 드뷔시 곡에 대한 Gemini 실제 출력의 구조"]]} />
    <figure className="vp-picture" data-wide=""><PaperCommentary score={score} /></figure>
  </section>;
}

function FirstStepPart({ score }: Props & { open: (part: number) => void }) {
  return <section className="vp-part" aria-label="회고: 빠진 첫 단계">
    <Say kind="회고" name="빠진 첫 단계" line="악보 이미지 → MusicXML 첫 단계에 VLM 필요"
      more={[["출발점", "이미 MusicXML로 변환된 악보에서 출발, 원천은 OpenScore 같은 퍼블릭 도메인(CC0) 악보"],
        ["재설계 시", "종이 · PDF 악보 이미지에서 VLM으로 MusicXML을 직접 생성. 기술 난도는 더 높음"]]} />
    <figure className="vp-picture" data-wide=""><PaperFirstStep score={score} /></figure>
  </section>;
}

function PatchesPart() {
  return <section className="vp-part" aria-label="회고: 규칙으로 처리한 한계">
    <Say kind="회고" name="규칙으로 처리한 한계" line="규칙을 쌓기 전에 공개 AI 도구의 범위부터 확인 필요"
      more={[["출처", "파이프라인 인수인계 문서에 기록한 한계"],
        ["구조", "새 기호나 형식이 나올 때마다 처리기를 하나씩 추가하는 구조"]]} />
    <figure className="vp-picture" data-wide=""><PaperPatches /></figure>
  </section>;
}

const PARTS: StepPart<Props>[] = [
  { name: "문제 · 해결", Part: WholePart },
  { name: "한 시간축", Part: TimelinePart },
  { name: "곡 해설", Part: CommentaryPart },
  { name: "회고 · 첫 단계", Part: FirstStepPart },
  { name: "회고 · 한계", Part: PatchesPart },
];

export function PipelineParts({ project, ...props }: Props & { project: string }) {
  return <StepParts parts={PARTS} props={props} label="악보 파이프라인의 단계" scene="pipeline" project={project} />;
}
