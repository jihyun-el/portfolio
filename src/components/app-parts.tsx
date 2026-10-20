"use client";

import { useState } from "react";
import { Say, StepParts, type StepPart } from "@/components/step-parts";
import { PaperAccount, PaperHandover, PaperPayment, PaperStroke } from "@/components/app-paper";

// The mobile app, one step at a time: the structure and its two borders, then the decisions and the problem QA found that
// shaped it, and what was left for whoever came next. Every fact is in the app repository's records (its README,
// the handover documents on `feat/follower-mode`, the post-mortem, the released code on `main`) and in the site's
// own detail page.
// The other steps are drawn on paper: the score, receipts, a ledger, music folders, the handover documents
// (src/components/app-paper.tsx).
type Props = { score: string };
type PartProps = Props & { open: (part: number) => void };

// The released app (v1.0.7) as its code stands: four MVVM layers drawn as planes pulled apart, the three feature
// modules as columns across every plane, one dot per class (counted from the code, generated files left out). One
// purchase goes down through them to the server; the iOS engine stands apart, joined only by its control channel,
// and its audio loop is the one thing drawn in the signal colours, as on the engine's own figure.
const MODULES = [{ name: "classic", features: 12 }, { name: "mate", features: 9 }, { name: "shared", features: 11 }];
const LAYERS = [
  { name: "View", what: "Screen · Page", counts: [16, 13, 6], node: "NotesShopSheet" },
  { name: "ViewModel", what: "Riverpod Notifier", counts: [17, 29, 11], node: "PurchaseFlowNotifier" },
  { name: "Repository", what: "Repository", counts: [9, 10, 3], node: "PaymentRepository" },
  { name: "Service", what: "DataSource · Service", counts: [13, 10, 7], node: "PaymentRemoteDataSource" },
];
const CHANNEL = ["start", "stop", "cursor", "pause", "resume", "seek"];
// A plane is W across (the modules) by D deep, seen from the front-right and above; planes drop by GAP.
const W = 360, D = 210, GAP = 98, UX = 0.92, UY = 0.31, VX = -0.92, VY = 0.31, X0 = 492, Y0 = 64;
const at = (u: number, v: number, level: number, x0 = X0) => [x0 + u * UX + v * VX, Y0 + u * UY + v * VY + level * GAP];
const poly = (points: number[][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const plane = (w: number, d: number, level: number, x0 = X0) => poly([at(0, 0, level, x0), at(w, 0, level, x0), at(w, d, level, x0), at(0, d, level, x0)]);
// One module's column on one layer.
const cell = (module: number, level: number) => poly([at(module * W / 3, 0, level), at((module + 1) * W / 3, 0, level), at((module + 1) * W / 3, D, level), at(module * W / 3, D, level)]);
// Where the purchase crosses each plane: in the shared column. Where the engine's channel lands: in classic, on Service.
const PAY = { u: W * 5 / 6, v: D * 0.52 }, PORT = { u: W / 6, v: D * 0.74 };
// One dot per class, in a grid filling the module's column; the dot nearest a marked point is left to the mark.
function dots(module: number, count: number, skip?: { u: number; v: number }) {
  const u0 = module * W / 3 + 16, u1 = (module + 1) * W / 3 - 16, v0 = 22, v1 = D - 22;
  const cols = Math.max(1, Math.round(Math.sqrt(count * (u1 - u0) / (v1 - v0)))), rows = Math.ceil(count / cols);
  const all = Array.from({ length: cols * rows }, (_, k) => ({ u: u0 + (cols === 1 ? (u1 - u0) / 2 : (k % cols) * (u1 - u0) / (cols - 1)), v: v0 + (rows === 1 ? (v1 - v0) / 2 : Math.floor(k / cols) * (v1 - v0) / (rows - 1)) })).slice(0, count);
  if (!skip) return all;
  const near = all.reduce((best, p, k) => Math.hypot(p.u - skip.u, p.v - skip.v) < Math.hypot(all[best].u - skip.u, all[best].v - skip.v) ? k : best, 0);
  return all.filter((_, k) => k !== near);
}

function AppLayers() {
  // Under the pointer: one layer of one module. Its dots are its classes, so it answers with their number, and the
  // layer and the module it belongs to stand out while the rest steps back. Without a pointer the figure is as drawn.
  const [pick, setPick] = useState<{ level: number; module: number } | null>(null);
  const server = LAYERS.length + 0.2, native = { w: 132, d: 104, level: 3, x0: 168 };
  const payTop = at(PAY.u, PAY.v, 0), payBottom = at(PAY.u, PAY.v, server);
  const port = at(PORT.u, PORT.v, 3), nativeEdge = at(native.w, native.d * 0.55, native.level, native.x0);
  const edgeAngle = Math.atan2(UY, UX) * 180 / Math.PI;
  return <svg className="ap-layers" data-pick={pick ? "" : undefined} onPointerLeave={() => setPick(null)} viewBox="56 18 964 680" role="img" aria-label="모바일 앱의 MVVM 네 계층(View · ViewModel · Repository · Service)과 기능 모듈 셋(classic · mate · shared). 결제 한 건이 네 계층을 거쳐 서버로 내려가고, iOS 반주 엔진은 제어 채널 하나로만 연결된다.">
    <defs>
      <linearGradient id="ap-signal" x1="0" x2="1"><stop offset="0" className="ap-sig-a" /><stop offset="1" className="ap-sig-b" /></linearGradient>
    </defs>
    {/* The server, under everything: the only place the wallet and ownership are written. */}
    <g className="ap-server">
      <polygon points={poly([at(-8, -8, server), at(W + 8, -8, server), at(W + 8, D + 8, server), at(-8, D + 8, server)])} />
      <polygon className="ap-server-side" points={poly([at(-8, D + 8, server), at(W + 8, D + 8, server), at(W + 8, D + 8, server + 0.16), at(-8, D + 8, server + 0.16)])} />
      <polygon className="ap-server-side" points={poly([at(W + 8, -8, server), at(W + 8, D + 8, server), at(W + 8, D + 8, server + 0.16), at(W + 8, -8, server + 0.16)])} />
      <text x={at(W / 2, D / 2, server)[0]} y={at(W / 2, D / 2, server)[1] - 4} textAnchor="middle" className="ap-server-name">Supabase</text>
      <text x={at(W / 2, D / 2, server)[0]} y={at(W / 2, D / 2, server)[1] + 21} textAnchor="middle" className="ap-server-rule">잔액 · 소유권 쓰기는 서버만</text>
    </g>
    {/* The planes, bottom first so the upper ones lie over them. */}
    {LAYERS.map((layer, level) => level).reverse().map((level) => {
      const layer = LAYERS[level], right = at(W, 0, level), on = pick?.level === level ? pick.module : -1, spot = at(on * W / 3 + W / 6, D * 0.2, level);
      return <g key={layer.name} className={`ap-plane${on >= 0 ? " is-on" : ""}`}>
        <polygon points={plane(W, D, level)} />
        {on >= 0 && <polygon className="ap-cell" points={cell(on, level)} />}
        {[1, 2].map((m) => <line key={m} className="ap-split" x1={at(m * W / 3, 0, level)[0]} y1={at(m * W / 3, 0, level)[1]} x2={at(m * W / 3, D, level)[0]} y2={at(m * W / 3, D, level)[1]} />)}
        {layer.counts.map((count, m) => dots(m, count, m === 2 ? PAY : m === 0 && level === 3 ? PORT : undefined).map((p, k) => { const [x, y] = at(p.u, p.v, level); return <circle key={`${m}-${k}`} className={`ap-dot${m === on ? " is-on" : ""}`} cx={x} cy={y} r={m === on ? 3.5 : 2.7} />; }))}
        {on >= 0 && <text className="ap-count num" x={spot[0]} y={spot[1] + 9} textAnchor="middle"><tspan>{MODULES[on].name}</tspan> {layer.counts[on]}</text>}
        <text className="ap-layer-name" x={right[0] + 26} y={right[1] + 4}>{layer.name}</text>
        <text className="ap-layer-what num" x={right[0] + 26} y={right[1] + 29}>{layer.what} {layer.counts.reduce((a, b) => a + b, 0)}</text>
      </g>;
    })}
    {/* The pattern the four planes are, over their names. */}
    <text className="ap-pattern" x={at(W, 0, 0)[0] + 26} y={at(W, 0, 0)[1] - 38}>MVVM 패턴</text>
    {/* The modules, named along the back edge of the top plane. */}
    {MODULES.map((module, m) => { const [x, y] = at(m * W / 3 + W / 6, -12, 0); return <text key={module.name} className={`ap-module${pick?.module === m ? " is-on" : ""}`} x={x} y={y} textAnchor="middle" transform={`rotate(${edgeAngle.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}>{module.name} <tspan className="num">{module.features}</tspan></text>; })}
    {/* One purchase, top to bottom. */}
    <g className="ap-path">
      <line x1={payTop[0]} y1={payTop[1]} x2={payBottom[0]} y2={payBottom[1] - 6} />
      <polygon points={poly([[payBottom[0] - 6, payBottom[1] - 12], [payBottom[0] + 6, payBottom[1] - 12], [payBottom[0], payBottom[1] - 2]])} />
      {LAYERS.map((layer, level) => { const [x, y] = at(PAY.u, PAY.v, level); return <g key={layer.node}>
        <circle className="ap-node" cx={x} cy={y} r="5.5" />
        <text className="ap-node-name" x={x - 12} y={y + 4} textAnchor="end">{layer.node}</text>
      </g>; })}
      <circle className="ap-pulse" r="4"><animateMotion dur="3.2s" repeatCount="indefinite" path={`M${payTop[0]},${payTop[1]} L${payBottom[0]},${payBottom[1] - 6}`} /></circle>
    </g>
    <text className="ap-path-name" x={payTop[0] + 16} y={payTop[1] - 14}>결제 한 건</text>
    {/* The iOS engine apart: its audio goes round inside it; only control crosses to the app. */}
    <g className="ap-native">
      <polygon points={plane(native.w, native.d, native.level, native.x0)} />
      <ellipse className="ap-loop" cx={at(native.w / 2, native.d / 2, native.level, native.x0)[0]} cy={at(native.w / 2, native.d / 2, native.level, native.x0)[1]} rx="62" ry="20" />
      <text className="ap-native-name" x={at(0, 0, native.level, native.x0)[0]} y={at(0, 0, native.level, native.x0)[1] - 38} textAnchor="middle">iOS 반주 엔진</text>
      <text className="ap-native-rule" x={at(0, 0, native.level, native.x0)[0]} y={at(0, 0, native.level, native.x0)[1] - 12} textAnchor="middle">오디오는 이 안에서만</text>
    </g>
    <g className="ap-channel">
      <line x1={nativeEdge[0]} y1={nativeEdge[1]} x2={port[0]} y2={port[1]} />
      <circle className="ap-node" cx={port[0]} cy={port[1]} r="4.5" />
      <text x={(nativeEdge[0] + port[0]) / 2} y={(nativeEdge[1] + port[1]) / 2 + 22} textAnchor="middle">{CHANNEL.join(" · ")}</text>
    </g>
    {/* What the pointer is over: each layer's three columns, the upper layers over the lower as they are drawn. */}
    <g className="ap-hit">{[3, 2, 1, 0].flatMap((level) => [0, 1, 2].map((module) => <polygon key={`${level}-${module}`} points={cell(module, level)}
      onPointerEnter={() => setPick({ level, module })} onClick={() => setPick((now) => (now?.level === level && now.module === module ? null : { level, module }))} />))}</g>
  </svg>;
}

function StructurePart() {
  return <section className="vp-part" aria-label="구조">
    <Say kind="구조" name="모바일 앱" by="리드 엔지니어" line="실시간 오디오는 네이티브 계층 · 잔액과 소유권은 서버에서만"
      more={[["출시", "Flutter · Supabase로 개발해 iOS · Android 출시(2025.09 ~ 2026.07, 초기팀 풀타임)"],
        ["패턴", "MVVM. View → ViewModel(Riverpod Notifier) → Repository → Service(DataSource), 기능 모듈마다 같은 계층"],
        ["그림", "점 하나가 클래스 하나(출시본 v1.0.7 기준), 굵은 선은 결제 한 건이 거치는 클래스"],
        ["우선순위", "금전 무결성 → 오디오 실시간성 → 필기 좌표 불변성 → 오프라인 내성 → 테스트 가능성"]]} />
    <figure className="vp-picture" data-wide=""><AppLayers /></figure>
  </section>;
}

function HandwritingPart({ score }: PartProps) {
  return <section className="vp-part" aria-label="결정: 필기">
    <Say kind="결정" name="필기" line="필기는 PDF 원본 좌표로 저장 · 배율은 렌더러 담당" verdict={<>4회 실패 후</>}
      more={[["문제", "PDF 뷰어와 필기 라이브러리가 확대를 따로 처리해, 확대하면 필기만 커지고 악보는 그대로"],
        ["시도", "필기판 배경에 뷰어 배치 · 바깥에서 한 번 더 감싸기 · 페이지 이미지 렌더링(페이지당 약 18MB) · 두 확대 값 직접 맞추기"],
        ["채택", "뷰어가 페이지마다 주는 오버레이 자리에 필기 판을 올리고, 좌표는 PDF 원본 기준으로 저장"],
        ["동기화", "곡 목록은 마지막 쓰기 우선, 필기는 페이지 단위 3-way merge"]]} />
    <figure className="vp-picture" data-wide=""><PaperStroke score={score} /></figure>
  </section>;
}

function PaymentPart() {
  return <section className="vp-part" aria-label="결정: 결제">
    <Say kind="결정" name="결제" line="같은 결제가 중복 수신돼도 지급은 한 번" verdict="1회 지급"
      more={[["원칙", "잔액과 소유권은 서버만 변경, 앱은 응답에 실린 값만 표시"],
        ["중복 차단", "거래 테이블에 (결제 제공자, 외부 거래 ID) 고유 제약, 조건부 갱신이 행을 바꾼 요청만 지급"],
        ["완료 통지", "서버 검증이 성공했을 때만 스토어에 구매 완료 통지, 실패하면 스토어가 영수증 재전송"],
        ["지갑", "유료 · 보상 · 환불 부채 세 칸, 원장은 추가 전용이며 제약으로 검사"],
        ["검증", "DB 테스트(pgTAP)로 고정, 구현과 검수는 Codex와 Claude가 교차 수행"]]} />
    <figure className="vp-picture" data-wide=""><PaperPayment /></figure>
  </section>;
}

function IncidentPart({ score }: PartProps) {
  return <section className="vp-part" aria-label="QA에서 발견한 문제: 계정 경계">
    <Say kind="QA" name="계정 경계" line="계정 전환 시 곡 목록 · 필기 캐시 초기화" verdict={<>원인 3<small>곳</small> 차단</>}
      more={[["발견", "QA 중 탈퇴 후 같은 기기로 재가입한 계정에 생성 31초 만에 곡 소유 기록 133건. 수동 다운로드로는 불가능한 속도라 자동 동기화를 원인으로 추정"],
        ["조치", "원인 세 가지를 모두 차단, 로그아웃 시 캐시와 파일을 함께 정리하는 절차 추가"],
        ["결제 검증", "샌드박스 결제 시험에서 Apple 결제 검증이 런타임의 인증서 함수 미구현으로 실패 → 검증 직접 구현"],
        ["핫픽스", "팀원 PR 머지 후 운영 DB에 이미 반영된 보안 결함 2건 우선 수정"]]} />
    <figure className="vp-picture" data-wide=""><PaperAccount score={score} /></figure>
  </section>;
}

function HandoverPart() {
  return <section className="vp-part" aria-label="인수인계">
    <Say kind="인계" name="인수인계" line="원작자 없이 유지보수 · 확장 가능한 인수인계 문서" verdict={<>설계 결정 12<small>건</small></>}
      more={[["문서", "퇴사 시점(2026-07)에 쓴 문서 네 편"],
        ["설계 결정", "결정마다 맥락 → 결정 → 기각한 대안 → 결과"],
        ["불변 계약", "위반 시 영향 범위와 함께 수정해야 할 위치"]]} />
    <figure className="vp-picture" data-wide=""><PaperHandover /></figure>
  </section>;
}

const PARTS: StepPart<Props>[] = [
  { name: "구조", Part: StructurePart },
  { name: "필기", Part: HandwritingPart },
  { name: "결제", Part: PaymentPart },
  { name: "계정 경계", Part: IncidentPart },
  { name: "인수인계", Part: HandoverPart },
];

export function AppParts({ project, ...props }: Props & { project: string }) {
  return <StepParts parts={PARTS} props={props} label="모바일 앱의 단계" scene="app" project={project} />;
}
