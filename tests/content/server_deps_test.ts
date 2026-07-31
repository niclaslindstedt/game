// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION SERVER'S DEPENDENCIES, declared once and checked against reality.
//
// The sibling of `mod_toolchain_deps_test.ts`, and it exists for the same
// failure in a second place. The server runs in three environments:
//
//   the repo        a full `npm ci` — everything resolves, nothing is noticed
//   electron's CI   `npm ci` in electron/ ONLY — the repo root is not installed
//   a player's app  resources/server/, outside the asar, no root at all
//
// The first hides what the other two need. The engine has NO npm dependencies
// today, and that is exactly the state worth pinning: the first one added would
// resolve locally, resolve in every test, and then fail on a player's machine
// with a module-not-found the developer who added it cannot reproduce.
//
// It also polices the shape of the ship target, which is the other half of what
// went wrong the first time the mod toolchain was packaged: the compiled tree
// carries `src/` and `server/` and nothing else, so anything the server reaches
// OUTSIDE those two trees is a file that will not be there.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ENTRY = path.join(repoRoot, "server", "main.ts");

/** The trees `scripts/build-server.mjs` compiles into the ship target. Keep in
 * step with its `SOURCES`. */
const SHIPPED_TREES = ["src", "server"];

/** What `server/package.json` says the server needs at runtime. */
const declared = Object.keys(
  (
    JSON.parse(
      readFileSync(path.join(repoRoot, "server", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> }
  ).dependencies ?? {},
);

/**
 * The server's whole import graph: the repo files it reaches (`local`) and the
 * bare packages it needs (`external`).
 *
 * Regex over the source rather than a real parser — these are our own files in
 * one house style, and the alternative is a parser dependency in a test whose
 * entire job is checking dependencies. The same trade `mod_toolchain_deps_test`
 * makes, and for the same reason.
 */
function walkServer(entry: string): {
  local: Set<string>;
  external: Set<string>;
} {
  const seen = new Set<string>();
  const external = new Set<string>();

  const walk = (file: string) => {
    const resolved = resolveModule(file);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    let source: string;
    try {
      source = readFileSync(resolved, "utf8");
    } catch {
      return;
    }
    // A module specifier never contains whitespace, and requiring that is what
    // keeps this off the game's own prose: the engine's comments are full of
    // sentences like `away from "a dead end"`, and a looser pattern reads them
    // as imports of a package called "a dead\n * end".
    for (const match of source.matchAll(
      /(?:from|import\s*\()\s*"([^"\s]+)"/g,
    )) {
      const spec = match[1]!;
      if (spec.startsWith(".")) {
        walk(path.join(path.dirname(resolved), spec));
      } else if (spec.startsWith("@game/")) {
        walk(aliasPath(spec));
      } else if (!spec.startsWith("node:")) {
        external.add(spec.split("/")[0]!);
      }
    }
  };

  walk(entry);
  return { local: seen, external };
}

/** The four alias maps the builds read, in the one form this test needs. Keep
 * in step with `scripts/build-server.mjs`'s own table. */
function aliasPath(spec: string): string {
  if (spec === "@game/core") return path.join(repoRoot, "src", "index.ts");
  if (spec === "@game/menu") return path.join(repoRoot, "src", "menu.ts");
  if (spec.startsWith("@game/lib/")) {
    return path.join(repoRoot, "src", "lib", spec.slice("@game/lib/".length));
  }
  if (spec.startsWith("@game/wire/")) {
    return path.join(
      repoRoot,
      "server",
      "wire",
      spec.slice("@game/wire/".length),
    );
  }
  return spec;
}

/** A specifier's real file. The repo's own imports carry `.ts`, so this is
 * mostly identity — it exists for a directory import, which would otherwise
 * silently drop a whole subtree from the walk. */
function resolveModule(file: string): string | null {
  if (file.endsWith(".ts")) return path.resolve(file);
  for (const candidate of [`${file}.ts`, path.join(file, "index.ts")]) {
    try {
      readFileSync(candidate, "utf8");
      return path.resolve(candidate);
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

describe("the session server's ship target", () => {
  const graph = walkServer(ENTRY);

  it("reaches the engine at all", () => {
    // The guard on the guard: a walk that resolved nothing would declare every
    // rule below satisfied.
    expect(graph.local.size).toBeGreaterThan(100);
    expect(
      [...graph.local].some((file) => file.endsWith("/game/create.ts")),
    ).toBe(true);
  });

  it("declares every package it imports", () => {
    const undeclared = [...graph.external].filter(
      (pkg) => !declared.includes(pkg),
    );
    expect(undeclared).toEqual([]);
  });

  it("declares nothing it does not import", () => {
    // The other direction, so the manifest cannot rot into a list of packages
    // the packager keeps copying for nobody.
    const unused = declared.filter((pkg) => !graph.external.has(pkg));
    expect(unused).toEqual([]);
  });

  it("stays inside the trees the build actually ships", () => {
    const strays = [...graph.local]
      .map((file) => path.relative(repoRoot, file))
      .filter(
        (file) =>
          !SHIPPED_TREES.some((tree) => file.startsWith(`${tree}${path.sep}`)),
      );
    expect(strays).toEqual([]);
  });

  it("never reaches into the app", () => {
    // The engine never imports from `pwa/`, and the server is engine code. A
    // reach across that line would compile here and be absent from the ship
    // target — the exact failure the mod toolchain's own test was written for.
    const intoApp = [...graph.local].filter((file) =>
      path.relative(repoRoot, file).startsWith(`pwa${path.sep}`),
    );
    expect(intoApp).toEqual([]);
  });
});
