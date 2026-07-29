// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `mod/catalog.json` against the game's live catalogs.
//
// The file is the id list every mod is validated against, and it travels
// INSIDE the shipped desktop app because the main process has no TypeScript to
// import the real catalogs from. So it is a copy, and a copy drifts: retire an
// enemy and every mod that names it keeps compiling, right up until a player
// subscribes and the level spawns nothing. Committing it makes that diff
// reviewable; this makes it mandatory.

import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("mod/catalog.json", () => {
  it("matches the game's own catalogs", () => {
    const script = fileURLToPath(
      new URL("../../mod/tools/catalog.mjs", import.meta.url),
    );
    expect(() =>
      execFileSync(process.execPath, [script, "--check"], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
