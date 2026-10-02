import type { Comparison, MetricView } from "@/lib/showcase";

export function MetricGrid({ items }: { items: MetricView[] }) {
  return <div className="metrics">{items.map((item) => <div className="metric" key={item.label}>
    <b className="num">{item.value}{item.unit && <small>{item.unit}</small>}</b><span>{item.label}</span>
  </div>)}</div>;
}

export function CompareBars({ compare }: { compare: Comparison }) {
  const max = Math.max(compare.before, compare.after);
  const format = (value: number) => `${value.toFixed(value % 1 ? compare.digits : 0)}${compare.unit}`;
  const delta = compare.lowerIsBetter
    ? `${Math.round((1 - compare.after / compare.before) * 100)}% 단축`
    : `+${(compare.after - compare.before).toFixed(compare.digits)}`;
  return <div><p className="sect-l">{compare.label}</p>
    <div className="cmp num">
      <span>이전</span><div className="tr"><div className="fl ghost" style={{ width: `${compare.before / max * 100}%` }} /></div><em>{format(compare.before)}</em>
      <span>이후</span><div className="tr"><div className="fl" style={{ width: `${compare.after / max * 100}%` }} /></div><em>{format(compare.after)}</em>
    </div>
    <p className="delta num">{delta}</p>
  </div>;
}

const counts = ["영", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
export const countWord = (value: number) => counts[value] ?? String(value);

// Feature maps narrowing toward a 1×1 output, with a kernel sliding over the first map.
export function CnnGlyph() {
  return <svg className="cnn-glyph" viewBox="0 0 96 46" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => <rect key={i} x={4 + i * 18} y={4 + i * 4} width={14} height={38 - i * 8} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.45 + i * 0.15} />)}
    <rect x={84} y={18} width={4} height={10} fill="currentColor" />
    <rect className="cnn-kernel" x={4} y={4} width={7} height={7} fill="currentColor" />
  </svg>;
}
