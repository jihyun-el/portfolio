"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import sample from "@/lib/mirror-pose-sample.json";

type V2 = [number, number];
type V3 = [number, number, number];

// One sample photo: the joints found on the person and on the mirror image, and the 3D joints solved
// from the two (exported from the mirror-pose repository's saved reconstruction). 3D axes are x right,
// y away from the camera, z up. The camera is at the origin, the mirror is the plane n·p = d, and the
// camera-to-mirror distance is the unit.
const JOINTS = sample.joints as V3[], N = sample.normal as V3, D = sample.distance;
const NAMES = ["코", "왼눈", "오른눈", "왼귀", "오른귀", "왼어깨", "오른어깨", "왼팔꿈치", "오른팔꿈치", "왼손목", "오른손목", "왼골반", "오른골반", "왼무릎", "오른무릎", "왼발목", "오른발목"];
const LIMBS = [[5, 7], [7, 9], [6, 8], [8, 10], [11, 13], [13, 15], [12, 14], [14, 16], [5, 6], [5, 11], [6, 12], [11, 12]];
const BODY = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const HEAD = 0.062;   // head radius as a share of body height
const WRIST = 9;      // the raised arm's wrist, shown first

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mirrored = (p: V3): V3 => { const k = 2 * (dot(N, p) - D); return [p[0] - k * N[0], p[1] - k * N[1], p[2] - k * N[2]]; };
const mean = <T extends number[]>(points: T[]) => points[0].map((_, k) => points.reduce((sum, p) => sum + p[k], 0) / points.length) as T;

const GHOSTS = JOINTS.map(mirrored);
const CAMERA: V3 = [0, 0, 0], TWIN = mirrored(CAMERA);
const FLOOR = Math.min(...JOINTS.map((p) => p[2])) - 0.04;
const TALL = Math.max(...JOINTS.map((p) => p[2])) - FLOOR;

// The room seen from above: `across` points from the camera to the mirror, `beside` runs along it.
const flat = Math.hypot(N[0], N[1]);
const across: V3 = [N[0] / flat, N[1] / flat, 0], beside: V3 = [-across[1], across[0], 0];
const wall = (D - N[2] * FLOOR) / flat;   // where the mirror meets the floor, measured along `across`
const onFloor = (a: number, b: number, z = FLOOR): V3 => [across[0] * a + beside[0] * b, across[1] * a + beside[1] * b, z];
const ROOM = [onFloor(wall - 2.6, -1.4), onFloor(wall, -1.4), onFloor(wall, 4.7), onFloor(wall - 2.6, 4.7)];
const BEYOND = [onFloor(wall, -1.4), onFloor(wall + 2.6, -1.4), onFloor(wall + 2.6, 4.7), onFloor(wall, 4.7)];
const MIRROR = [onFloor(wall, 0.75), onFloor(wall, 3.95), onFloor(wall, 3.95, FLOOR + TALL + 0.3), onFloor(wall, 0.75, FLOOR + TALL + 0.3)];
// What the view keeps in frame; the floor runs past the edges.
const SUBJECT = [...MIRROR, ...JOINTS, ...GHOSTS, CAMERA, TWIN];
const CENTER = mean(SUBJECT);

// A view of the scene turned by `yaw` and tilted down by `pitch` (degrees), one unit to one pixel at the centre.
const REACH = 9;
function lens(yaw: number, pitch: number) {
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
  const depth = (p: V3) => ((p[0] - CENTER[0]) * sy + (p[1] - CENTER[1]) * cy) * cp - (p[2] - CENTER[2]) * sp;
  const scale = (p: V3) => REACH / (REACH + depth(p));
  const place = (p: V3): V2 => {
    const x = p[0] - CENTER[0], y = p[1] - CENTER[1], z = p[2] - CENTER[2], k = scale(p);
    return [k * (x * cy - y * sy), -k * (z * cp + (x * sy + y * cy) * sp)];
  };
  return { depth, scale, place };
}

// The opening view looks along the mirror, so the room sits on the left and its reflection on the right.
const W = 423, H = 302, PHOTO = 0.1;
const YAW = 4, PITCH = 22, SWAY = 9, PERIOD = 14;
type Margin = { side: number; top: number; foot: number };
const NAMED: Margin = { side: 44, top: 24, foot: 36 }, BARE: Margin = { side: 18, top: 14, foot: 14 };

function Person({ points, radius }: { points: V2[]; radius: number }) {
  const head = mean(points.slice(0, 5)), neck = mean([points[5], points[6]]);
  return <>
    {LIMBS.map(([a, b]) => <line key={`${a}-${b}`} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} />)}
    <line x1={neck[0]} y1={neck[1]} x2={head[0]} y2={head[1]} />
    <circle className="mp-head" cx={head[0]} cy={head[1]} r={radius} />
  </>;
}

