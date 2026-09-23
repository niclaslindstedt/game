// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PACKAGING THE DESKTOP APP — a script rather than a config file because
// brand identity is centralized in `game.config.json` (AGENTS.md — "Never
// re-hardcode a brand string elsewhere"), the deployment's own name and
// identifier arrive as APP_DISPLAY_NAME / APP_BUNDLE_ID, the capability stamp
// comes out of the build environment, and none of them can be written into
// static JSON. `tauri.conf.json` holds everything that IS static;
// this script computes the rest and hands it over as a `--config` patch.
//
// **THE DEFAULT OUTPUT IS A DEPOT DIRECTORY, NOT AN INSTALLER, because Steam
// does not want one.** Steam distributes by uploading a DIRECTORY of files to a
// depot, and its own client owns installing, updating and launching them. An
// NSIS or DMG installer inside a depot would ask the player to install a game
// they already installed. The `standalone` profile is for a plain download
// instead, and there the platform's own bundle targets are exactly right.
//
// FIVE things travel beside the executable and every one is load-bearing:
//
//   webroot/            the built site. On macOS the bundler files it inside the
//                       .app as a resource; on Windows and Linux the depot is a
//                       bare executable, so it is copied next to it and found by
//                       `protocol::webroot_dir`'s resource-directory branch.
//   libsteam_api.*      Valve's redistributable. `src-tauri/build.rs` puts it in
//                       the target profile directory and gives the binary an
//                       rpath that looks beside itself; this script carries it
//                       into the depot. Without it the game starts and reports
//                       Steam unavailable — a wrong path shows up in the launch
//                       log rather than as a crash, because `steam.rs` degrades.
//   server/             the SESSION SERVER: the engine compiled for Node
//                       (scripts/build-server.mjs). Only in a build stamped with
//                       multiplayer.
//   modtools/           the MOD COMPILER and everything it reaches
//                       (scripts/modtools-manifest.cjs), plus the Lua VM it
//                       validates scripts with (scripts/build-lua.mjs). Only in
//                       a build stamped with mods.
//   runtime/node        A NODE RUNTIME, because both of the above are Node
//                       programs and a player has no reason to have one. It is
//                       the ONE place this shell is fatter than the promise
//                       Tauri makes — see `shell/src/runtime.rs` — and it is
//                       omitted entirely from a build that carries neither
//                       feature.
//
// Usage:
//   node scripts/package.mjs                       # a Steam depot directory
//   node scripts/package.mjs --profile standalone  # installers/archives instead
//   node scripts/package.mjs --target <triple>     # cross/explicit target
//   node scripts/package.mjs --skip-web            # reuse an existing webroot
//   node scripts/package.mjs --skip-server         # reuse an existing server-dist
//   node scripts/package.mjs --skip-lua            # reuse an existing Lua VM build
//   node scripts/package.mjs --require-identity    # a release: refuse the dev identity

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const TARGET_DIR = join(APP_DIR, "target");
const RELEASE_DIR = join(APP_DIR, "release");
/** Where the extra resources are staged before the bundler files them. */
const STAGE_DIR = join(APP_DIR, "resources");
const WINDOWS = process.platform === "win32";
const MACOS = process.platform === "darwin";
const NPM_COMMAND = WINDOWS ? "npm.cmd" : "npm";
const NODE_EXECUTABLE = WINDOWS ? "node.exe" : "node";
const require = createRequire(import.meta.url);

const identity = JSON.parse(
  readFileSync(join(REPO_DIR, "game.config.json"), "utf8"),
);
/** THE GAME's version, not the shell crate's. `tauri/src-tauri/Cargo.toml`
 * keeps its own number and
 * nothing updates it, so a download named after it would claim a version no
 * release ever had. */
const { version } = JSON.parse(
  readFileSync(join(REPO_DIR, "package.json"), "utf8"),
);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const profile = option("profile") ?? process.env.GIS_PACKAGE_PROFILE ?? "steam";
const standalone = profile === "standalone";
const target = option("target");

if (!["steam", "standalone"].includes(profile)) {
  fail(`unknown profile ${profile} — it is "steam" or "standalone"`);
}

// ---------------------------------------------------------------------------
// What the package is stamped with
// ---------------------------------------------------------------------------
//
// Five capabilities belong to the BUILD rather than to the machine that runs
// it. They are read from the build environment (`GIS_ENABLE_MULTIPLAYER=1` and
// friends, via the Makefile) and baked into the machine code by
// `src-tauri/src/stamp.rs`, so an installed copy has nothing to edit.
//
// A packaging run that did not deliberately stamp itself is refused outright
// rather than quietly shipping a developer build: the absence of the stamp is
// what marks a build as somebody's own tree, and a store upload that carried it
// would tell every player they were running a debugging tool.
if (process.env.GIS_STAMP_CAPABILITIES !== "1") {
  fail(
    "GIS_STAMP_CAPABILITIES=1 is required to package.\n" +
      "  Use `make desktop-steam` or `make desktop-dist`, which set " +
      "it along with the five capability switches.",
  );
}

