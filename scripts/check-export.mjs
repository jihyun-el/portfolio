import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeBasePath } from "./paths.mjs";

const root = path.resolve(import.meta.dirname, "../out");
const base = normalizeBasePath(process.env.PAGES_BASE_PATH || "");
let pages = 0;
let references = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { visit(filename); continue; }
    if (!entry.name.endsWith(".html")) continue;
    pages++;
    const html = fs.readFileSync(filename, "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      if (!url.startsWith("/") || url.startsWith("//")) continue;
      assert.ok(!base || url === base || url.startsWith(`${base}/`), `Link outside Pages base: ${url}`);
      const relative = decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]);
      let target = path.resolve(root, `.${relative}`);
      assert.ok(target === root || target.startsWith(root + path.sep), `Link outside export: ${url}`);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
      assert.ok(fs.existsSync(target), `Missing exported link/asset: ${url} in ${filename}`);
      references++;
    }
  }
}
visit(root);
assert.ok(pages > 0, "No exported pages");
console.log(`Export valid: ${pages} HTML pages, ${references} local link/asset references (${base || "/"}).`);
