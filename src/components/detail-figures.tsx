"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { LOOP, accompU, anchorU, prepareFollower, sceneAt, singerU, voiceAt } from "@/lib/example-score";

// Pictures for the cards of a detail, drawn in the detail's own grammar (src/components/future-reach.tsx): ink on
// paper, a 1.5px line for what the engine does, a dashed one for what it does not, small type in the card's words.
// Each is laid out at the width it is given, so its type stays the size of the text around it.

function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(initial);
  useEffect(() => {
    const box = ref.current!, resizer = new ResizeObserver(() => setWidth(box.clientWidth));
    resizer.observe(box);
    return () => resizer.disconnect();
  }, []);
  return [ref, width] as const;
}
const Key = ({ kind }: { kind: string }) => <svg className="dv-fan-key" width="22" height="8" aria-hidden="true"><line className={kind} x1="0" y1="4" x2="22" y2="4" /></svg>;
function Frame({ caption, legend, note, label, children }: { caption: string; legend?: ReactNode; note: string; label: string; children: ReactNode }) {
  return <figure className="dv-reach dv-fig">
    <figcaption>{caption}</figcaption>
    {legend && <p className="dv-reach-legend">{legend}</p>}
    {children}
    <p className="dv-reach-note">{note}</p>
    <p className="sr-only">{label}</p>
  </figure>;
}

