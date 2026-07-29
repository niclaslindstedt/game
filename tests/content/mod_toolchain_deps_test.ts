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
 * Every BARE specifier the toolchain reaches, following relative imports from
 * `entry` through the whole graph. Regex over the source rather than a real
 * parser: these are our own files in one house style, and the alternative is a
 * parser dependency in a test whose entire job is checking dependencies.
 */
function externalImports(entry: string): Set<string> {
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
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const spec = match[1]!;
      if (spec.startsWith(".")) walk(path.join(path.dirname(resolved), spec));
      else if (!spec.startsWith("node:")) external.add(spec.split("/")[0]!);
    }
  };

  walk(entry);
  return external;
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
});
