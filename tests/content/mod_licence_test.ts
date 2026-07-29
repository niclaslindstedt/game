// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD SDK'S LICENCE SPLIT, pinned.
//
// `mod/` is licensed in two halves on purpose (see mod/LICENSE.md): the
// SAMPLES a modder copies are public domain, and the TOOLCHAIN is licensed
// only for making mods for this game. That split is worth nothing if a new
// file lands on the wrong side of it — and it would be invisible, because
// nothing about a missing header stops the code from working.
//
// So: every file under mod/ declares which half it is in, and this fails the
// build when one does not. It is the same reasoning as the manifest drift
// tests — a fact that lives in two places needs something that compares them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MOD_DIR = fileURLToPath(new URL("../../mod", import.meta.url));

/** The toolchain: licensed for making mods for this game. */
const SDK = "LicenseRef-GoneInSpace-Mod-SDK-1.0";
/** The samples: public domain, so a modder never has to think about it. */
const SAMPLES = "CC0-1.0";

/** Every file under `mod/`, relative to it. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, base);
    return [path.relative(base, full)];
  });
}

/** The SPDX tag a file declares, or null. Read from the first few lines so a
 * shebang (or a YAML document marker) above it is fine. */
function declaredLicence(file: string): string | null {
  const head = readFileSync(path.join(MOD_DIR, file), "utf8")
    .split("\n", 5)
    .join("\n");
  return /SPDX-License-Identifier:\s*(\S+)/.exec(head)?.[1] ?? null;
}

/** Which half a path belongs to — the ONE place the split is expressed. */
function expectedLicence(file: string): string | null {
  if (file.startsWith(`tools${path.sep}`)) return SDK;
  if (file.startsWith(`examples${path.sep}`)) return SAMPLES;
  return null; // catalog.json (generated), the markdown, anything else
}

describe("the mod SDK licence split", () => {
  const files = walk(MOD_DIR);

  it("has files on both sides of it", () => {
    // A guard on the guard: if the walk broke, every assertion below would
    // vacuously pass.
    expect(files.some((f) => expectedLicence(f) === SDK)).toBe(true);
    expect(files.some((f) => expectedLicence(f) === SAMPLES)).toBe(true);
  });

  it("labels every toolchain file as SDK-licensed", () => {
    const wrong = files
      .filter((f) => expectedLicence(f) === SDK)
      .filter((f) => declaredLicence(f) !== SDK);
    expect(wrong).toEqual([]);
  });

  it("labels every sample as public domain", () => {
    // A sample carrying the SDK's licence would tell a modder that the file
    // they are copying to START a mod may only be used for this game — the
    // exact confusion the split exists to prevent.
    const wrong = files
      .filter((f) => expectedLicence(f) === SAMPLES)
      .filter((f) => declaredLicence(f) !== SAMPLES);
    expect(wrong).toEqual([]);
  });

  it("ships the licence text itself", () => {
    expect(files).toContain("LICENSE.md");
    const text = readFileSync(path.join(MOD_DIR, "LICENSE.md"), "utf8");
    // The two identifiers the headers point at must actually be defined in it,
    // or the headers reference a licence nobody can read.
    expect(text).toContain(SAMPLES);
    expect(text).toContain("replace the repository's");
  });
});
