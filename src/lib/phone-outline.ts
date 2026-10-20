// The phone as the landing draws it (src/components/product-assembly.tsx) and as every other picture that shows a
// phone draws it (src/components/model-3d-steps.tsx): a rounded outline as evenly spaced points, from the top middle
// round to the right, then the earpiece slit. `pw` is commonly 0.48 of `ph`. `up` is the sign of the top: -1 where y
// grows downward (a page), 1 where it grows upward (a 3D scene).
export const PHONE_ASPECT = 0.48;
export function phoneOutline(pcx: number, pcy: number, pw: number, ph: number, step: number, up = -1) {
  const r = pw * 0.16, x0 = pcx - pw / 2, y0 = pcy - ph / 2, out: [number, number][] = [];
  const segs: ((u: number) => [number, number])[] = [], lens: number[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => { segs.push((u) => [ax + (bx - ax) * u, ay + (by - ay) * u]); lens.push(Math.hypot(bx - ax, by - ay)); };
  const arc = (cx: number, cy: number, a0: number) => { segs.push((u) => [cx + r * Math.cos(a0 + u * Math.PI / 2), cy + r * Math.sin(a0 + u * Math.PI / 2)]); lens.push(r * Math.PI / 2); };
  line(pcx, y0, x0 + pw - r, y0); arc(x0 + pw - r, y0 + r, -Math.PI / 2); line(x0 + pw, y0 + r, x0 + pw, y0 + ph - r); arc(x0 + pw - r, y0 + ph - r, 0);
  line(x0 + pw - r, y0 + ph, x0 + r, y0 + ph); arc(x0 + r, y0 + ph - r, Math.PI / 2); line(x0, y0 + ph - r, x0, y0 + r); arc(x0 + r, y0 + r, Math.PI); line(x0 + r, y0, pcx, y0);
  segs.forEach((seg, i) => { const n = Math.max(1, Math.round(lens[i] / step)); for (let k = 0; k < n; k++) out.push(seg(k / n)); });
  // The earpiece slit.
  for (let k = 0; k <= 8; k++) out.push([pcx - pw * 0.12 + pw * 0.24 * k / 8, y0 + ph * 0.035]);
  // Drawn with the top up, the outline is turned over about its middle.
  return up < 0 ? out : out.map(([x, y]): [number, number] => [x, 2 * pcy - y]);
}
