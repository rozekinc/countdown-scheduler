#!/usr/bin/env node
// Appends a content-hash query string to the built JS/CSS references in an
// HTML file. Without this, a browser that already cached an old build can
// keep using a stale assets/main.js alongside a fresh index.html (or vice
// versa) after a plain refresh -- mismatched pairs can crash in confusing
// ways (an element the old JS expects no longer existing, etc).
//
// Usage: node cachebust.mjs <html-file> <asset-file...>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [, , htmlPath, ...assetPaths] = process.argv;
if (!htmlPath || assetPaths.length === 0) {
  console.error("usage: cachebust.mjs <html-file> <asset-file...>");
  process.exit(1);
}

const hash = createHash("sha1");
for (const p of assetPaths) hash.update(readFileSync(p));
const short = hash.digest("hex").slice(0, 10);

let html = readFileSync(htmlPath, "utf8");
for (const assetPath of assetPaths) {
  const base = assetPath.split("/").pop();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})(\\?v=[a-f0-9]+)?"`, "g");
  html = html.replace(re, `$1?v=${short}"`);
}
writeFileSync(htmlPath, html);
console.log(`cachebust: ${htmlPath} -> v=${short}`);
