// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEPENDENCY LICENCE CHECK, held to the fleet's list.
//
// `scripts/check-licences.mjs` (`make licences`, CI's lint job) reads the
// three committed lockfiles against one allow-list, the same in every game.
// This runs it as CI runs it, pins its list to the fleet's, and runs it over
// made-up trees to show each tier does what it says.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const SCRIPT = join(root, "scripts", "check-licences.mjs");

/** The fleet's licence list, the same in every game: what any package may
 * carry, and what only a development-only package may (LGPL — build tooling
 * that never reaches a player). */
const FLEET_ALLOWED = [
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
];
const FLEET_DEV_ONLY = [
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
];

type LockEntry = { license?: string; dev?: boolean };

/** Run the checker over a made-up tree: a copy of the script beside three
 * lockfiles, the root one holding `packages`. The copy sits under
 * node_modules/ so the script's own imports still resolve. */
function checkTree(packages: Record<string, LockEntry>) {
  const dir = mkdtempSync(join(root, "node_modules", ".licence-fixture-"));
  try {
    const lock = (entries: Record<string, LockEntry>) =>
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          ...Object.fromEntries(
            Object.entries(entries).map(([name, entry]) => [
              `node_modules/${name}`,
              { version: "1.0.0", ...entry },
            ]),
          ),
        },
      });
    const { license } = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      license: string;
    };
    mkdirSync(join(dir, "scripts"));
    copyFileSync(SCRIPT, join(dir, "scripts", "check-licences.mjs"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ license }));
    writeFileSync(join(dir, "package-lock.json"), lock(packages));
    for (const tree of ["native", "tauri"]) {
      mkdirSync(join(dir, tree));
      writeFileSync(join(dir, tree, "package-lock.json"), lock({}));
    }
    return spawnSync(
      process.execPath,
      [join(dir, "scripts", "check-licences.mjs")],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The quoted ids in one `new Set([...])` of the script, comments aside. */
function listed(name: string): string[] {
  const source = readFileSync(SCRIPT, "utf8");
  const body = new RegExp(
    `const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`,
  ).exec(source)?.[1];
  expect(body, `${name} in the script`).toBeDefined();
  return (body ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .flatMap(
      (line) =>
        line.match(/"[^"]+"/g)?.map((quoted) => quoted.slice(1, -1)) ?? [],
    );
}

describe("the dependency licence check", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
    });

  it("passes on the committed lockfiles", () => {
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/every licence is on the allow-list/);
  });

  it("answers --help and refuses an unknown flag", () => {
    expect(run("--help").status).toBe(0);
    expect(run("--no-such-flag").status).not.toBe(0);
  });

  it("holds the fleet's list, no more and no less", () => {
    expect(new Set(listed("ALLOWED"))).toEqual(new Set(FLEET_ALLOWED));
    expect(new Set(listed("DEV_ONLY"))).toEqual(new Set(FLEET_DEV_ONLY));
  });

  it("allows every licence on the list, and LGPL on a development-only package", () => {
    const packages: Record<string, LockEntry> = {
      "builds-mixed": {
        license: "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
        dev: true,
      },
      "ships-choice": { license: "(BSD-3-Clause OR GPL-2.0)" },
    };
    for (const id of FLEET_ALLOWED) packages[`ships-${id}`] = { license: id };
    for (const id of FLEET_DEV_ONLY)
      packages[`builds-${id}`] = { license: id, dev: true };
    const result = checkTree(packages);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("refuses LGPL on a package that ships", () => {
    for (const id of FLEET_DEV_ONLY) {
      const result = checkTree({ "ships-lgpl": { license: id } });
      expect(result.status, id).toBe(1);
      expect(result.stderr, id).toMatch(/ships-lgpl/);
    }
  });

  it("refuses a licence off the list, even on a development-only package, and a missing one", () => {
    const refused: LockEntry[] = [
      { license: "GPL-3.0-only", dev: true },
      { license: "SSPL-1.0" },
      { license: "MIT AND GPL-2.0-only" },
      {},
    ];
    for (const entry of refused) {
      const result = checkTree({ refused: entry });
      expect(result.status, JSON.stringify(entry)).toBe(1);
      expect(result.stderr, JSON.stringify(entry)).toMatch(/refused/);
    }
  });
});