// THE APP ID, which is BAKED IN rather than left to the environment the game is
// started in: `src-tauri/src/stamp.rs` reads it with `option_env!`, so an
// installed copy knows which app it is. Spacewar (480) is the development
// placeholder, and a build that still carries it is not a build anybody may
// ship — `steam.rs` refuses to ask Steam to relaunch such a process for exactly
// the same reason.
const SPACEWAR_APP_ID = "480";
const appId = process.env.GIS_STEAM_APP_ID ?? SPACEWAR_APP_ID;
if (appId === SPACEWAR_APP_ID && !flag("allow-placeholder")) {
  fail(
    "GIS_STEAM_APP_ID is still Valve's Spacewar test app (480).\n" +
      "  A store build must set the real app id. Pass --allow-placeholder to " +
      "package a test build anyway.",
  );
}

// THE DEPLOYMENT'S IDENTITY — the same two variables, under the same names, the
// phone build reads (native/app.config.js) and every app in the fleet uses.
// `tauri.conf.json` commits a development identifier; a store or download
// build merges the real one over it. The identifier is also where each
// desktop webview keeps its storage, so an installed copy's progress belongs
// to the identifier it shipped under — which is why it is fixed per deployment
// rather than derived. The display name is optional, as it is for the phone
// app: the game keeps one name everywhere, so it falls back to the committed
// `productName`.
const bundleId = process.env.APP_BUNDLE_ID?.trim() ?? "";
const displayName = process.env.APP_DISPLAY_NAME?.trim() ?? "";
if (flag("require-identity") && !bundleId) {
  fail(
    "APP_BUNDLE_ID is not set. A release package needs the deployment's " +
      "identifier rather than the development one — set it as a repository " +
      "secret. See tauri/RELEASING.md.",
  );
}
const tauriConf = JSON.parse(
  readFileSync(join(APP_DIR, "src-tauri", "tauri.conf.json"), "utf8"),
);
/** What the bundle is called — the name of the `.app` on macOS. */
const productName = displayName || tauriConf.productName;

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

if (!flag("skip-web")) {
  // `production` is what strips the developer tooling out of the embedded site
  // — the hidden sun-tap reveal, the DEVELOPER menu tree, the commit hash. It
  // is the ONLY correct profile for a store build.
  run("node", [
    join(APP_DIR, "scripts", "bundle-web.mjs"),
    "--profile",
    "production",
  ]);
}
run(NPM_COMMAND, ["run", "icons"], APP_DIR);

// ---------------------------------------------------------------------------
// The sidecars — staged BEFORE the bundler runs, because it files them
// ---------------------------------------------------------------------------
//
// Both are Node programs and both are optional: a build stamped with neither
// multiplayer nor mods carries no server, no toolchain and no runtime, which is
// the download the plain-download profile is for.

const WANTS_SESSIONS = process.env.GIS_ENABLE_MULTIPLAYER === "1";
const WANTS_MODS = process.env.GIS_ENABLE_MODS === "1";

rmSync(STAGE_DIR, { recursive: true, force: true });

if (WANTS_SESSIONS) {
  if (!flag("skip-server")) {
    // The ENGINE's Node ship target — one compiler and one server, so "the
    // dedicated server is the same file" stays true.
    run("node", [join(REPO_DIR, "scripts", "build-server.mjs")]);
  }
  const built = join(REPO_DIR, "server-dist");
  requireFile(join(built, "server", "main.js"), "the compiled session server");
  cpSync(built, join(STAGE_DIR, "server"), { recursive: true });
}

