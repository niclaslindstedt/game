#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGINE'S NODE SHIP TARGET.
//
// `@game/core` is consumed by Vite (for the browser) and by
// `scripts/game-alias-loader.mjs` (for tooling). Neither produces something
// that ships INSIDE the app, and the session server needs exactly that: the
// simulation, running under plain Node, inside a `utilityProcess`.
//
// **The type-stripping route was spiked first, and the spike is what chose
// this one.** The engine's imports already carry `.ts` extensions and the root
// demands Node ≥ 24, so `node` running the sources directly looked like the
// smallest possible change — and it does work: stripping is on by default from
// Node 22.18, which is how `scripts/simulate-run.mjs` already imports
// `engine/sim/simulate.ts`. Two things killed it anyway:
//
//   * **It does not resolve the path ALIASES.** `@game/lib/vec.ts` needs
//     `scripts/game-alias-loader.mjs` registered, and registering a loader
//     inside a forked `utilityProcess` means threading `execArgv` through the
//     fork and hoping Electron keeps honouring it.
//   * **The runtime is not ours to pin.** `utilityProcess` runs ELECTRON's
//     bundled Node, whose version moves with Electron. A ship target resting
//     on an experimental flag in a runtime somebody else upgrades is one that
//     breaks in a released build, on a player's machine, for a reason nobody
//     changed.
//
// So the fallback is to precompile, which
// also makes the standalone dedicated server trivially portable.
//
// **WHY THE SOURCES ARE STAGED FIRST, which is the one surprising step.**
// TypeScript refuses outright to EMIT a file whose import is both aliased and
// carries a `.ts` extension (TS2877): it rewrites the extension only on
// relative specifiers, and it never rewrites an alias at all. Every one of the
// engine's `@game/lib/*.ts` imports is exactly that combination, so the alias
// has to be gone before `tsc` sees it. Staging a copy and rewriting the
// specifiers there costs one directory and keeps the engine written in the
// repo's own house style — which matters, because the alternative was to
// relativize `@game/lib` across `engine/`, and the alias is what marks the
// generic pool as generic: a relative path says nothing about which side of
// that line a module sits on.
//
// The alternative to all of it is a bundler, and it was refused for a reason
// that already has a test in this repo: `typescript` is a declared devDependency
// of both trees, while `rolldown` is here only as a transitive of vite — which
// is precisely the class of undeclared dependency `mod/package.json` and
// `tests/content/mod_toolchain_deps_test.ts` exist to prevent.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
/** Where the rewritten copy of the sources is compiled FROM. Gitignored. */
const stageDir = path.join(root, "electron", "server-src");
/** Where the compiled server lands. Gitignored; `extraResources` copies it. */
const outDir = path.join(root, "electron", "server-dist");

/**
 * Alias prefix → the directory it names, relative to the repo root. Keep in
 * step with the four alias maps the builds read (tsconfig.json,
 * pwa/tsconfig.json, vitest.config.ts, pwa/vite.config.ts) — a build that sees
 * a different module graph than the game does is worse than one that fails.
 */
const ALIAS_DIRS = [["@game/lib/", "engine/lib"]];
const ALIAS_FILES = [
  ["@game/core", "engine/index.ts"],
  ["@game/menu", "engine/menu.ts"],
];

/** The trees that travel, by their path from the repo root. */
const SOURCES = ["engine", "server"];

/** Where the compiled content catalogs land. Gitignored; `npm run levels`
 * regenerates them (§11.2). */
const generatedDir = path.join(root, "engine", "generated");

/** Every `from "…"` / `import("…")` specifier in a source file. Shared with
 * `relativizeAliases`, so the preflight and the rewrite can never disagree
 * about what an import looks like. */
const IMPORT_RE = /((?:from|import)\s*\(?\s*)"([^"]+)"/g;

/**
 * THE LICENCE LOCK'S FOLD. `server/licence.ts` holds one build-time literal —
 * `true` in the repo tree so the suites and the soak fleet run from sources —
 * and the ship target is what turns it `false`, so the packaged binary's
 * config-file escape (`DedicatedConfig.allowUnlicensedTransport`) is dead code
 * rather than a statement a player can edit their way past. The marker comment
 * is part of the contract: `foldLicenceLock` refuses a build where the literal
 * has drifted, because a lock that silently stopped folding is no lock.
 */
