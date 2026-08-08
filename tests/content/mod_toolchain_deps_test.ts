// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD TOOLCHAIN'S DEPENDENCIES, declared once and checked against reality.
//
// This suite exists because of a specific failure, and it is one that WILL
// recur without it. The toolchain runs in three environments:
//
//   the repo        a full `npm ci` — everything resolves, nothing is noticed
//   electron's CI   `npm ci` in electron/ ONLY — the repo root is not installed
//   a player's app  resources/modtools/, outside the asar, no root at all
//
// The first hides what the other two need. `yaml` was imported by
// `scripts/*-data/load-yaml.mjs` for as long as those files have existed while
// being declared NOWHERE — it resolved only because `pwa`'s copy of vite
// depends on it and npm hoisted it to the root. Everything passed locally and
// forever; the desktop check job, which installs only `electron/`, could not
// find it the moment the shell started compiling mods.
//
// Hand-listing the package in the packager AND in the workflow (as the first
// fix did) is two lists that have to agree, which is the same bug wearing a
// hat. So it is declared ONCE in `mod/package.json`, both of those read it, and
// this walks the toolchain's real import graph to prove the declaration is
// complete. The next undeclared import fails here, with the file that added it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ENTRY = path.join(repoRoot, "mod", "tools", "build.mjs");

/** What `mod/package.json` says the toolchain needs. */
const declared = Object.keys(
  (
    JSON.parse(
      readFileSync(path.join(repoRoot, "mod", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> }
  ).dependencies ?? {},
);

/**
 * An import STATEMENT, in the three shapes this house style writes them.
 *
 * Anchored at the start of a line and required to begin with `import` or
 * `export`, because a bare `from "…"` is not rare enough to match loosely: the
 * layout module's own refusals read `no catalog is read from "notes.txt"`, and
 * a pattern that took those for imports declared a dependency on `${name}` the
 * moment the compiler started importing that module.
 */
const IMPORT_PATTERNS = [
  // import "./side-effect.mjs"
  /^\s*import\s+"([^"]+)"/gm,
  // import x from "…" / export * from "…" — one line, no strings in between
  /^\s*(?:import|export)\s[^"'\n]*\bfrom\s+"([^"]+)"/gm,
  // import {\n a,\n b,\n} from "…" — the multi-line named list
  /^\s*(?:import|export)\s*\{[^{}]*\}\s*from\s+"([^"]+)"/gm,
];

/**
 * Every BARE specifier the toolchain reaches, following relative imports from
 * `entry` through the whole graph. Regex over the source rather than a real
 * parser: these are our own files in one house style, and the alternative is a
 * parser dependency in a test whose entire job is checking dependencies.
 */
function externalImports(entry: string): Set<string> {
  return walkToolchain(entry).external;
}

/** The toolchain's whole import graph: the repo files it reaches (`local`) and
 * the bare packages it needs (`external`). */
function walkToolchain(entry: string): {
  local: Set<string>;
  external: Set<string>;
} {
  const seen = new Set<string>();
  const external = new Set<string>();

  const walk = (file: string) => {
    const resolved = path.resolve(file);
    if (seen.has(resolved)) return;
    seen.add(resolved);

    let source: string;
    try {
      source = readFileSync(resolved, "utf8");
    } catch {
      return; // a path we mis-resolved is a different test's problem
    }
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const spec = match[1]!;
        if (spec.startsWith(".")) walk(path.join(path.dirname(resolved), spec));
        else if (!spec.startsWith("node:")) external.add(spec.split("/")[0]!);
      }
    }
  };

  walk(entry);
  return { local: seen, external };
}

describe("the mod toolchain's dependencies", () => {
  const reached = externalImports(ENTRY);

  it("reaches more than one file, or this suite proves nothing", () => {
    // The graph walk is the whole instrument; a broken one would make every
    // assertion below vacuously true.
    expect(reached.size).toBeGreaterThan(0);
  });

  it("imports nothing that mod/package.json does not declare", () => {
    const undeclared = [...reached].filter((pkg) => !declared.includes(pkg));
    expect(undeclared).toEqual([]);
  });

  it("declares nothing the toolchain does not import", () => {
    // The other direction matters too: a stale entry means the packager copies
    // a package the app never loads, and quietly grows the download.
    const unused = declared.filter((pkg) => !reached.has(pkg));
    expect(unused).toEqual([]);
  });

  it("is declared at the repo root too, not left to hoisting", () => {
    // The root is where these packages actually resolve from — `scripts/`
    // modules live there, so a tree under `mod/` would be resolved past. An
    // undeclared root dependency is the exact accident this suite is about.
    const root = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const rootDeps = [
      ...Object.keys(root.dependencies ?? {}),
      ...Object.keys(root.devDependencies ?? {}),
    ];
    const missing = declared.filter((pkg) => !rootDeps.includes(pkg));
    expect(missing).toEqual([]);
  });

  it("has every module it imports carried into the packaged app", () => {
    // The same gap as the package one, for our OWN files. The compiler ships
    // OUTSIDE the asar in a tree that MIRRORS the repo, and every module in it
    // finds its neighbours by relative path — so a `scripts/` directory the
    // toolchain imports and `extraResources` does not copy is a mod that
    // compiles in the repo and fails on a player's machine with a resolve error.
    // (`scripts/powerup-data` was exactly that for a release.)
    // The list lives in `scripts/modtools-manifest.cjs` and BOTH desktop
    // packagers read it — one list, because two shells carrying two copies of
    // it is the same bug wearing a hat. What is asserted here is the list
    // itself, plus (below) that each packager still reads it.
    const manifest = readFileSync(
      path.join(repoRoot, "scripts", "modtools-manifest.cjs"),
      "utf8",
    );
    const copied = new Set(
      [...manifest.matchAll(/from:\s*"([^"]+)"/g)].map((m) => m[1]!),
    );
    const missing = [...walkToolchain(ENTRY).local]
      .map((file) => path.relative(repoRoot, file).split(path.sep))
      // A module is carried if the config copies its own directory or any
      // ancestor of it (`scripts/asset-tools` covers every file inside).
      .filter(
        (parts) =>
          !parts
            .map((_, i) => parts.slice(0, i + 1).join("/"))
            .some((prefix) => copied.has(prefix)),
      )
      .map((parts) => parts.join("/"));
    expect(missing).toEqual([]);
  });

  it("is carried into the packaged app by electron-builder", () => {
    // The third environment. A declared package that the packager does not
    // copy is a mod that compiles in CI and fails on a player's machine —
    // which is the same class of gap, one layer further out.
    const config = readFileSync(
      path.join(repoRoot, "electron", "electron-builder.config.cjs"),
      "utf8",
    );
    // The config builds its entries FROM this manifest rather than repeating
    // the names, so what is asserted is that it still reads it.
    expect(config).toMatch(/mod\/package\.json/);
  });

  it("is carried into the packaged app by BOTH desktop packagers", () => {
    // `tauri/` packages the same compiler (docs/tauri-migration.md), so the
    // same three gaps exist there — and the way they stay closed is that both
    // shells read one list rather than keeping one each.
    for (const packager of [
      path.join("electron", "electron-builder.config.cjs"),
      path.join("tauri", "scripts", "package.mjs"),
    ]) {
      const source = readFileSync(path.join(repoRoot, packager), "utf8");
      expect(source, packager).toMatch(/modtools-manifest\.cjs/);
      expect(source, packager).toMatch(
        /mod\/package\.json|"mod", "package.json"/,
      );
    }
  });
});
