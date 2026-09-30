import fs from "node:fs";
import path from "node:path";
import { withBasePath } from "../../scripts/paths.mjs";

export type Profile = {
  name: string;
  headline: string;
  introduction: string[];
  experiences: { title: string; period: string; description: string }[];
  links: { label: string; url: string }[];
};

export type Project = {
  id: string;
  title: string;
  period: string;
  role: string;
  summary: string;
  outcome: string;
  skills: string[];
  defaultOpen: boolean;
  parts?: { id: string; title: string; description: string }[];
};

export type Writing = { slug: string; title: string; excerpt: string; body: string };
export type StackGroup = { title: string; items: { name: string; description: string; projectId: string; part?: string; mode?: string }[] };
export type Milestone = { sha: string; date: string; title: string; description: string };
export type HistoryRepository = { id: string; projectId: string; title: string; branch: string; scopeNote: string; snapshot: string; commits: number; authorCommits: number; firstDate: string; lastDate: string; months: { month: string; count: number }[]; milestones: Milestone[] };
export type History = { author: string; method: string; months: string[]; repositories: HistoryRepository[] };
export type Metrics = { engine: { frontendBeforeMs: number; frontendAfterMs: number; computeMs: number; budgetMs: number; controlTicks: number; note: string }; vqa: { matrix: { size: string; pixels: number; score: number }[]; stages: { label: string; score: number }[]; extraInference: { total: number; uncertain: number }; note: string } };
const directory = path.join(process.cwd(), "content");

export const profile: Profile = JSON.parse(fs.readFileSync(path.join(directory, "profile.json"), "utf8"));
export const projects: Project[] = JSON.parse(fs.readFileSync(path.join(directory, "projects.json"), "utf8"));
export const stack: StackGroup[] = JSON.parse(fs.readFileSync(path.join(directory, "stack.json"), "utf8"));
export const history: History = JSON.parse(fs.readFileSync(path.join(directory, "history.json"), "utf8"));
export const metrics: Metrics = JSON.parse(fs.readFileSync(path.join(directory, "metrics.json"), "utf8"));

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
      const body = markdown.slice(heading[0].length).trim();
      const excerpt = body.split(/\r?\n\r?\n/)[0].replace(/[*`]/g, "");
      return { slug, title: heading[1], excerpt, body };
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
