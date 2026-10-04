import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const content = path.join(root, "content");
const profile = JSON.parse(fs.readFileSync(path.join(content, "profile.json"), "utf8"));
const projects = JSON.parse(fs.readFileSync(path.join(content, "projects.json"), "utf8"));
const stack = JSON.parse(fs.readFileSync(path.join(content, "stack.json"), "utf8"));
const history = JSON.parse(fs.readFileSync(path.join(content, "history.json"), "utf8"));
const metrics = JSON.parse(fs.readFileSync(path.join(content, "metrics.json"), "utf8"));
if (!profile.name || !profile.role || !Array.isArray(profile.links)) throw new Error("Profile fields are missing");
for (const link of profile.links) {
  if (!/^(https:\/\/|mailto:)/.test(link.url)) throw new Error(`Unsupported contact URL: ${link.url}`);
}
// Every technology names the language it was used through; a unit's stack line lists languages first.
if (!Array.isArray(stack.languages) || !stack.languages.length || !Array.isArray(stack.groups) || !stack.groups.length) throw new Error("stack.json needs languages and groups");
const technologies = new Set(), languages = new Set(stack.languages.map(item => item.name));
const stackEntries = [...stack.languages, ...stack.groups.flatMap(group => group.items ?? [])];
for (const group of stack.groups) {
  if (!group.title || !["main", "sub", "tool"].includes(group.tier) || !Array.isArray(group.items) || !group.items.length) throw new Error(`Stack group is incomplete: ${group.title}`);
  for (const item of group.items) if (!languages.has(item.language)) throw new Error(`${item.name}: language must be one of ${[...languages].join(", ")}`);
}
for (const language of stack.languages) if (!stack.groups.some(group => group.title === language.group)) throw new Error(`${language.name}: group must be a stack group title`);
const brandIcons = JSON.parse(fs.readFileSync(path.join(root, "src/lib/brand-icons.json"), "utf8"));
for (const item of stackEntries) {
  if (item.icon && !brandIcons[item.icon]) throw new Error(`${item.name}: no logo named ${item.icon} in src/lib/brand-icons.json`);
  const project = projects.find(project => project.id === item.projectId);
  if (!item.name || !item.description || technologies.has(item.name) || !project) throw new Error(`Invalid stack entry: ${item.name}`);
  if (item.part && !project.parts?.some(part => part.id === item.part)) throw new Error(`Invalid stack project part: ${item.name}`);
  technologies.add(item.name);
}
const repositories = new Set();
for (const repo of history.repositories) {
  if (!projects.some(project => project.id === repo.projectId) || repositories.has(repo.id) || !/^[a-f0-9]{40}$/.test(repo.snapshot)) throw new Error(`Invalid history repository: ${repo.id}`);
  repositories.add(repo.id);
  if (!Number.isInteger(repo.authorCommits) || repo.authorCommits < 0 || repo.authorCommits > repo.commits) throw new Error(`Invalid commit count: ${repo.id}`);
  if (repo.months.length !== history.months.length || repo.months.some((item,i) => item.month !== history.months[i] || !Number.isInteger(item.count) || item.count < 0)) throw new Error(`Invalid history months: ${repo.id}`);
  if (repo.months.reduce((sum,item) => sum+item.count,0) !== repo.authorCommits) throw new Error(`Monthly commits do not match author total: ${repo.id}`);
  // A repository counted over several branches lists each one: its tip, and the commits it adds beyond the first.
  if (repo.branches) {
    if (repo.branches[0]?.snapshot !== repo.snapshot || repo.branches.some(branch => !branch.name || !/^[a-f0-9]{40}$/.test(branch.snapshot) || !Number.isInteger(branch.authorCommits) || branch.authorCommits > branch.commits)) throw new Error(`Invalid branch record: ${repo.id}`);
    if (repo.branches.reduce((sum,branch) => sum+branch.commits,0) !== repo.commits || repo.branches.reduce((sum,branch) => sum+branch.authorCommits,0) !== repo.authorCommits) throw new Error(`Branch commits do not add up: ${repo.id}`);
  }
  for (const milestone of repo.milestones) {
    if (!/^[a-f0-9]{40}$/.test(milestone.sha) || !/^\d{4}-\d{2}-\d{2}$/.test(milestone.date) || !milestone.title || !milestone.description) throw new Error(`Invalid milestone: ${repo.id}`);
    if (milestone.date < repo.firstDate || milestone.date > repo.lastDate) throw new Error(`Milestone outside snapshot dates: ${repo.id}`);
  }
}
for (const key of ["frontendBeforeMs", "frontendAfterMs", "computeMs", "budgetMs", "controlTicks"]) {
  if (!Number.isFinite(metrics.engine[key]) || metrics.engine[key] <= 0) throw new Error(`Invalid engine metric: ${key}`);
}
if (metrics.engine.computeMs > metrics.engine.budgetMs || metrics.engine.frontendAfterMs > metrics.engine.frontendBeforeMs) throw new Error("Engine chart ranges need review");
const contract = JSON.parse(fs.readFileSync(path.join(content, "contracts.json"), "utf8")).engine;
const stageIds = new Set();
for (const stage of contract.stages) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stage.id) || stageIds.has(stage.id) || !["app", "engine"].includes(stage.owner)) throw new Error(`Invalid contract stage: ${stage.id}`);
  for (const key of ["name", "rate", "input", "output", "rule"]) {
    if (typeof stage[key] !== "string" || !stage[key].trim()) throw new Error(`${stage.id}: missing contract ${key}`);
  }
  if ((stage.owner === "app") !== Boolean(stage.handoff)) throw new Error(`${stage.id}: app stages and only app stages cross the engine boundary`);
  if (stage.handoff && (!["to-engine", "to-app", "both"].includes(stage.handoff.direction) || !stage.handoff.label)) throw new Error(`${stage.id}: invalid handoff`);
  stageIds.add(stage.id);
}
if (contract.stages[0].handoff?.direction !== "to-engine" || contract.stages.at(-1).handoff?.direction !== "to-app") throw new Error("Block contract must enter and leave through the app");
const win = contract.window;
if (win.mixChannels + win.referenceChannels !== win.channels || win.receptiveField > win.columns || win.lookahead >= win.receptiveField) throw new Error("Body window dimensions are inconsistent");
if (win.outputSlots.some(slot => !Number.isInteger(slot) || slot - (win.receptiveField - 1 - win.lookahead) < 0 || slot + win.lookahead > win.columns - 1)) throw new Error("Output slot needs its full receptive field and lookahead inside the window");
if (win.blockMs % win.hopMs !== 0 || win.blockMs / win.hopMs !== win.outputSlots.length) throw new Error("Frames per block must equal output slots per inference");
if (!contract.stages.find(stage => stage.id === "body")?.handoff?.label.includes(`${win.channels}×${win.bins}×${win.columns}`)) throw new Error("Body handoff label must match the window shape");
// Keys the home page knows how to render from metrics.json; keep in sync with src/lib/showcase.ts.
const metricKeys = new Set(["frontend", "compute", "controlTicks", "publicScore", "leaderboard", "release", "missingData"]);
const cases = JSON.parse(fs.readFileSync(path.join(content, "cases.json"), "utf8"));
if (!Array.isArray(profile.heroLines) || !profile.heroLines.length || profile.heroLines.some(line => !line)) throw new Error("profile.heroLines lists the secondary fields shown under the role on the first screen");
if (!Array.isArray(profile.card) || profile.card.some(row => !row.label || !row.value)) throw new Error("Developer card rows need a label and value");
if (!Array.isArray(profile.stats) || profile.stats.length !== 3 || profile.stats.some(key => !metricKeys.has(key))) throw new Error("Home stats need three known metric keys");
for (const project of projects) if (!project.short) throw new Error(`${project.id}: missing short label`);
const caseIds = new Set();
for (const item of cases) {
  const project = projects.find(entry => entry.id === item.projectId);
  if (!/^[a-z0-9-]+$/.test(item.id) || caseIds.has(item.id) || !project) throw new Error(`Invalid case: ${item.id}`);
  if (item.part ? !project.parts?.some(part => part.id === item.part) : !item.title) throw new Error(`${item.id}: case needs a project part or its own title`);
  if (!history.repositories.some(repo => repo.id === item.repo && repo.projectId === item.projectId)) throw new Error(`${item.id}: unknown history repository`);
  if (!item.short) throw new Error(`${item.id}: missing short label`);
  if (item.stack && (!Array.isArray(item.stack) || !item.stack.length)) throw new Error(`${item.id}: stack must list at least one technology`);
  for (const hard of item.hardest ?? []) if (!hard.title || !hard.body) throw new Error(`${item.id}: a hardest item needs a title and a body`);
  for (const slug of item.troubles ?? []) if (!fs.existsSync(path.join(content, "writing", `${slug}.md`))) throw new Error(`${item.id}: unknown writing ${slug}`);
  if (!item.metrics.length || item.metrics.some(key => !metricKeys.has(key))) throw new Error(`${item.id}: unknown metric key`);
  if ((item.results ?? []).some(key => !item.metrics.includes(key))) throw new Error(`${item.id}: result numbers must be among its metrics`);
  // A unit's Markdown fills the card: an overview paragraph, then `## 라벨` sections whose first paragraph is the card line.
  const unitFile = path.join(content, "projects", `${item.projectId}${item.part ? `-${item.part}` : ""}.md`);
  const [overview, ...sections] = fs.readFileSync(unitFile, "utf8").replace(/\r\n/g, "\n").split(/^## /m);
  if (!overview.trim() || overview.trim().includes("\n\n") || !sections.length) throw new Error(`${item.id}: unit Markdown needs a one-paragraph overview, then ## sections`);
  const labels = new Set();
  for (const section of sections) {
    const label = section.slice(0, section.indexOf("\n")).trim();
    const line = section.slice(section.indexOf("\n") + 1).replace(/<!--\s*anchor:[^>]*-->/, "").trim().split(/\n\n+/)[0];
    if (!label || labels.has(label)) throw new Error(`${item.id}: unit sections need distinct labels`);
    if (!line || /^<!--|^\|/.test(line) || line.length > 160) throw new Error(`${item.id}: "${label}" must start with a card line of at most 160 characters`);
    labels.add(label);
  }
  caseIds.add(item.id);
}
for (const tech of stackEntries) {
  if (!cases.some(item => item.projectId === tech.projectId && item.part === tech.part)) throw new Error(`No case covers technology ${tech.name}`);
}
for (const key of profile.stats) if (!cases.some(item => item.metrics.includes(key))) throw new Error(`Home stat ${key} belongs to no case`);
const matrixKeys = new Set(metrics.vqa.matrix.map(row => `${row.size}-${row.pixels}`));
if (metrics.vqa.matrix.length !== 4 || !["4B-512", "4B-768", "8B-512", "8B-768"].every(key => matrixKeys.has(key))) throw new Error("VQA matrix needs all four experiment conditions");
for (const row of [...metrics.vqa.matrix, ...metrics.vqa.stages]) {
  if (!Number.isFinite(row.score) || row.score < 0 || row.score > 1) throw new Error("VQA score is outside 0–1");
}
if (metrics.vqa.stages.length < 2) throw new Error("VQA progress needs a starting and final result");
const board = metrics.vqa.leaderboard;
if ([board.rank, board.private?.overall, board.private?.seoul].some(rank => !Number.isInteger(rank) || rank < 1 || rank > board.teams) || !(board.private.score >= 0 && board.private.score <= 1)) throw new Error("VQA leaderboard ranks must be within the team count and the Private score within 0–1");
const ids = new Set();
for (const project of projects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) || ids.has(project.id)) throw new Error(`Invalid or duplicate project ID: ${project.id}`);
  ids.add(project.id);
  for (const key of ["title", "period", "role", "summary", "outcome"]) {
    if (typeof project[key] !== "string" || !project[key].trim()) throw new Error(`${project.id}: missing ${key}`);
  }
  if (!Array.isArray(project.skills) || typeof project.defaultOpen !== "boolean") throw new Error(`${project.id}: invalid skills/defaultOpen`);
  for (const link of project.links ?? []) if (!link.label || !/^https:\/\//.test(link.url)) throw new Error(`${project.id}: project links need a label and an https URL`);
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