if (WANTS_MODS) {
  // ONE list — see `scripts/modtools-manifest.cjs`.
  for (const { from, to } of require(
    join(REPO_DIR, "scripts", "modtools-manifest.cjs"),
  )) {
    const source = join(REPO_DIR, from);
    requireFile(source, `the mod toolchain's ${from}`);
    cpSync(source, join(STAGE_DIR, to), { recursive: true });
  }
  // …plus the toolchain's own npm dependencies, declared ONCE in
  // `mod/package.json` and held to what the compiler actually imports by
  // `tests/content/mod_toolchain_deps_test.ts`.
  const deps = Object.keys(
    JSON.parse(readFileSync(join(REPO_DIR, "mod", "package.json"), "utf8"))
      .dependencies ?? {},
  );
  for (const dep of deps) {
    const source = join(REPO_DIR, "node_modules", dep);
    requireFile(source, `the mod toolchain's ${dep}`);
    cpSync(source, join(STAGE_DIR, "modtools", "node_modules", dep), {
      recursive: true,
    });
  }
  // THE LUA VM, compiled (scripts/build-lua.mjs). The script validator IS the
  // engine's own interpreter and the shipped toolchain runs under plain Node
  // with no TypeScript, so the compiled copy travels beside the toolchain that
  // imports it — at `modtools/lua-vm/`, which is where
  // `scripts/asset-tools/script-schema.mjs` looks for it in a package.
  if (!flag("skip-lua"))
    run("node", [join(REPO_DIR, "scripts", "build-lua.mjs")]);
  const lua = join(REPO_DIR, "modtools-lua");
  requireFile(join(lua, "lib", "lua", "index.js"), "the compiled Lua VM");
  cpSync(lua, join(STAGE_DIR, "modtools", "lua-vm"), { recursive: true });
  // The adapter the Rust shell reaches the compiler through.
  cpSync(
    join(APP_DIR, "scripts", "mod-compile.mjs"),
    join(STAGE_DIR, "modtools", "mod-compile.mjs"),
  );
}

if (WANTS_SESSIONS || WANTS_MODS) {
  // THE NODE RUNTIME, which is the one this packaging run is itself using —
  // so it is the version the server was compiled against, on the platform it
  // will run on, without a download step or a version to keep in step.
  const runtime = join(STAGE_DIR, "runtime", NODE_EXECUTABLE);
  mkdirSync(dirname(runtime), { recursive: true });
  cpSync(process.execPath, runtime);
  chmodSync(runtime, 0o755);
  // macOS refuses to EXECUTE an unsigned arm64 binary, and a nested one inside
  // a signed .app has to carry its own signature — the bundle's does not cover
  // it. Signed here, before the bundler runs, so whatever it does afterwards
  // the runtime is already valid. With a real Developer ID the notary service
  // also wants what an ad-hoc signature cannot carry: the hardened runtime and
  // a secure timestamp — and, because re-signing drops the entitlements Node
  // shipped with, the JIT ones V8 needs to run at all under that runtime
  // (`src-tauri/entitlements.node.plist`).
  if (MACOS) {
    const signer = macIdentity();
    const signArgs =
      signer === "-"
        ? ["--timestamp=none"]
        : [
            "--timestamp",
            "--options",
            "runtime",
            "--entitlements",
            join(APP_DIR, "src-tauri", "entitlements.node.plist"),
          ];
    try {
      execFileSync(
        "codesign",
        ["--force", "--sign", signer, ...signArgs, runtime],
        { stdio: "inherit" },
      );
    } catch (err) {
      console.warn(`! could not sign the Node runtime — ${err}`);
    }
  }
  console.log(
    `• staged ${WANTS_SESSIONS ? "the session server, " : ""}` +
      `${WANTS_MODS ? "the mod toolchain, " : ""}and a Node runtime`,
  );
}

/**
 * The parts of the config that cannot be static.
 *
 * A patch rather than a second config file, so `tauri.conf.json` stays the one
 * place a reader looks for the bundle's shape and this script only holds what
 * it computes.
 */
const patch = {
  version,
  ...(bundleId ? { identifier: bundleId } : {}),
  ...(displayName ? { productName: displayName } : {}),
  bundle: {
    // A DEPOT wants no installer at all — see the header — and `--no-bundle`
    // below is what says so, so the targets are only named for the standalone
    // download.
    ...(standalone
      ? { targets: ["app", "dmg", "deb", "appimage", "nsis"] }
      : {}),
    // The site, plus whichever sidecars this build was stamped for. Computed
    // rather than written into `tauri.conf.json` for exactly that reason: the
    // set depends on the stamp, and a static map would file a server into a
    // download that has no multiplayer.
    resources: {
      "../webroot": "webroot",
      ...(WANTS_SESSIONS ? { "../resources/server": "server" } : {}),
      ...(WANTS_MODS ? { "../resources/modtools": "modtools" } : {}),
      ...(WANTS_SESSIONS || WANTS_MODS
        ? { "../resources/runtime": "runtime" }
        : {}),
    },
    copyright: `Copyright © ${new Date().getFullYear()} ${identity.author.name}`,
    macOS: {
      // NEVER UNSIGNED. Apple Silicon does not merely distrust unsigned arm64
      // code, it refuses to EXECUTE it — macOS reports that to the player as
      // "the app is damaged", the same wording it uses for a corrupted
      // download. An ad-hoc signature ("-") satisfies the kernel and is what an
      // ordinary CI run and any developer build gets; a Developer ID
      // certificate (APPLE_SIGNING_IDENTITY) is the real thing and is what a
      // release wants, with notarization on top.
      signingIdentity: macIdentity(),
      // Valve's library, from wherever THIS target's profile directory is —
      // and THE ONLY PLACE IT IS DECLARED, because `tauri_build::build()`
      // resolves this list at COMPILE time on macOS and fails the build over an
      // entry that is not there. A static `../target/release/…` in
      // `tauri.conf.json` therefore broke every DEBUG build on a checkout that
      // had not made a release one — see `src-tauri/build.rs`. A dev build
      // wants no entry at all; only the bundle does, and only a packaging run
      // knows the profile and the `--target <triple>` that place the file.
      frameworks: [redistributablePath("libsteam_api.dylib")],
    },
  },
};

