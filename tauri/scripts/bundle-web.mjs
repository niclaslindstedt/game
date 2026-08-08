// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the website and copies its `dist/` output into `tauri/webroot/`, which
// the desktop shell serves from a private scheme (`shell/src/webroot.rs`). This
// is what makes the app self-contained: the game runs entirely on-device,
// offline, and updates only when a new build ships.
//
// The peer of `electron/scripts/bundle-web.mjs`, and deliberately a peer rather
// than a shared module: the two shells are being compared against each other
// (see docs/desktop-shells.md), so each owns its own copy of the site and
// neither can leave the other holding a stale one. If Tauri ships and Electron
// is retired, one of these files goes away with it.
//
// The website build itself is untouched — a plain `vite build` with the default
// base `/`, which is exactly what a single-origin shell wants.
//
// The ONE thing the profile changes about the website build is the DEVELOPER
// tooling: the `production` profile — the build that would go to a store —
// builds with VITE_DEV_TOOLS=off, which strips the hidden sun-tap reveal, the
// whole DEVELOPER menu tree, and the commit hash in the title footer (see
// pwa/vite.config.ts). Every other profile keeps them, so a local or preview
// build behaves exactly like the website.
//
// Usage:
//   node scripts/bundle-web.mjs                      # build the site, then copy
//   node scripts/bundle-web.mjs --skip-build         # re-copy an existing dist/
//   node scripts/bundle-web.mjs --profile production # strip developer tooling

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const WEBSITE_DIR = join(REPO_DIR, "pwa");
const DIST_DIR = join(WEBSITE_DIR, "dist");
const OUT_DIR = join(APP_DIR, "webroot");
const WINDOWS = process.platform === "win32";
const NPM_COMMAND = WINDOWS ? "npm.cmd" : "npm";

const skipBuild = process.argv.includes("--skip-build");

const profileArg = process.argv.indexOf("--profile");
const profile =
  (profileArg >= 0 ? process.argv[profileArg + 1] : undefined) ??
  process.env.GIS_BUILD_PROFILE ??
  "preview";
const devTools = profile !== "production";

if (!skipBuild) {
  console.log(
    `• building website (npm run build --workspace pwa) — profile ${profile}, ` +
      `developer tooling ${devTools ? "on" : "OFF"}…`,
  );
  // Run from the repo root so the workspace + engine build resolve.
  execFileSync(NPM_COMMAND, ["run", "build", "--workspace", "pwa"], {
    cwd: REPO_DIR,
    stdio: "inherit",
    // Windows command shims are batch files, which Node cannot execute
    // directly (EINVAL); cmd.exe must interpret them.
    shell: WINDOWS,
    env: { ...process.env, VITE_DEV_TOOLS: devTools ? "on" : "off" },
  });
}

if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
  console.error(
    `✗ no website build at ${DIST_DIR}. Run without --skip-build, or build the site first.`,
  );
  process.exit(1);
}
if (!existsSync(join(DIST_DIR, "index.html"))) {
  console.error(`✗ ${DIST_DIR} has no index.html — that is not a site build.`);
  process.exit(1);
}

// Replace wholesale rather than merge: a stale chunk left behind from a
// previous build is the exact failure mode that shows up as a blank window
// (index.html referencing hashed files that no longer exist, or vice versa).
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(DIST_DIR, OUT_DIR, { recursive: true });

console.log(`✓ webroot → ${OUT_DIR}`);
