import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const content = path.join(root, "content");
const profile = JSON.parse(fs.readFileSync(path.join(content, "profile.json"), "utf8"));
const projects = JSON.parse(fs.readFileSync(path.join(content, "projects.json"), "utf8"));
const stack = JSON.parse(fs.readFileSync(path.join(content, "stack.json"), "utf8"));
const history = JSON.parse(fs.readFileSync(path.join(content, "history.json"), "utf8"));
const metrics = JSON.parse(fs.readFileSync(path.join(content, "metrics.json"), "utf8"));
if (!profile.name || !profile.headline || !Array.isArray(profile.links)) throw new Error("Profile fields are missing");
for (const link of profile.links) {
  if (!/^(https:\/\/|mailto:)/.test(link.url)) throw new Error(`Unsupported contact URL: ${link.url}`);
}
const technologies = new Set();
for (const group of stack) {
  if (!group.title || !Array.isArray(group.items) || !group.items.length) throw new Error("Stack group is incomplete");
  for (const item of group.items) {
    const project = projects.find(project => project.id === item.projectId);
    if (!item.name || !item.description || technologies.has(item.name) || !project) throw new Error(`Invalid stack entry: ${item.name}`);
    if (item.part && !project.parts?.some(part => part.id === item.part)) throw new Error(`Invalid stack project part: ${item.name}`);
    technologies.add(item.name);
  }
}
const repositories = new Set();
for (const repo of history.repositories) {
  if (!projects.some(project => project.id === repo.projectId) || repositories.has(repo.id) || !/^[a-f0-9]{40}$/.test(repo.snapshot)) throw new Error(`Invalid history repository: ${repo.id}`);
  repositories.add(repo.id);
  if (!Number.isInteger(repo.authorCommits) || repo.authorCommits < 0 || repo.authorCommits > repo.commits) throw new Error(`Invalid commit count: ${repo.id}`);
  if (repo.months.length !== history.months.length || repo.months.some((item,i) => item.month !== history.months[i] || !Number.isInteger(item.count) || item.count < 0)) throw new Error(`Invalid history months: ${repo.id}`);
  if (repo.months.reduce((sum,item) => sum+item.count,0) !== repo.authorCommits) throw new Error(`Monthly commits do not match author total: ${repo.id}`);
  for (const milestone of repo.milestones) {
    if (!/^[a-f0-9]{40}$/.test(milestone.sha) || !/^\d{4}-\d{2}-\d{2}$/.test(milestone.date) || !milestone.title || !milestone.description) throw new Error(`Invalid milestone: ${repo.id}`);
    if (milestone.date < repo.firstDate || milestone.date > repo.lastDate) throw new Error(`Milestone outside snapshot dates: ${repo.id}`);
  }
}
for (const key of ["frontendBeforeMs", "frontendAfterMs", "computeMs", "budgetMs", "controlTicks"]) {
  if (!Number.isFinite(metrics.engine[key]) || metrics.engine[key] <= 0) throw new Error(`Invalid engine metric: ${key}`);
}
if (metrics.engine.computeMs > metrics.engine.budgetMs || metrics.engine.frontendAfterMs > metrics.engine.frontendBeforeMs) throw new Error("Engine chart ranges need review");
const matrixKeys = new Set(metrics.vqa.matrix.map(row => `${row.size}-${row.pixels}`));
if (metrics.vqa.matrix.length !== 4 || !["4B-512", "4B-768", "8B-512", "8B-768"].every(key => matrixKeys.has(key))) throw new Error("VQA matrix needs all four experiment conditions");
for (const row of [...metrics.vqa.matrix, ...metrics.vqa.stages]) {
  if (!Number.isFinite(row.score) || row.score < 0 || row.score > 1) throw new Error("VQA score is outside 0–1");
}
if (metrics.vqa.stages.length < 2) throw new Error("VQA progress needs a starting and final result");
const ids = new Set();
for (const project of projects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) || ids.has(project.id)) throw new Error(`Invalid or duplicate project ID: ${project.id}`);
  ids.add(project.id);
  for (const key of ["title", "period", "role", "summary", "outcome"]) {
    if (typeof project[key] !== "string" || !project[key].trim()) throw new Error(`${project.id}: missing ${key}`);
  }
  if (!Array.isArray(project.skills) || typeof project.defaultOpen !== "boolean") throw new Error(`${project.id}: invalid skills/defaultOpen`);
  if (!fs.existsSync(path.join(content, "projects", `${project.id}.md`))) throw new Error(`${project.id}: project Markdown missing`);
  const partIds = new Set();
  for (const part of project.parts || []) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part.id) || partIds.has(part.id)) throw new Error(`${project.id}: invalid or duplicate part`);
    partIds.add(part.id);
    if (!fs.existsSync(path.join(content, "projects", `${project.id}-${part.id}.md`))) throw new Error(`${project.id}: missing part Markdown ${part.id}`);
  }
}
for (const folder of ["projects", "writing"]) {
  for (const name of fs.readdirSync(path.join(content, folder))) {
    if (!name.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(content, folder, name), "utf8");
    if (folder === "writing" && !/^# .+\r?\n/.test(text)) throw new Error(`${name}: first line must be a # title`);
    if (/C:\\Users\\|\.\.\/reports\/|ssafy-16-2-ai\/|\[.*\]\([^)]*(?:INDEX\.md|REPORT_)/.test(text)) throw new Error(`${name}: internal archive reference in public content`);
  }
}
console.log(`Content valid: ${projects.length} projects, ${technologies.size} technologies, ${repositories.size} history snapshots.`);