const LICENCE_FILE = path.join("server", "licence.ts");
const LICENCE_OPEN =
  "UNLICENSED_TRANSPORT_UNLOCKED: boolean = true; // licence-lock:";
const LICENCE_SHUT =
  "UNLICENSED_TRANSPORT_UNLOCKED: boolean = false; // licence-lock:";

main();

function main() {
  requireGeneratedCatalogs();

  rmSync(stageDir, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });

  const staged = stage();
  compile();
  emitManifest();
  copyRuntimeJson();

  console.log(
    `server: ${staged} files compiled into ${path.relative(root, outDir)}`,
  );
}

/**
 * REFUSE A BUILD WHOSE CONTENT CATALOGS HAVE NOT BEEN COMPILED YET, and name
 * the command that compiles them.
 *
 * `engine/generated/` is build output like every other generated artifact (§11.2)
 * — gitignored, rebuilt by `npm run levels`, which the root's own `pre*` hooks
 * run ahead of every test, typecheck and lint. This script had no such hook and
 * no way to grow one that helps everybody, because `electron/` is not a
 * workspace member and reaches it as `node ../scripts/build-server.mjs`. A
 * fresh clone, or one that predates a catalog (`sets`, `talents`, `quests` and
 * the story catalogs each arrived after the ones around them), therefore
 * reached `tsc` and got a wall of TS2307s naming staged copies under
 * `electron/server-src/` — paths that exist in no editor and no git status, and
 * which say nothing about the one command that fixes all of them.
 *
 * The check is DERIVED rather than a list: every relative specifier that
 * resolves into `engine/generated/` is an import the compile is about to need, so
 * a catalog added tomorrow is covered without this file learning its name.
 */
function requireGeneratedCatalogs() {
  const missing = new Set();
  for (const tree of SOURCES) {
    for (const file of walk(path.join(root, tree))) {
      if (!file.endsWith(".ts")) continue;
      const from = path.dirname(file);
      for (const [, , spec] of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
        if (!spec.startsWith(".")) continue;
        const target = path.resolve(from, spec);
        if (!target.startsWith(`${generatedDir}${path.sep}`)) continue;
        try {
          statSync(target);
        } catch {
          missing.add(path.relative(root, target));
        }
      }
    }
  }
  if (missing.size === 0) return;

  console.error(
    `server: ${missing.size} compiled content ${
      missing.size === 1 ? "catalog is" : "catalogs are"
    } missing, starting with ${[...missing].sort()[0]}.\n` +
      "server: they are build output — run `npm run levels` at the repo root " +
      "(or `make assets`) and build again.",
  );
  process.exit(1);
}

/** Copy the sources and rewrite every alias specifier to a relative one.
 * Returns how many TypeScript files were staged. */
function stage() {
  let count = 0;
  // The stage sits under `electron/`, whose own manifest has no `type` field —
  // so `nodenext` would read every staged file as CommonJS and refuse its ESM
  // syntax outright. One manifest at the stage root settles it, and it has to
  // be written BEFORE `tsc` looks, not with the output.
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  );
  for (const tree of SOURCES) {
    for (const file of walk(path.join(root, tree))) {
      if (!file.endsWith(".ts")) continue;
      const dest = path.join(stageDir, path.relative(root, file));
      mkdirSync(path.dirname(dest), { recursive: true });
      let source = relativizeAliases(readFileSync(file, "utf8"), file);
      if (path.relative(root, file) === LICENCE_FILE) {
        source = foldLicenceLock(source);
      }
      writeFileSync(dest, source);
      count++;
    }
  }
  return count;
}

/** The one-token rewrite that shuts the licence lock in the ship target, and
 * the refusal that keeps the fold honest when the literal drifts. */
function foldLicenceLock(source) {
  if (!source.includes(LICENCE_OPEN)) {
    console.error(
      `server: ${LICENCE_FILE} no longer carries the licence-lock literal ` +
        "this build folds shut — the shipped binary would honour the " +
        "config-file escape. Restore the marked literal before building.",
    );
    process.exit(1);
  }
  return source.replace(LICENCE_OPEN, LICENCE_SHUT);
}