// Joints as dots. With `onSelect` each one can be pointed at or pressed to choose it.
function Dots({ points, selected, onSelect }: { points: V2[]; selected: number; onSelect?: (joint: number) => void }) {
  return <>{BODY.map((i) => <g key={i} onPointerEnter={onSelect && (() => onSelect(i))} onPointerDown={onSelect && (() => onSelect(i))}>
    {onSelect && <circle className="mp-hit" cx={points[i][0]} cy={points[i][1]} r={11} />}
    <circle className={i === selected ? "mp-dot on" : "mp-dot"} cx={points[i][0]} cy={points[i][1]} r={i === selected ? 4.6 : 2.4} />
  </g>)}</>;
}

function Camera({ at, className }: { at: V2; className: string }) {
  return <g className={className} transform={`translate(${at[0]} ${at[1]})`}><rect x={-10} y={-6.5} width={20} height={13} rx={2.5} /><rect x={-4} y={-9.5} width={8} height={3.5} rx={1} /><circle r={3.6} /></g>;
}

// The room, the mirror and the reflection behind it, drawn for one viewing angle. Whatever the angle,
// the people, the mirror and both cameras fill the pane.
function Scene({ yaw, pitch, selected, onSelect, margin, named }: { yaw: number; pitch: number; selected: number; onSelect?: (joint: number) => void; margin: Margin; named: boolean }) {
  const eye = lens(yaw, pitch);
  const framed = SUBJECT.map(eye.place);
  const span = (k: number) => [Math.min(...framed.map((p) => p[k])), Math.max(...framed.map((p) => p[k]))];
  const [left, right] = span(0), [top, bottom] = span(1);
  const zoom = Math.min((W - 2 * margin.side) / (right - left), (H - margin.top - margin.foot) / (bottom - top));
  const ox = W / 2 - zoom * (left + right) / 2, oy = (margin.top + H - margin.foot) / 2 - zoom * (top + bottom) / 2;
  const place = (p: V3): V2 => { const [x, y] = eye.place(p); return [ox + zoom * x, oy + zoom * y]; };
  const path = (points: V3[], close = false) => points.map(place).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + (close ? "Z" : "");
  const headSize = (points: V3[]) => HEAD * TALL * zoom * eye.scale(mean(points.slice(0, 5)));

  const joint = JOINTS[selected], ghost = GHOSTS[selected];
  const bounce = along(CAMERA, ghost, D / dot(N, ghost));   // where the camera's line to the mirror image meets the mirror
  const real = JOINTS.map(place), ghosts = GHOSTS.map(place);
  const atFeet = (points: V3[]): V2 => { const [x, y] = place([...mean([points[15], points[16]]).slice(0, 2), FLOOR] as V3); return [x, y + 17]; };
  const mirrorTop = place(along(MIRROR[3], MIRROR[2], 0.5));
  const cam = place(CAMERA), twin = place(TWIN);

  // Painted far to near: whichever side of the mirror is farther from the viewer goes under the mirror.
  const room = <g key="room">
    <path className="mp-ray" d={path([CAMERA, joint])} />
    <path className="mp-ray" d={path([CAMERA, bounce, joint])} />
    <g className="mp-real"><Person points={real} radius={headSize(JOINTS)} /></g>
    <path className="mp-stand" d={path([CAMERA, [0, 0, FLOOR]])} />
    <Camera at={cam} className="mp-cam" />
  </g>;
  const reflection = <g key="reflection">
    <g className="mp-ghost"><Person points={ghosts} radius={headSize(GHOSTS)} /></g>
    <path className="mp-ray virtual" d={path([bounce, ghost])} />
    <path className="mp-ray virtual" d={path([TWIN, bounce])} />
    <path className="mp-stand" d={path([TWIN, [TWIN[0], TWIN[1], FLOOR]])} />
    <Camera at={twin} className="mp-cam virtual" />
  </g>;
  const glass = <path key="glass" className="mp-mirror" d={path(MIRROR, true)} />;
  const roomIsNear = eye.depth(onFloor(wall - 1, 2)) < eye.depth(onFloor(wall + 1, 2));

  return <>
    <path className="mp-floor" d={path(ROOM, true)} />
    <path className="mp-floor virtual" d={path(BEYOND, true)} />
    {roomIsNear ? [reflection, glass, room] : [room, glass, reflection]}
    <g className="mp-ghost"><Dots points={ghosts} selected={selected} onSelect={onSelect} /></g>
    <g className="mp-real"><Dots points={real} selected={selected} onSelect={onSelect} /></g>
    {named && <>
      <text className="mp-label" x={atFeet(JOINTS)[0]} y={atFeet(JOINTS)[1]}>실제</text>
      <text className="mp-label" x={atFeet(GHOSTS)[0]} y={atFeet(GHOSTS)[1]}>거울상</text>
      <text className="mp-label" x={mirrorTop[0]} y={mirrorTop[1] - 7}>거울</text>
      <text className="mp-label" x={cam[0]} y={cam[1] + 24}>카메라</text>
      <text className="mp-label" x={twin[0]} y={twin[1] + 24}>거울 속 카메라</text>
    </>}
  </>;
}

