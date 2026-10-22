// The theme's stage colour (`--stage` in globals.css) as display values 0–1. The light pictures draw their cleared
// stage in it, so a canvas meets the panel around it without an edge whichever theme or stage colour is set.
let probe: CanvasRenderingContext2D | null = null;
export function stageGround(el: Element, dark: boolean): [number, number, number] {
  const fallback = dark ? 5 / 255 : 250 / 255;
  const value = getComputedStyle(el).getPropertyValue("--stage").trim();
  probe ??= document.createElement("canvas").getContext("2d");
  if (!value || !probe) return [fallback, fallback, fallback];
  // The 2D canvas reads any CSS colour back as #rrggbb.
  probe.fillStyle = "#000"; probe.fillStyle = value;
  const hex = String(probe.fillStyle);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [fallback, fallback, fallback];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
