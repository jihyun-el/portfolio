import fs from "node:fs";
import path from "node:path";
import { withBasePath } from "../../scripts/paths.mjs";

export type Profile = {
  name: string;
  subtitle: string;
  role: string;
  headline: string;
  heroLines: string[];
  introduction: string[];
  card: { label: string; value: string }[];
  stats: string[];
  experiences: { title: string; period: string; description: string }[];
  links: { label: string; url: string }[];
};

export type Project = {
  id: string;
  short: string;
  title: string;
  period: string;
  role: string;
  summary: string;
  outcome: string;
  skills: string[];
  defaultOpen: boolean;
  links?: { label: string; url: string }[];
  parts?: { id: string; title: string; description: string }[];
};

export type Writing = { slug: string; title: string; excerpt: string; body: string; onHome: boolean };
export type Language = { name: string; description: string; projectId: string; part?: string };
export type Technology = Language & { language: string; mode?: string };
export type StackGroup = { title: string; short: string; items: Technology[] };
export type Stack = { languages: Language[]; groups: StackGroup[] };
export type Milestone = { sha: string; date: string; title: string; description: string };
export type HistoryRepository = { id: string; projectId: string; title: string; branch: string; scopeNote: string; snapshot: string; commits: number; authorCommits: number; firstDate: string; lastDate: string; months: { month: string; count: number }[]; milestones: Milestone[] };
export type History = { author: string; method: string; months: string[]; repositories: HistoryRepository[] };
export type Metrics = { engine: { frontendBeforeMs: number; frontendAfterMs: number; computeMs: number; budgetMs: number; controlTicks: number; note: string }; vqa: { matrix: { size: string; pixels: number; score: number }[]; stages: { label: string; score: number }[]; extraInference: { total: number; uncertain: number }; leaderboard: { rank: number; teams: number; private: { seoul: number; overall: number } }; note: string }; app: { platforms: string[] }; pipeline: { batchSongs: number; defaultedSongs: number; note: string } };
export type Case = { id: string; projectId: string; part?: string; repo: string; title?: string; short: string; line: string; sub?: string; problem: string; approach: string; metrics: string[]; compare?: string; more?: { label: string; href: string }; scope: { claim: string; limit: string } };
export type ContractStage = { id: string; owner: "app" | "engine"; name: string; rate: string; handoff?: { direction: "to-engine" | "to-app" | "both"; label: string }; input: string; output: string; rule: string };
export type BodyWindow = { channels: number; mixChannels: number; referenceChannels: number; bins: number; columns: number; hopMs: number; blockMs: number; receptiveField: number; lookahead: number; outputSlots: number[] };
export type Contracts = { engine: { lanes: { app: string; engine: string }; stages: ContractStage[]; threadRules: { subject: string; rule: string }[]; window: BodyWindow; note: string } };
const directory = path.join(process.cwd(), "content");

export const profile: Profile = JSON.parse(fs.readFileSync(path.join(directory, "profile.json"), "utf8"));
export const projects: Project[] = JSON.parse(fs.readFileSync(path.join(directory, "projects.json"), "utf8"));
export const stack: Stack = JSON.parse(fs.readFileSync(path.join(directory, "stack.json"), "utf8"));
export const history: History = JSON.parse(fs.readFileSync(path.join(directory, "history.json"), "utf8"));
export const metrics: Metrics = JSON.parse(fs.readFileSync(path.join(directory, "metrics.json"), "utf8"));
export const cases: Case[] = JSON.parse(fs.readFileSync(path.join(directory, "cases.json"), "utf8"));
export const contracts: Contracts = JSON.parse(fs.readFileSync(path.join(directory, "contracts.json"), "utf8"));

export function sitePath(pathname: string) {
  return withBasePath(process.env.PAGES_BASE_PATH || "", pathname);
}

export function getWriting(): Writing[] {
  return fs.readdirSync(path.join(directory, "writing"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const slug = name.slice(0, -3);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`Use lowercase ASCII writing filenames: ${name}`);
      }
      const markdown = fs.readFileSync(path.join(directory, "writing", name), "utf8");
      const heading = markdown.match(/^# (.+)\r?\n/);
      if (!heading) throw new Error(`${name}: add a # title on the first line`);
      // `<!-- home: hidden -->` keeps a post off the home list; its own page still exists.
      const hidden = /<!--\s*home:\s*hidden\s*-->/;
      const body = markdown.slice(heading[0].length).replace(hidden, "").trim();
      const excerpt = body.split(/\r?\n\r?\n/)[0].replace(/[*`]/g, "");
      return { slug, title: heading[1], excerpt, body, onHome: !hidden.test(markdown) };
    });
}

export function getProjectBody(id: string) {
  if (!projects.some((project) => project.id === id)) throw new Error(`Unknown project: ${id}`);
  return fs.readFileSync(path.join(directory, "projects", `${id}.md`), "utf8");
}

export function getProjectPartBody(id: string, part: string) {
  const project = projects.find((item) => item.id === id);
  if (!project?.parts?.some((item) => item.id === part)) throw new Error(`Unknown project part: ${id}/${part}`);
  return fs.readFileSync(path.join(directory, "projects", `${id}-${part}.md`), "utf8");
}

export function getSiteUrl() {
  const configured = process.env.PAGES_SITE_URL;
  if (!configured) return null;
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("PAGES_SITE_URL must be an HTTP URL");
  return url.href.replace(/\/$/, "");
}
