// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE DEPENDENCY DIRECTION, CHECKED AGAINST THE REAL IMPORTS.
//
// The layers only work if they only point one way:
//
//   engine/      the simulation core — imports nothing outside itself
//   server/      the session service — the core and itself, never a shell
//   pwa/src/     the presentation shell — the core and the session client,
//                never another shell (native/, tauri/) and never a tool
//   native/src/  the phone shell — never the website's source, never the
//                desktop shell, never a tool (it wraps the BUILT site)
//   scripts/     tooling — may import anything, and nothing above imports it
//
// So this walks every import statement in those trees — relative paths and the
// build's aliases alike — and names each edge that points the wrong way. A
// regex over our own house style rather than a parser, for the same reason
// `tests/content/server_deps_test.ts` gives: a parser dependency in a test
// about dependencies is the wrong trade.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(import.meta.dirname, "..");
const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs)$/;

type Role = "engine" | "server" | "pwa" | "native" | "tauri" | "scripts";

/** The role a repo-relative path belongs to, or null for everything else. */
function roleOf(file: string): Role | null {
  if (file.startsWith("engine/")) return "engine";
  if (file.startsWith("server/")) return "server";
  if (file.startsWith("pwa/src/")) return "pwa";
  if (file.startsWith("native/src/") || /^native\/[^/]+\.tsx?$/.test(file)) {
    return "native";
  }
  if (file.startsWith("tauri/")) return "tauri";
  if (file.startsWith("scripts/")) return "scripts";
  return null;
}

/** The build's aliases (tsconfig.json `paths`), resolved to a repo path. */
function alias(spec: string): string | null {
  const table: [string, string][] = [
    ["@game/core", "engine/index.ts"],
    ["@game/menu", "engine/menu.ts"],
    ["@game/client", "server/client.ts"],
    ["@game/lib/", "engine/lib/"],
    ["@game/wire/", "server/wire/"],
    ["@ui/lib/", "pwa/src/lib/"],
  ];
  for (const [prefix, target] of table) {
    if (spec === prefix) return target;
    if (prefix.endsWith("/") && spec.startsWith(prefix)) {
      return target + spec.slice(prefix.length);
    }
  }
  return null;
}

/** Comments out, so a sentence that mentions `import "x"` is not an import. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every repo file a source file imports, as repo-relative paths. */
function importsOf(file: string): string[] {
  const text = code(readFileSync(path.join(ROOT, file), "utf8"));
  const out: string[] = [];
  for (const match of text.matchAll(
    /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\s]+)["']/g,
  )) {
    const spec = match[1]!;
    if (spec.startsWith(".")) {
      out.push(
        path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)),
      );
    } else {
      const target = alias(spec);
      if (target) out.push(target);
    }
  }
  return out;
}

/** Which roles each role may import (itself always). */
const ALLOWED: Record<Exclude<Role, "scripts" | "tauri">, Role[]> = {
  engine: ["engine"],
  server: ["engine", "server"],
  pwa: ["engine", "server", "pwa"],
  native: ["native"],
};

const files = spawnSync(
  "git",
  ["ls-files", "engine", "server", "pwa/src", "native"],
  {
    cwd: ROOT,
    encoding: "utf8",
  },
)
  .stdout.split("\n")
  .filter((f) => SOURCE.test(f) && !f.endsWith(".d.ts"));

describe("the import graph", () => {
  it("reads the tree", () => {
    expect(files.filter((f) => roleOf(f) === "engine").length).toBeGreaterThan(
      100,
    );
    expect(files.filter((f) => roleOf(f) === "pwa").length).toBeGreaterThan(
      100,
    );
  });

  it("sees the edges it is checking — the app and the server both reach the core", () => {
    // The guard on the guard: a pattern that matched nothing would pass below.
    const reaches = (from: Role, to: Role) =>
      files.some(
        (f) => roleOf(f) === from && importsOf(f).some((t) => roleOf(t) === to),
      );
    expect(reaches("pwa", "engine")).toBe(true);
    expect(reaches("server", "engine")).toBe(true);
    expect(reaches("engine", "engine")).toBe(true);
  });

  it("points one way: every edge goes to a role its source may depend on", () => {
    const wrong: string[] = [];
    for (const file of files) {
      const from = roleOf(file);
      if (!from || from === "scripts" || from === "tauri") continue;
      for (const target of importsOf(file)) {
        const to = roleOf(target);
        if (to && !ALLOWED[from].includes(to)) {
          wrong.push(`${file} → ${target} (${from} may not import ${to})`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
