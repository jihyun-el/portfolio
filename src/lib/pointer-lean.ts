// The pointer's place on the window, -1 to 1 each way, eased toward where it is, for the 3D cameras to lean after
// (src/components/signal-chain-3d.tsx, src/components/model-3d.tsx). Touch moves nothing. Every picture asks once a
// frame; a second ask in the same frame gets the same answer.
const aim = { x: 0, y: 0 }, lean = { x: 0, y: 0 };
let listening = false, last = 0;
export function pointerLean(now: number) {
  if (!listening) {
    listening = true;
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      aim.x = event.clientX / window.innerWidth * 2 - 1; aim.y = event.clientY / window.innerHeight * 2 - 1;
    }, { passive: true });
  }
  const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0, k = 1 - Math.exp(-dt * 3.2);
  last = now; lean.x += (aim.x - lean.x) * k; lean.y += (aim.y - lean.y) * k;
  return lean;
}
