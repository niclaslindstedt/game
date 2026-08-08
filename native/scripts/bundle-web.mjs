// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the website and packs its `dist/` output into a single asset —
// `native/assets/webroot.zip` — that the native shell bundles, unzips on first
// launch, and serves over a local HTTP server (see src/local-server.ts). This
// is what makes the app self-contained: the game runs entirely on-device,
// offline, and updates only when a new build ships to the store.
//
// The website build is a plain `vite build` (base `/`, the default), which is
// exactly what a localhost origin wants; we only zip its output, and no website
// source is changed for the app. TWO env vars change the build itself.
//
// VITE_DEV_TOOLS follows the EAS PROFILE: the `production` profile — the build
// uploaded to the App Store / Play Store — builds with it off, which strips the
// hidden sun-tap reveal, the whole DEVELOPER menu tree, and the commit hash in
// the title footer (see pwa/vite.config.ts). Every other profile keeps them, so
// a TestFlight or internal build behaves exactly like the website.
//
// VITE_SHELL_BUILD is set on EVERY profile, because it is about the medium
// rather than the audience: it drops the prerendered SEO boot shell from
// `index.html` (`stripBootShell` in pwa/pwa-plugin.ts). Nothing crawls a zipped
// webroot, JavaScript is never off in here, and the site is served off local
// disk — so all that markup did was flash an SEO document between the native
// splash lifting and the game's own studio card.
//
// BOTH ARE BUILD-TIME, so `--skip-build` re-zips whatever the last build left
// in `pwa/dist/` — a webroot re-zipped from a plain website build carries the
// boot shell and the developer tooling. Every release path builds.
//
// Usage:
//   node scripts/bundle-web.mjs            # build the site, then zip dist/
//   node scripts/bundle-web.mjs --skip-build   # re-zip an existing dist/
//   node scripts/bundle-web.mjs --profile production   # strip developer tooling
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
const WINDOWS = process.platform === "win32";
const NPM_COMMAND = WINDOWS ? "npm.cmd" : "npm";

const skipBuild = process.argv.includes("--skip-build");

// Which EAS profile this bundle is for (native/eas.json). Only `production`
// means "uploaded to the store as the shipping app"; `testflight` is store-
// signed but still a build we test with, so it keeps the developer tooling.
// EAS_BUILD_PROFILE is set inside an EAS build; the flag is what the local
// scripts and the workflow pass, since this step runs BEFORE `eas build`.
const profileArg = process.argv.indexOf("--profile");
const profile =
  (profileArg >= 0 ? process.argv[profileArg + 1] : undefined) ??
  process.env.EAS_BUILD_PROFILE ??
  "preview";
const devTools = profile !== "production";

if (!skipBuild) {
  console.log(
    `• building website (npm run build --workspace pwa) — profile ${profile}, ` +
      `developer tooling ${devTools ? "on" : "OFF"}…`,
  );
  // Run from the repo root so the workspace + engine build resolve. Inherits
  // stdio so the vite/asset output streams through.
  execFileSync(NPM_COMMAND, ["run", "build", "--workspace", "pwa"], {
    cwd: REPO_DIR,
    stdio: "inherit",
    // Windows command shims are batch files, which Node cannot execute
    // directly (EINVAL); cmd.exe must interpret them.
    shell: WINDOWS,
    // VITE_SHELL_BUILD is unconditional, on every profile: this is a
    // compiled build, so the prerendered SEO boot shell has nothing to be
    // read by and only flashes on the way to the game (see `stripBootShell`
    // in pwa/pwa-plugin.ts). The developer tooling beside it is profile-led,
    // because a preview build wants to behave exactly like the website.
    env: {
      ...process.env,
      VITE_DEV_TOOLS: devTools ? "on" : "off",
      VITE_SHELL_BUILD: "on",
    },
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
