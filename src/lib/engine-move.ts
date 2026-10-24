// The camera moves the page asks of the engine's screen as it changes screen (src/components/project-browser.tsx →
// src/components/signal-chain-3d.tsx): "dive" into the third stage and "pull" out of it, for the pitch model; "land"
// the ring on an ellipse of the page and "lift" it off one, for the engine's loop in the app's structure picture; a
// lift holds on its ellipse until "release". The ellipse is its middle and half sizes in page pixels.
export type RingPlace = { cx: number; cy: number; rx: number; ry: number };
// How long each takes (ms). A land is done when the engine's screen says "landed" (its `data-move`).
export const MOVE_MS = { dive: 440, pull: 940, land: 600, lift: 810 };
export const askEngine = (kind: "dive" | "pull" | "land" | "lift" | "release", rect?: RingPlace) =>
  window.dispatchEvent(new CustomEvent("portfolio:engine-move", { detail: { kind, rect } }));
