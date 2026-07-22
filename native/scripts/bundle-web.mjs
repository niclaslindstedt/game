// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the website and packs its `dist/` output into a single asset —
// `native/assets/webroot.zip` — that the native shell bundles, unzips on first
// launch, and serves over a local HTTP server (see src/localServer.ts). This
// is what makes the app self-contained: the game runs entirely on-device,
// offline, and updates only when a new build ships to the store.
//
// The website build itself is untouched — a plain `vite build` (base `/`, the
// default), which is exactly what a localhost origin wants. We only zip its
// output; no website source or config is changed for the app.
//
// Usage:
//   node scripts/bundle-web.mjs            # build the site, then zip dist/
//   node scripts/bundle-web.mjs --skip-build   # re-zip an existing dist/
//
// The zip is a build artifact (gitignored). Generate it before `eas build`
// (the App Build workflow and the `bundle` npm script do this for you); a
// `.easignore` keeps it in the EAS upload despite the .gitignore entry.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const WEBSITE_DIR = join(REPO_DIR, "pwa");
const DIST_DIR = join(WEBSITE_DIR, "dist");
const OUT_ZIP = join(APP_DIR, "assets", "webroot.zip");

const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  console.log("• building website (npm run build --workspace pwa)…");
  // Run from the repo root so the workspace + engine build resolve. Inherits
  // stdio so the vite/asset output streams through. GITHUB_PAT (for the
  // oss-framework package) must already be in the env if a fresh install is
  // needed — a warm node_modules needs no token.
  execFileSync("npm", ["run", "build", "--workspace", "pwa"], {
    cwd: REPO_DIR,
    stdio: "inherit",
  });
}

// Recursively collect dist/ into the flat { "index.html": bytes, ... } shape
// fflate wants, with forward-slash paths relative to dist root.
function collect(dir, files = {}) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      collect(abs, files);
    } else {
      const rel = relative(DIST_DIR, abs).split("\\").join("/");
      files[rel] = new Uint8Array(readFileSync(abs));
    }
  }
  return files;
}

let files;
try {
  files = collect(DIST_DIR);
} catch (err) {
  console.error(
    `\n✗ could not read ${DIST_DIR} — build the website first ` +
      `(drop --skip-build), or run 'npm run build --workspace pwa'.\n`,
  );
  throw err;
}

const count = Object.keys(files).length;
if (count === 0 || !files["index.html"]) {
  throw new Error(
    `dist/ has no index.html (${count} files) — the website build looks empty.`,
  );
}

// Deterministic zip: pin every entry to the ZIP epoch (1980-01-01) so the
// artifact is reproducible and doesn't drift by build time.
const EPOCH = new Date("1980-01-01T00:00:00Z");
const zipped = zipSync(files, { mtime: EPOCH });
writeFileSync(OUT_ZIP, zipped);

const kb = (zipped.length / 1024).toFixed(0);
console.log(`✓ wrote ${OUT_ZIP} — ${count} files, ${kb} KB`);
