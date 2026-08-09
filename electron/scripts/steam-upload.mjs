#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Upload a packaged build to a Steam depot.
//
//   node scripts/steam-upload.mjs --platform windows            # check + upload
//   node scripts/steam-upload.mjs --platform macos --dry-run    # check + print, no upload
//   node scripts/steam-upload.mjs --platform linux --branch beta
//
// The upload itself is one steamcmd invocation. Everything else here is the
// CHECKS, and they are the point: every one of them guards a failure that is
// silent or expensive at this stage of a release.
//
//   • the app id is real, not Valve's shared Spacewar test app
//   • the depot id for this platform exists
//   • the build directory is actually there and holds an executable
//   • Valve's redistributable landed beside that executable — miss it and the
//     game ships, launches, and simply has no Steam (steam.ts degrades rather
//     than crashing), so nobody notices until players report missing saves
//   • the embedded website was built for the STORE, not with the developer
//     menu still in it — invisible until someone taps the sun sixteen times
//     and wins the click race that arms
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAppVdf,
  looksLikeDeveloperBuild,
  PLATFORM_DIRS,
  validateIds,
} from "./steam-vdf.mjs";

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

const configPath = join(appDir, "store", "steam.json");
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

const contentRoot = join(appDir, "release", PLATFORM_DIRS[platform]);
if (!existsSync(contentRoot)) {
  problems.push(
    `no packaged build at ${rel(contentRoot)} — run \`npm run release:${short(platform)}\` first ` +
      "(NOT `npm run dist:*`, which leaves the developer tooling in).",
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

/** Checks that need the packaged directory to exist. */
function checkPayload(root) {
  const found = [];

  // Valve's redistributable, beside the executable. Its absence is the quiet
  // one: steam.ts degrades to "no client", so the game ships and plays and
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
        "be silently dead in this build. Check `extraFiles` in " +
        "electron-builder.config.cjs.",
    );
  }

  // The embedded website, built for the store or not.
  const assets = join(root, ...webrootAssetsPath());
  if (existsSync(assets)) {
    if (looksLikeDeveloperBuild(readdirSync(assets))) {
      found.push(
        "the embedded website still has the DEVELOPER tooling in it (the " +
          "hidden sun-tap reveal, the developer menu, the arsenal and effects " +
          `galleries). Rebuild with \`npm run release:${short(platform)}\`.`,
      );
    }
  }
  return found;
}

/** Where the built site's assets sit inside a packaged app. macOS buries the
 * whole app in a .app bundle; the others keep resources at the top. */
function webrootAssetsPath() {
  return platform === "macos"
    ? [
        "Ada's Trail.app",
        "Contents",
        "Resources",
        "app.asar.unpacked",
        "webroot",
        "assets",
      ]
    : ["resources", "app.asar.unpacked", "webroot", "assets"];
}

/** Is `name` anywhere in this tree? Shallow-first, since the redistributable
 * sits beside the executable rather than buried. */
function containsFile(root, name) {
  const stack = [root];
  let budget = 4000; // a packaged Electron app is large; don't walk it forever
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

function short(name) {
  return { windows: "win", macos: "mac", linux: "linux" }[name] ?? name;
}

function rel(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
