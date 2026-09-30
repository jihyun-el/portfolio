import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const content = path.join(root, "content");
const profile = JSON.parse(fs.readFileSync(path.join(content, "profile.json"), "utf8"));
const projects = JSON.parse(fs.readFileSync(path.join(content, "projects.json"), "utf8"));
if (!profile.name || !profile.headline || !Array.isArray(profile.links)) throw new Error("Profile fields are missing");
for (const link of profile.links) {
  if (!/^(https:\/\/|mailto:)/.test(link.url)) throw new Error(`Unsupported contact URL: ${link.url}`);
}
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
console.log(`Content valid: ${projects.length} projects. Only pages-site/content and pages-site/public feed the site.`);