/* ---------- 08 · three positions: playing the estimate as it is, against a playback of its own ---------- */
// The stretch of the example around the long rest, its re-entry and the octave slip. Above, the accompaniment is
// drawn as if it played the follower's estimate as it is; below, as the engine plays it, on its own position. The
// singer is the thin line in both, the accompaniment the thick one.
const FROM_BEAT = 9, TO_BEAT = 22;
export function ThreePositions() {
  const [box, width] = useWidth(680);
  const [ready, setReady] = useState(false);
  useEffect(() => { prepareFollower(); setReady(true); }, []);
  const data = useMemo(() => {
    if (!ready) return null;
    const step = 0.02, at: number[] = [];
    for (let t = 0; t < LOOP; t += step) at.push(t);
    const start = at.find((t) => singerU(t) >= FROM_BEAT) ?? 0, end = at.find((t) => singerU(t) >= TO_BEAT) ?? LOOP;
    const rows = at.filter((t) => t >= start && t <= end).map((t) => {
      const s = singerU(t), v = voiceAt(s);
      return { t, singer: s, follow: anchorU(t), play: accompU(t), heard: v.pitch !== null && v.amp >= 0.25 };
    });
    const all = rows.flatMap((r) => [r.singer, r.follow, r.play]), lo = Math.min(...all), hi = Math.max(...all);
    // Where the estimate jumps furthest: the re-entry after the long rest.
    let jump = 1;
    for (let k = 1; k < rows.length; k++) if (rows[k].follow - rows[k - 1].follow > rows[jump].follow - rows[jump - 1].follow) jump = k;
    const spans: { name: string; from: number; to: number }[] = [];
    for (const r of rows) { const name = sceneAt(r.t).name; const last = spans.at(-1); if (last?.name === name) last.to = r.t; else spans.push({ name, from: r.t, to: r.t }); }
    return { start, end, rows, lo, hi, jump, spans: spans.filter((s) => s.name === "긴 쉼" || s.name === "옥타브 오류") };
  }, [ready]);
  const H = 132, left = 8, right = 8, top = 22, bottom = 14;
  const path = (points: [number, number][]) => points.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const panel = (kind: "follow" | "play", last: boolean) => {
    if (!data) return null;
    const h = H + (last ? 18 : 0);
    const x = (t: number) => left + (t - data.start) / (data.end - data.start) * (width - left - right);
    const y = (b: number) => top + (data.hi - b) / (data.hi - data.lo) * (H - top - bottom);
    const rest = data.spans.find((s) => s.name === "긴 쉼"), jumped = data.rows[data.jump];
    const mid = rest && data.rows.find((r) => r.t >= (rest.from + rest.to) / 2)!;
    return <svg className="dv-fan-svg" width={width} height={h} aria-hidden="true">
      {data.spans.map((s) => <g key={s.name + s.from}>
        <rect className="df-band" x={x(s.from)} y={top - 8} width={Math.max(2, x(s.to) - x(s.from))} height={H - top - bottom + 8} />
        {x(s.from) + 70 > width - right
          ? <text className="dv-fan-label" x={x(s.to) - 2} y={top - 12} textAnchor="end">{s.name}</text>
          : <text className="dv-fan-label" x={x(s.from) + 4} y={top - 12}>{s.name}</text>}
      </g>)}
      <path className="df-singer" d={path(data.rows.map((r) => [x(r.t), y(r.singer)]))} />
      <path className="df-singer-on" d={data.rows.map((r, k) => (r.heard ? `${k && data.rows[k - 1].heard ? "L" : "M"}${x(r.t).toFixed(1)},${y(r.singer).toFixed(1)}` : "")).join("")} />
      <path className="df-play" d={path(data.rows.map((r) => [x(r.t), y(r[kind])]))} />
      {kind === "follow" && rest && mid && <text className="dv-fan-label" data-strong="" x={(x(rest.from) + x(rest.to)) / 2} y={y(mid.follow) + 16} textAnchor="middle">멈춤</text>}
      {kind === "follow" && <text className="dv-fan-label" data-strong="" x={x(jumped.t) + 6} y={(y(jumped.follow) + y(data.rows[data.jump - 1].follow)) / 2 + 4}>도약</text>}
      {kind === "play" && rest && mid && <text className="dv-fan-label" data-strong="" x={(x(rest.from) + x(rest.to)) / 2} y={y(mid.play) - 10} textAnchor="middle">템포대로 진행</text>}
      {kind === "play" && <text className="dv-fan-label" data-strong="" x={x(jumped.t) + 6} y={y(jumped.play) + 18}>서서히 합류</text>}
      <text className="dv-fan-label" x={left} y={top + 4}>악보 위치 ↑</text>
      {last && <>
        <line className="df-axis" x1={left} y1={H} x2={width - right} y2={H} />
        <text className="dv-fan-label" x={width - right} y={H + 14} textAnchor="end">연주 시간 →</text>
      </>}
    </svg>;
  };
  return <Frame caption="추정 위치를 그대로 재생할 때와 재생 위치를 분리했을 때"
    legend={<><Key kind="df-singer-on" />가수 위치<Key kind="df-play" />반주가 재생하는 위치</>}
    note="홈 08 단계와 같은 예제 연주(만든 노래)에 엔진을 실행한 결과다. 위 칸은 같은 실행의 추정 위치를 반주가 그대로 재생했다고 놓고 그렸다. 가수 위치는 노래하는 동안만 실선이다."
    label="추정 위치를 그대로 재생하면 반주는 음표마다 멈췄다가 다음 음으로 건너뛰고, 긴 쉼에서는 멈춰 있다가 노래가 돌아오면 크게 도약한다. 재생 위치를 분리하면 반주는 쉼에서도 템포대로 진행하고, 노래가 돌아오면 도약 없이 서서히 가수에게 합류한다.">
    <div ref={box} className="df-box">
      <p className="dv-fan-name"><b>추정 위치를 그대로 재생하면</b><span>음마다 멈추고 도약한다</span></p>
      {panel("follow", false)}
      <p className="dv-fan-name"><b>재생 위치를 분리하면</b><span>멈추지 않고 서서히 합류한다</span></p>
      {panel("play", true)}
    </div>
  </Frame>;
}

