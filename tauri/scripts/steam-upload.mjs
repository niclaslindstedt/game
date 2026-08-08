#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Upload this tree's packaged build to a Steam depot.
//
//   node scripts/steam-upload.mjs --platform windows            # check + upload
//   node scripts/steam-upload.mjs --platform macos --dry-run    # check + print, no upload
//   node scripts/steam-upload.mjs --platform linux --branch beta
//
// The peer of `electron/scripts/steam-upload.mjs`, and it shares that tree's
// pure half verbatim (`steam-vdf.mjs`: the escaping, the id validation, the
// "is this actually a store build" test). Sharing rather than copying is the
// point — a depot uploaded with a mis-escaped content root uploads nothing at
// all, and two copies of that escaping is two chances to get it wrong.
//
// ONE DIFFERENCE FROM THE PEER, and it is the packager's rather than a
// judgement: this tree's `package.mjs` produces ONE depot directory, on the
// platform it was built on, at `release/depot`. There is no per-platform
// output directory to choose between because there is no cross-compiling
// bundler here — `--platform` therefore says which DEPOT ID to upload to and
// which redistributable to insist on, not where to look.
//
// The upload itself is one steamcmd invocation. Everything else here is the
// CHECKS, and they are the point: every one guards a failure that is silent or
// expensive at this stage of a release.
//
//   • the app id is real, not Valve's shared Spacewar test app
//   • the depot id for this platform exists
//   • the depot directory is there and holds an executable
//   • Valve's redistributable landed beside that executable — miss it and the
//     game ships, launches, and simply has no Steam (the handshake degrades
//     rather than crashing), so nobody notices until players report missing saves
//   • the embedded website was built for the STORE, not with the developer menu
//     still in it — invisible until someone taps the sun seven times
//
// Credentials are never read from a file here. steamcmd manages its own login
// session (`steamcmd +login <user>` once, interactively, answers Steam Guard
// and caches it), which is both the documented path and the one that keeps a
// password out of this repo's reach entirely.

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAppVdf,
  looksLikeDeveloperBuild,
  PLATFORM_DIRS,
  validateIds,
} from "../../electron/scripts/steam-vdf.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const platform = flag("platform", "");
const branch = flag("branch", "");
const dryRun = has("dry-run");

if (!Object.hasOwn(PLATFORM_DIRS, platform)) {
  fail(
    `--platform must be one of ${Object.keys(PLATFORM_DIRS).join(", ")}` +
      (platform ? ` (got "${platform}")` : ""),
  );
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const problems = [];

// THE SAME app and depot ids as the other wrapper, deliberately: this is the
// same product on the same store, and a second ids file would be a second thing
// to fill in and a second thing to get wrong.
const configPath = join(repoRoot, "electron", "store", "steam.json");
let config = {};
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  fail(`could not read ${rel(configPath)} — it holds the app and depot ids.`);
}
// Env overrides exist so CI can inject ids without committing them.
if (process.env.GIS_STEAM_APP_ID) {
  config.appId = Number(process.env.GIS_STEAM_APP_ID);
}
const depotEnv = process.env[`GIS_STEAM_DEPOT_${platform.toUpperCase()}`];
if (depotEnv) {
  config.depots = { ...config.depots, [platform]: Number(depotEnv) };
}
problems.push(...validateIds(config, platform));

const contentRoot = join(appDir, "release", "depot");
if (!existsSync(contentRoot)) {
  problems.push(
    `no packaged build at ${rel(contentRoot)} — run ` +
      "`make desktop-tauri-steam` first (NOT `--profile standalone`, which " +
      "produces installers for a download rather than a depot).",
  );
} else {
  problems.push(...checkPayload(contentRoot));
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) before uploading:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error("");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The upload
// ---------------------------------------------------------------------------

const outputDir = join(appDir, "release", "steam-build");
mkdirSync(outputDir, { recursive: true });

const version = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).version;

const vdf = buildAppVdf({
  appId: config.appId,
  depotId: config.depots[platform],
  contentRoot,
  outputDir,
  description: `Ada's Trail ${version} (${platform})`,
  branch,
});
const vdfPath = join(outputDir, `app_build_${platform}.vdf`);
writeFileSync(vdfPath, vdf, "utf8");

