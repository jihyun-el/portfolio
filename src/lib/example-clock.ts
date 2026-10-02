// One clock for every view of the example performance, so the diagram, the strip and the cards show the same moment.
export const TIME_SCALE = 0.5;
let origin: number | null = null;
export function exampleTime(now: number) {
  origin ??= now;
  return (now - origin) / 1000 * TIME_SCALE;
}