/* ---------- 03 · two models distilled into one: separation and pitch, then the 14-layer CNN on the phone ---------- */
export function ModelDistill() {
  return <Frame caption="두 모델을 14층 CNN 하나로 증류"
    note="학습에서는 위 두 모델이 낸 360빈 값만 정답으로 쓰고, 기기에는 아래 한 모델만 올린다. 시간 수용영역 27프레임 가운데 2프레임은 미래 참조다."
    label="기존에는 반주가 섞인 녹음을 보컬 분리 모델 Mel-RoFormer로 거른 뒤 음높이 추정 모델 FCPE로 360빈 값을 얻었다. 분리 모델은 곡 전체를 앞뒤로 보는 큰 모델이라 기기에서 실시간으로 실행할 수 없다. 그 360빈 값만 정답으로 삼아, 섞인 입력에서 같은 값을 바로 내는 14층 CNN 하나로 증류했다.">
    <div className="df-distill">
      <p className="dv-fan-name"><b>기존</b>두 모델<span>곡 전체를 앞뒤로 본다</span></p>
      <div className="df-chain">
        <div className="df-node"><p>반주가 섞인 녹음</p></div>
        <i className="df-arrow" aria-hidden="true">→</i>
        <div className="df-node" data-off=""><p>보컬 분리<small>Mel-RoFormer · 기기 실시간 불가</small></p></div>
        <i className="df-arrow" aria-hidden="true">→</i>
        <div className="df-node"><p>음높이 추정<small>FCPE</small></p></div>
        <i className="df-arrow" aria-hidden="true">→</i>
        <div className="df-node df-out"><p>360빈</p></div>
      </div>
      <p className="df-teach"><span aria-hidden="true">↓</span>이 값만 정답으로 학습 (증류)</p>
      <p className="dv-fan-name"><b>배포</b>한 모델<span>기기에서 10ms마다</span></p>
      <div className="df-chain">
        <div className="df-node"><p>섞인 마이크 입력</p></div>
        <i className="df-arrow" aria-hidden="true">→</i>
        <div className="df-node df-wide" data-result=""><p>14층 CNN<small>Conv2d · BatchNorm · ReLU × 13 + 1×1 출력층 · 풀링 없음 · 80채널 · 약 117만 파라미터</small><small>수용영역: 시간 27프레임(270ms) · 주파수 53빈</small></p></div>
        <i className="df-arrow" aria-hidden="true">→</i>
        <div className="df-node df-out"><p>360빈</p></div>
      </div>
    </div>
  </Frame>;
}

/* ---------- 01 · handwriting merged page by page: base, this device, the server, the result ---------- */
type Stroke = { id: number; mark?: "gone" | "new" };
const Strokes = ({ list }: { list: Stroke[] }) => <ul className="df-strokes">{list.map((s) => <li key={s.id} data-mark={s.mark}>
  <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><path d={["M2 10 C7 2, 12 2, 14 7 S22 12, 24 4", "M2 4 L9 11 L16 3 L24 10", "M3 7 C8 1, 18 13, 23 7", "M2 11 Q13 -3 24 11", "M3 3 L23 11 M3 11 L23 3"][(s.id - 1) % 5]} /></svg>
  <span className="num">{s.id}</span>
</li>)}</ul>;
export function StrokeMerge() {
  const base: Stroke[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const device: Stroke[] = [{ id: 1 }, { id: 2, mark: "gone" }, { id: 3 }, { id: 4, mark: "new" }];
  const server: Stroke[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 5, mark: "new" }];
  return <Frame caption="같은 페이지를 두 곳에서 고쳤을 때"
    legend={<><span className="df-chip" data-mark="new" />추가한 획<span className="df-chip" data-mark="gone" />지운 획</>}
    note="예시다. 페이지마다 마지막 동기화 상태 · 현재 기기 · 서버의 획 목록을 비교한다. 오프라인에서 쓴 변경은 대기열에 쌓았다가 올린다."
    label="기준 상태에 획 1 · 2 · 3이 있다. 이 기기는 2를 지우고 4를 더했고, 서버에는 다른 기기가 더한 5가 있다. 병합하면 2는 지워지고 4와 5는 모두 남아 1 · 3 · 4 · 5가 된다. 문서 전체를 마지막 쓰기로 덮으면 5가 사라진다.">
    <div className="df-merge">
      <div className="df-node"><p>기준 상태<small>마지막 동기화</small></p><Strokes list={base} /></div>
      <i className="df-arrow" aria-hidden="true">→</i>
      <div className="df-pair">
        <div className="df-node"><p>이 기기</p><Strokes list={device} /></div>
        <div className="df-node"><p>서버<small>다른 기기의 변경</small></p><Strokes list={server} /></div>
      </div>
      <i className="df-arrow" aria-hidden="true">→</i>
      <div className="df-node" data-result=""><p>병합 결과</p><Strokes list={[{ id: 1 }, { id: 3 }, { id: 4 }, { id: 5 }]} /><small className="df-rule">지운 획은 지우고, 추가한 획은 합친다</small></div>
    </div>
    <div className="df-lost"><p>문서 전체를 마지막 쓰기로 덮으면</p><Strokes list={[{ id: 1 }, { id: 3 }, { id: 4 }]} /><small>서버의 5가 사라진다</small></div>
  </Frame>;
}

