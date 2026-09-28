// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NO SOURCE FILE OVER 1000 LINES WITHOUT SAYING WHY.
//
// A file that big is nearly always doing more than one thing, so the cap is
// held here rather than remembered: every tracked source file outside the
// tests stays at or under 1000 physical lines, or carries
// `guidelines:allow-large-file: <reason>` in a comment within its first 20
// lines. The files already over the cap carry the standing reason "split when
// next touched; known deviation by owner decision" — a change that touches one
// splits it by concern and drops the marker. See the `write-code` skill.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const CAP = 1000;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs)$/;
const MARKER = /guidelines:allow-large-file:\s*\S/;

const isTest = (path: string) =>
  path.startsWith("tests/") ||
  /(^|\/)tests\//.test(path) ||
  /_tests?\.[a-z]+$/.test(path);

const tracked = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .stdout.split("\n")
  .filter((path) => SOURCE.test(path) && !isTest(path));

describe("the 1000-line cap", () => {
  it("finds the tree", () => {
    expect(tracked.length).toBeGreaterThan(100);
  });

  it("holds for every source file, or the file says why in its first 20 lines", () => {
    const offenders = tracked.flatMap((path) => {
      const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
      const count = lines.at(-1) === "" ? lines.length - 1 : lines.length;
      if (count <= CAP) return [];
      return MARKER.test(lines.slice(0, 20).join("\n"))
        ? []
        : [`${path}: ${count} lines`];
    });
    expect(offenders).toEqual([]);
  });
});