console.log(
  `app ${config.appId} · depot ${config.depots[platform]} · ${platform}`,
);
console.log(`content  ${rel(contentRoot)}`);
console.log(`script   ${rel(vdfPath)}`);
console.log(
  branch
    ? `branch   ${branch} (will be SET LIVE)`
    : "branch   none — the build uploads but goes live only when you say so " +
        "in the partner site",
);

if (dryRun) {
  console.log("\n--dry-run: not uploading. The script above is ready for:");
  console.log(`  steamcmd +login <user> +run_app_build "${vdfPath}" +quit\n`);
  process.exit(0);
}

const user = process.env.STEAM_USER;
if (!user) {
  fail(
    "STEAM_USER is not set. Log steamcmd in once interactively first " +
      "(`steamcmd +login <user>` — answer Steam Guard), then export STEAM_USER.",
  );
}
if (!which("steamcmd")) {
  fail(
    "steamcmd is not on PATH — install it from " +
      "https://partner.steamgames.com/doc/sdk/uploading (it ships in the " +
      "Steamworks SDK under tools/ContentBuilder).",
  );
}

console.log("\nuploading…\n");
const result = spawnSync(
  "steamcmd",
  ["+login", user, "+run_app_build", vdfPath, "+quit"],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  fail(
    `steamcmd exited ${result.status}. A first run often fails on Steam Guard — ` +
      `run \`steamcmd +login ${user}\` on its own, answer the prompt, then retry.`,
  );
}
console.log(
  "\n✓ uploaded. Set the build live in the partner site: " +
    `App Admin → Builds (app ${config.appId}).`,
);

// ---------------------------------------------------------------------------

/** Checks that need the depot directory to exist. */
function checkPayload(root) {
  const found = [];

  // Valve's redistributable, beside the executable. Its absence is the quiet
  // one: the handshake degrades to "no client", so the game ships and plays and
  // simply has no cloud saves or achievements for anybody.
  const redists = {
    windows: "steam_api64.dll",
    macos: "libsteam_api.dylib",
    linux: "libsteam_api.so",
  };
  const redist = redists[platform];
  if (!containsFile(root, redist)) {
    found.push(
      `${redist} is not in ${rel(root)} — Steam Cloud and achievements would ` +
        "be silently dead in this build. `src-tauri/build.rs` puts it beside " +
        "the binary and `scripts/package.mjs` copies it into the depot; a " +
        "missing one means the build was made for a different target.",
    );
  }

  // The bundled game itself. On macOS the whole app is inside the .app; on the
  // other two the executable and `webroot/` sit at the top of the depot.
  if (!containsFile(root, "index.html")) {
    found.push(
      `no bundled website in ${rel(root)} — the depot would install a shell ` +
        "with nothing to show.",
    );
  }

  // The embedded website, built for the store or not.
  const assets = findAssetsDir(root);
  if (assets && looksLikeDeveloperBuild(readdirSync(assets))) {
    found.push(
      "the embedded website still has the DEVELOPER tooling in it (the hidden " +
        "sun-tap reveal, the developer menu, the arsenal and effects " +
        "galleries). Rebuild with `make desktop-tauri-steam`, which uses the " +
        "production profile.",
    );
  }
  return found;
}

/**
 * The built site's `assets/` directory, wherever this platform's depot put it.
 *
 * Searched rather than spelled out, because the layout genuinely differs: macOS
 * buries the whole thing in `Adas Trail.app/Contents/Resources/`, and the other
 * two keep `webroot/` at the top of the depot.
 */
function findAssetsDir(root) {
  const stack = [root];
  let budget = 4000;
  while (stack.length > 0 && budget-- > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (entry.name === "assets" && dir.endsWith("webroot")) return path;
      stack.push(path);
    }
  }
  return null;
}

/** Is `name` anywhere in this tree? Shallow-first, since the redistributable
 * sits beside the executable rather than buried. */
function containsFile(root, name) {
  const stack = [root];
  let budget = 4000;
  while (stack.length > 0 && budget-- > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === name) return true;
      if (entry.isDirectory()) stack.push(join(dir, entry.name));
    }
  }
  return false;
}

function which(command) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function rel(path) {
  return relative(repoRoot, path);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