/* ---------- 02 · one payment, granted once: the store, the app, the server function, the database ---------- */
const LANES = ["스토어", "앱", "서버 함수", "DB"];
type Message = { from: number; to: number; text: string; twice?: boolean; dashed?: boolean };
const MESSAGES: (Message | { at: number; text: string; sub?: string })[] = [
  { from: 0, to: 1, text: "결제 · 영수증" },
  { from: 1, to: 2, text: "같은 영수증 2회", twice: true },
  { at: 2, text: "서명 · 계정 확인", sub: "Apple 인증서 체인 · Google Play API" },
  { from: 2, to: 3, text: "조건부 UPDATE 2회", twice: true },
  { at: 3, text: "고유 제약", sub: "(결제 제공자, 외부 거래 ID)" },
  { from: 3, to: 2, text: "한 요청만 1행 변경", dashed: true },
  { from: 2, to: 1, text: "지급 · 다른 요청은 이미 처리됨", dashed: true },
  { from: 1, to: 0, text: "구매 완료 · 검증 성공 때만" },
];
export function PaymentFlow() {
  const [box, width] = useWidth(680), head = useId();
  // A message takes one line of room, a step on a lifeline two.
  const pad = 46, top = 30, heights = MESSAGES.map((m) => ("at" in m ? 50 : 32)), starts = heights.map((_, k) => heights.slice(0, k).reduce((s, h) => s + h, 0));
  const H = top + heights.reduce((s, h) => s + h, 0) + 14;
  const lane = (k: number) => pad + k * (width - pad * 2) / (LANES.length - 1), y = (k: number) => top + 18 + starts[k] + ("at" in MESSAGES[k] ? 6 : 0);
  return <Frame caption="같은 영수증이 두 번 와도 지급은 한 번"
    legend={<><Key kind="df-msg" />요청<Key kind="df-msg-back" />응답</>}
    note="두 요청 중 조건부 UPDATE가 행을 바꾼 요청만 지급하고, 나머지는 '이미 처리됨'을 받는다. 서버 검증이 실패하면 구매 완료를 알리지 않아 스토어가 영수증을 다시 보낸다."
    label="스토어가 앱에 결제와 영수증을 넘기고, 앱이 같은 영수증을 두 번 서버 함수로 보낸다. 서버는 서명과 계정을 확인하고 DB에 조건부 UPDATE를 보낸다. DB의 고유 제약 때문에 첫 요청만 행을 바꿔 지급되고, 둘째 요청은 이미 처리됨을 받는다. 앱은 검증이 성공했을 때만 스토어에 구매 완료를 알린다.">
    <div ref={box} className="df-box">
      <svg className="dv-fan-svg" width={width} height={H} aria-hidden="true">
        <defs><marker id={head} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" className="df-head" /></marker></defs>
        {LANES.map((name, k) => <g key={name}>
          <text className="dv-fan-label" x={lane(k)} y={14} textAnchor="middle" data-strong="">{name}</text>
          <line className="df-life" x1={lane(k)} y1={22} x2={lane(k)} y2={H - 4} />
        </g>)}
        {MESSAGES.map((m, k) => "at" in m
          ? <g key={k}>
              <rect className="df-act" x={lane(m.at) - 5} y={y(k) - 13} width={10} height={22} />
              <text className="dv-fan-label" x={lane(m.at) + (m.at === LANES.length - 1 ? -12 : 12)} y={y(k) - 2} textAnchor={m.at === LANES.length - 1 ? "end" : "start"} data-strong="">{m.text}</text>
              {m.sub && width >= 520 && <text className="dv-fan-label df-sub" x={lane(m.at) + (m.at === LANES.length - 1 ? -12 : 12)} y={y(k) + 11} textAnchor={m.at === LANES.length - 1 ? "end" : "start"}>{m.sub}</text>}
            </g>
          : <g key={k}>
              {(m.twice ? [-3, 3] : [0]).map((d) => <line key={d} className={m.dashed ? "df-msg-back" : "df-msg"} x1={lane(m.from)} y1={y(k) + d} x2={lane(m.to) + (m.to > m.from ? -2 : 2)} y2={y(k) + d} markerEnd={`url(#${head})`} />)}
              <text className="dv-fan-label" x={(lane(m.from) + lane(m.to)) / 2} y={y(k) - 8} textAnchor="middle">{m.text}</text>
            </g>)}
      </svg>
    </div>
  </Frame>;
}
