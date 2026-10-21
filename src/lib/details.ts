import fs from "node:fs";
import path from "node:path";

// A project detail: one JSON per detail in content/details. Each is a short scope, then decision cards (read by date
// where dates are on record, inside their units where there are units), then how the whole was verified, what would
// change next time, and where to read further. A card has a line for its place in the structure and one for its date. `sources` are opaque review IDs; the paths they stand for are kept outside the public tree and are
// never read here.
export type DetailDate = { from: string; to: string; precision: "day" | "month" };
export type DetailLink = { label: string; href: string; purpose: string };
export type DetailMetric = { id: string; label: string; values: { label: string; value: number | string; unit: string }[]; method: string; scope: string };
export type DetailAlternative = { approach: string; reason: string; disposition: "tested-rejected" | "considered-rejected" };
export type DetailCard = {
  id: string; step: string; stepName: string; structurePlacement: "before" | "step" | "after"; structureOrder: number; developmentTieOrder: number;
  date: DetailDate | null; lead: { structure: string; development: string | null };
  problem: string; cause: string; decision: string; alternatives: DetailAlternative[];
  result: { summary: string; atDecision: string | null; current: string | null; metricIds: string[] };
  borrowed: { summary: string; links: DetailLink[] } | null; links: DetailLink[]; relatedDetails?: string[];
  // A decision the rest of the detail hangs on. Where any card is one, the others are shown as a line each.
  core?: boolean;
  // A rule every step is built under. It belongs to no step, is read in full, and is named apart from the core cards.
  principle?: boolean;
};
export type DetailStepLink = { step: string; stepName: string; entryCardId: string | null; sectionAnchor: string | null };
// What was done, as the reader takes it in at once: a few units, each a line of what was done and a number before
// and after. Opened, a unit shows the way it went (constraint, problem, experiment, evaluation, improvement) and then
// the cards it holds. Every card is in one unit, and every home step with cards is in the unit its link opens.
// A unit with no number on record before and after has `metric` null. A unit that tested a hypothesis carries its
// verdict; 반증 is a judgment a later step disproved.
export type DetailUnit = {
  id: string; label: "core" | "principle" | null; verdict?: "채택" | "기각" | "반증" | null; title: string;
  metric: { label: string; before: string; after: string; note: string | null } | null;
  arc: { constraint: string; problem: string; design: string; evaluation: string; improvement: string };
  steps: string[]; cards: string[];
};
export type Detail = {
  id: string; projectId: string; title: string; sentence: string; period: string;
  scope: { direct: string[]; team: string[]; borrowed: string[] }; stack: { technology: string; use: string }[];
  metrics: DetailMetric[]; steps: DetailStepLink[]; cards: DetailCard[];
  validation: { id: string; lead: string; body: string; metricIds: string[] }[];
  reflection: { id: string; step: string; stepName: string; lead: string; body: string }[];
  links: DetailLink[]; units?: DetailUnit[];
  // The results the detail leads with, under its scope: up to three units of work, each read by its number before and
  // after and what was measured, so the condition is never further than the number.
  highlights?: string[];
};

const directory = path.join(process.cwd(), "content", "details");

export function getDetail(id: string): Detail {
  return JSON.parse(fs.readFileSync(path.join(directory, `${id}.json`), "utf8"));
}

const compare = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
// By home step: what the parts rest on first, then each step, then what joined the parts; inside a step, the order
// the detail gives.
const place = (card: DetailCard) => (card.structurePlacement === "before" ? -1 : card.structurePlacement === "after" ? 1000 : Number(card.step));
export const structureOrder = (detail: Detail) => [...detail.cards].sort((a, b) => place(a) - place(b) || a.structureOrder - b.structureOrder).map((card) => card.id);
// By date: only the cards whose date is on record, from the earliest start. A month sorts before its own days.
export const developmentOrder = (detail: Detail) => detail.cards.filter((card) => card.date)
  .sort((a, b) => compare(a.date!.from, b.date!.from) || compare(a.date!.to, b.date!.to) || a.developmentTieOrder - b.developmentTieOrder || compare(a.id, b.id)).map((card) => card.id);