const configPatch = JSON.stringify(patch);
const tauriArgs = ["tauri", "build", "--config", configPatch];
if (!standalone) tauriArgs.push("--no-bundle");
if (target) tauriArgs.push("--target", target);

console.log(
  `• packaging ${productName} (${bundleId || "development identifier"}) — ` +
    `profile ${profile}, app ${appId}` +
    `${appId === SPACEWAR_APP_ID ? " (SPACEWAR TEST APP)" : ""}, version ${version}`,
);
run(WINDOWS ? "npx.cmd" : "npx", tauriArgs, APP_DIR);

// ---------------------------------------------------------------------------
// The depot
// ---------------------------------------------------------------------------

if (standalone) {
  console.log(`✓ bundles → ${profileDir()}/bundle`);
  process.exit(0);
}

const depot = join(RELEASE_DIR, "depot");
rmSync(depot, { recursive: true, force: true });
mkdirSync(depot, { recursive: true });

if (process.platform === "darwin") {
  // macOS keeps the executable buried in `Contents/MacOS` and its resources in
  // `Contents/Resources`, so the whole .app is the unit that travels.
  const app = join(profileDir(), "bundle", "macos", `${productName}.app`);
  requireFile(app, "the macOS app bundle");
  cpSync(app, join(depot, `${productName}.app`), { recursive: true });
} else {
  const executable = join(
    profileDir(),
    WINDOWS ? "adastrail.exe" : "adastrail",
  );
  requireFile(executable, "the built executable");
  cpSync(executable, join(depot, WINDOWS ? "adastrail.exe" : "adastrail"));
  // The site, beside the binary: an unbundled executable's resource directory
  // IS its own directory, which is the branch `protocol::webroot_dir` takes.
  requireFile(join(APP_DIR, "webroot", "index.html"), "the built website");
  cpSync(join(APP_DIR, "webroot"), join(depot, "webroot"), { recursive: true });
  const redistributable = redistributablePath(
    WINDOWS ? "steam_api64.dll" : "libsteam_api.so",
  );
  requireFile(redistributable, "Valve's redistributable");
  cpSync(
    redistributable,
    join(depot, WINDOWS ? "steam_api64.dll" : "libsteam_api.so"),
  );
  // …and the sidecars, in the layout `shell/src/runtime.rs` resolves: an
  // UNBUNDLED executable's resource directory IS its own directory, so what
  // `--no-bundle` skips is copied here by hand.
  for (const dir of ["server", "modtools", "runtime"]) {
    const staged = join(STAGE_DIR, dir);
    if (existsSync(staged))
      cpSync(staged, join(depot, dir), { recursive: true });
  }
}

console.log(`✓ depot → ${depot}`);

// ---------------------------------------------------------------------------

/**
 * NEVER UNSIGNED on macOS — see the bundle patch above. Named once so the
 * nested Node runtime and the app itself carry the same signature.
 */
function macIdentity() {
  // `||`, not `??`: a workflow that maps an absent secret passes "", which is
  // no identity at all.
  return process.env.APPLE_SIGNING_IDENTITY || "-";
}

/** Where cargo puts a release build for this target. */
function profileDir() {
  return target
    ? join(TARGET_DIR, target, "release")
    : join(TARGET_DIR, "release");
}

/** Valve's library for this target, where `src-tauri/build.rs` left it. */
function redistributablePath(name) {
  return join(profileDir(), name);
}

function requireFile(path, what) {
  if (!existsSync(path)) fail(`${what} is missing at ${path}`);
}

function run(command, commandArgs, cwd = REPO_DIR) {
  execFileSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    // Windows command shims are batch files, which Node cannot execute
    // directly (EINVAL); cmd.exe must interpret them.
    shell: WINDOWS,
    env: { ...process.env, GIS_STEAM_APP_ID: appId },
  });
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