// A still of the scene for the card on the home page.
export function MirrorPoseThumb() {
  return <svg className="mirror-thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><Scene yaw={YAW} pitch={PITCH} selected={WRIST} margin={BARE} named={false} /></svg>;
}

export function MirrorPoseFigure() {
  const [selected, setSelected] = useState(WRIST);
  const [view, setView] = useState({ yaw: YAW, pitch: PITCH });
  const paneRef = useRef<SVGSVGElement>(null);
  const drag = useRef<V2 | null>(null);
  const touched = useRef(false);

  // Until the reader turns it, the scene sways a little so it reads as 3D.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, visible = false;
    const start = performance.now();
    const tick = (now: number) => {
      frame = 0;
      if (touched.current || !visible) return;
      setView((v) => ({ ...v, yaw: YAW + SWAY * Math.sin((now - start) / 1000 * 2 * Math.PI / PERIOD) }));
      frame = requestAnimationFrame(tick);
    };
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && !frame) frame = requestAnimationFrame(tick); });
    seen.observe(pane);
    return () => { seen.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  // Dragging turns the scene: sideways all the way round, up and down between eye level and straight above.
  const down = (event: PointerEvent<SVGSVGElement>) => { touched.current = true; drag.current = [event.clientX, event.clientY]; event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current[0], dy = event.clientY - drag.current[1];
    drag.current = [event.clientX, event.clientY];
    // A finger moving up or down scrolls the page, so only the mouse tilts the view.
    setView((v) => ({ yaw: v.yaw + dx * 0.45, pitch: event.pointerType === "mouse" ? Math.min(88, Math.max(0, v.pitch + dy * 0.35)) : v.pitch }));
  };
  const release = () => { drag.current = null; };
  const reset = () => { touched.current = true; setView({ yaw: YAW, pitch: PITCH }); };

  const photo = (points: number[][]) => points.map(([x, y]): V2 => [x * PHOTO, y * PHOTO]);
  const real2 = photo(sample.real2d), ghost2 = photo(sample.mirror2d);
  const tall2 = (points: V2[]) => Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  const below = (points: V2[]): V2 => [mean(points)[0], Math.max(...points.map((p) => p[1])) + 20];

  return <figure className="mirror-figure">
    <div className="mirror-panes">
      <div className="mirror-pane is-photo">
        <p><b>사진 한 장</b><span>실제와 거울상이 함께 찍힘</span></p>
        <svg viewBox={`0 0 ${sample.image[0] * PHOTO} ${sample.image[1] * PHOTO}`} role="img" aria-label="사진 한 장 안에서 찾은 실제 사람의 관절과 거울상의 관절">
          <line className="mp-ray virtual" x1={real2[selected][0]} y1={real2[selected][1]} x2={ghost2[selected][0]} y2={ghost2[selected][1]} />
          <g className="mp-ghost"><Person points={ghost2} radius={HEAD * tall2(ghost2)} /><Dots points={ghost2} selected={selected} onSelect={setSelected} /></g>
          <g className="mp-real"><Person points={real2} radius={HEAD * tall2(real2)} /><Dots points={real2} selected={selected} onSelect={setSelected} /></g>
          <text className="mp-label" x={below(real2)[0]} y={below(real2)[1]}>실제</text>
          <text className="mp-label" x={below(ghost2)[0]} y={below(ghost2)[1]}>거울상</text>
        </svg>
      </div>
      <div className="mirror-pane is-space">
        <p><b>복원한 3D</b><span>끌어서 돌리기 · 두 번 누르면 처음 각도</span></p>
        <svg ref={paneRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="카메라, 거울, 실제 사람과 거울상을 3D로 놓은 그림. 카메라와 거울 속 카메라에서 나온 두 시선이 고른 관절에서 만난다."
          onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onDoubleClick={reset}>
          <Scene yaw={view.yaw} pitch={view.pitch} selected={selected} onSelect={setSelected} margin={NAMED} named />
        </svg>
      </div>
    </div>
    <p className="mirror-status" aria-live="polite"><b>{NAMES[selected]}</b> 카메라가 직접 본 시선과 거울로 본 시선이 만나는 곳이 이 관절의 3D 위치입니다.</p>
  </figure>;
}