/** One file's source with `@game/…` specifiers turned into relative paths. */
function relativizeAliases(source, file) {
  const from = path.dirname(file);
  return source.replace(IMPORT_RE, (match, lead, spec) => {
    const target = aliasTarget(spec);
    return target
      ? `${lead}"${relative(from, path.join(root, target))}"`
      : match;
  });
}

/** The repo-relative path an alias specifier names, or null if it is not one. */
function aliasTarget(spec) {
  for (const [alias, file] of ALIAS_FILES) {
    if (spec === alias) return file;
  }
  for (const [prefix, dir] of ALIAS_DIRS) {
    if (spec.startsWith(prefix)) {
      return path.posix.join(dir, spec.slice(prefix.length));
    }
  }
  return null;
}

/** A specifier Node and TypeScript both accept: POSIX separators, and always
 * explicitly relative (a bare `x.ts` is a package request, not a sibling). */
function relative(from, to) {
  const rel = path.relative(from, to).split(path.sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function compile() {
  const tsc = findTsc();
  try {
    execFileSync(tsc, ["-p", path.join(root, "server", "tsconfig.json")], {
      stdio: "inherit",
      cwd: root,
      // WINDOWS: `node_modules/.bin/tsc.cmd` is a BATCH FILE, and Node will
      // not execute one directly — `execFileSync` fails with EINVAL before
      // the compiler runs at all. cmd.exe has to interpret it. The same trap
      // is documented in `electron/scripts/bundle-web.mjs`; it reached here
      // by way of a path only the Windows packaging job takes, and the
      // symptom was a build that exited 1 having printed nothing whatsoever.
      shell: process.platform === "win32",
    });
  } catch (err) {
    // A non-zero EXIT is `tsc` having printed its own diagnostics, and a stack
    // trace on top of them buries the first error. Anything else — a compiler
    // that could not be started — has printed nothing, so it must be said
    // here or the failure is silent.
    if (err?.status === undefined || err.status === null) {
      console.error(`server: could not run ${tsc} — ${err?.message ?? err}`);
    }
    process.exit(1);
  }
}

/**
 * `type: module` so Node reads the emitted ESM as ESM, and the server's own
 * runtime dependencies — declared once in `server/package.json`, so the
 * packager and `tests/content/server_deps_test.ts` read one list rather than
 * agreeing with each other by hand.
 */
function emitManifest() {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "server", "package.json"), "utf8"),
  );
  writeFileSync(
    path.join(outDir, "package.json"),
    `${JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        private: true,
        type: "module",
        main: "server/main.js",
        dependencies: manifest.dependencies ?? {},
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Any JSON the engine imports at runtime, which `tsc` does not emit.
 *
 * There is none today — every catalog is compiled TypeScript under
 * `engine/generated/` — and this exists so the day one appears is not the day the
 * packaged app fails to start with a resolve error a developer's checkout
 * cannot reproduce. Documentation and build manifests are deliberately left
 * behind: the ship target carries what the process RUNS and nothing else.
 */
function copyRuntimeJson() {
  for (const tree of SOURCES) {
    const from = path.join(root, tree);
    for (const file of walk(from)) {
      const name = path.basename(file);
      if (!name.endsWith(".json")) continue;
      if (name === "package.json" || name === "tsconfig.json") continue;
      const dest = path.join(outDir, tree, path.relative(from, file));
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(file, dest);
    }
  }
}

/**
 * `tsc`, from whichever tree has it.
 *
 * The desktop package job installs BOTH trees, but `electron/` is not a
 * workspace member and its own CI installs only itself — so the compiler is
 * looked for in the shell's tree as well as the root's. `typescript` is a
 * declared devDependency of both, which is what makes the fallback honest
 * rather than a hoisting accident.
 */
function findTsc() {
  const bin = process.platform === "win32" ? "tsc.cmd" : "tsc";
  const candidates = [
    path.join(root, "node_modules", ".bin", bin),
    path.join(root, "electron", "node_modules", ".bin", bin),
  ];
  for (const candidate of candidates) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // Try the next tree.
    }
  }
  console.error(
    "server: no `tsc` found. Run `npm ci` at the repo root (or in electron/).",
  );
  process.exit(1);
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
