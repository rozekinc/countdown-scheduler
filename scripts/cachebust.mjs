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
import { execSync } from "node:child_process";

const [, , htmlPath, ...assetPaths] = process.argv;
if (!htmlPath || assetPaths.length === 0) {
  console.error("usage: cachebust.mjs <html-file> <asset-file...>");
  process.exit(1);
}

// Human-readable build version stamped into <meta name="app-build">, so every
// screen can show which code build it is running. Format: <pkg.version>+<sha>.
// The SHA comes from CI (GITHUB_SHA) or a local git checkout; "local" when
// neither is available (e.g. a tarball with no git). package.json is read from
// the cwd, which is the repo root for the display build and admin-src/ for the
// admin build -- both carry a matching "version".
function buildVersion() {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync("package.json", "utf8")).version ?? version;
  } catch {}
  let sha = process.env.GITHUB_SHA?.slice(0, 7);
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {}
  }
  return sha ? `${version}+${sha}` : `${version}+local`;
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

const build = buildVersion();
html = html.replace(
  /(<meta name="app-build" content=")[^"]*(")/,
  `$1${build}$2`,
);

writeFileSync(htmlPath, html);
console.log(`cachebust: ${htmlPath} -> v=${short} build=${build}`);
