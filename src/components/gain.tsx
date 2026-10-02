import type { Comparison } from "@/lib/showcase";

// An improvement drawn so it reads without the caption: the change as a large badge,
// then the before and after bars on one scale with the after value in the accent colour.
export function Gain({ compare, compact = false }: { compare: Comparison; compact?: boolean }) {
  const max = Math.max(compare.before, compare.after);
  const format = (value: number) => `${value.toFixed(value % 1 ? compare.digits : 0)}${compare.unit}`;
  const badge = compare.lowerIsBetter
    ? `−${Math.round((1 - compare.after / compare.before) * 100)}%`
    : `+${(compare.after - compare.before).toFixed(compare.deltaDigits ?? compare.digits)}`;
  return <figure className={`gain${compact ? " gain-compact" : ""}`}>
    <p className="gain-badge num"><b>{badge}</b><span>{compare.lowerIsBetter ? "단축" : "상승"}</span></p>
    <div className="gain-bars num" role="img" aria-label={`${compare.label}: ${format(compare.before)}에서 ${format(compare.after)}`}>
      <span>이전</span><i><s style={{ width: `${compare.before / max * 100}%` }} /></i><em>{format(compare.before)}</em>
      <span>이후</span><i><s className="up" style={{ width: `${Math.max(compare.after / max * 100, 1.5)}%` }} /></i><em className="up">{format(compare.after)}</em>
    </div>
    <figcaption>{compare.label}</figcaption>
  </figure>;
}
