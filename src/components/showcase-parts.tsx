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
