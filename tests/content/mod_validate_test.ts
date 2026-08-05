// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRE-PUBLISH AUDIT AND THE PACKAGER (mod/tools/validate.mjs, package.mjs)
// — that the worked example passes both, and that every refusal actually bites.
//
// The negative cases are the point here, exactly as they are for the compiler
// next door (mod_build_test.ts), and the failure being guarded against is the
// quiet one: a zip is forever once somebody else has it. A validator that waves
// through a `.DS_Store`, a folder of layered source art, a file one directory
// deeper than any loader reads, or a manifest that describes half of what it
// ships, is a validator that lets all of that travel to every subscriber — and
// none of it would ever fail a compile.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { readCatalog } from "../../mod/tools/catalog-read.mjs";
import { ModPackageError, packageMod } from "../../mod/tools/package.mjs";
import { validateMod } from "../../mod/tools/validate.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const catalog = readCatalog(path.join(repoRoot, "mod", "catalog.json"));
const EXAMPLE = path.join(repoRoot, "mod", "examples", "greenhouse");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the worked example, for a test that breaks exactly one
 * thing about a folder that otherwise passes. */
function copyOfExample(edit: (dir: string) => void = () => {}): string {
  const parent = mkdtempSync(path.join(tmpdir(), "gis-modpkg-"));
  temps.push(parent);
  const dir = path.join(parent, "greenhouse");
  cpSync(EXAMPLE, dir, { recursive: true });
  edit(dir);
  return dir;
}

/** Add a file to a mod folder, making its directory if it is new. */
function write(dir: string, rel: string, body = "x: 1\n"): void {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

/** Drop one line from the manifest's `contents:` — the file stays on disk. */
function undescribe(dir: string, needle: string): void {
  const manifest = path.join(dir, "mod.yaml");
  const kept = readFileSync(manifest, "utf8")
    .split("\n")
    .filter((line, i, lines) => {
      if (line.includes(needle)) return false;
      // Its `summary:` is the line under it.
      return !(lines[i - 1]?.includes(needle) ?? false);
    })
    .join("\n");
  writeFileSync(manifest, kept);
}

const problems = (dir: string) => validateMod(dir, { catalog }).errors;
const complains = (dir: string, pattern: RegExp) =>
  problems(dir).some((problem) => pattern.test(problem));

describe("validateMod", () => {
  it("passes the worked example", () => {
    expect(validateMod(EXAMPLE, { catalog }).errors).toEqual([]);
  });

  it("describes every file the game loads, and nothing else", () => {
    const { contents, files } = validateMod(EXAMPLE, { catalog });
    expect(contents.map((entry) => entry.path).sort()).toEqual(
      [...files.content].sort(),
    );
    expect(files.junk).toEqual([]);
    expect(files.stray).toEqual([]);
  });

  it("refuses what an editor or an operating system left behind", () => {
    const dir = copyOfExample((at) => {
      write(at, ".DS_Store", "");
      write(at, "levels/greenhouse.yaml.bak", "");
      write(at, "sprites/greenhouse/creeper.psd", "");
    });
    expect(complains(dir, /\.DS_Store/)).toBe(true);
    expect(complains(dir, /\.bak/)).toBe(true);
    expect(complains(dir, /\.psd/)).toBe(true);
  });

  it("refuses a file nothing in the game reads", () => {
    const dir = copyOfExample((at) => write(at, "notes.txt", "todo"));
    expect(complains(dir, /notes\.txt/)).toBe(true);
  });

  it("refuses content sitting where no loader looks", () => {
    // One directory deeper than `sprites/<family>/<name>.yaml`: it compiles
    // (the loader simply never sees it) and its author believes it is in the
    // game.
    const dir = copyOfExample((at) =>
      write(at, "sprites/greenhouse/old/creeper_0.yaml", "name: creeper_0\n"),
    );
    expect(complains(dir, /nothing is loaded this deep/)).toBe(true);
  });

  it("refuses an item under a rarity that does not exist", () => {
    const dir = copyOfExample((at) =>
      write(at, "items/rare/greenhouse_hoe.yaml", "id: greenhouse_hoe\n"),
    );
    expect(complains(dir, /not an item rarity/)).toBe(true);
  });

  it("requires a README, and refuses the scaffold's unwritten one", () => {
    const missing = copyOfExample((at) =>
      rmSync(path.join(at, "README.md"), { force: true }),
    );
    expect(complains(missing, /README\.md: missing/)).toBe(true);

    const unwritten = copyOfExample((at) =>
      write(at, "README.md", "# MY MOD\n\nTODO: describe your mod\n"),
    );
    expect(complains(unwritten, /README\.md: still carries/)).toBe(true);
  });

  it("refuses a file the manifest does not describe", () => {
    const dir = copyOfExample((at) =>
      undescribe(at, "sounds/greenhouse_saw_swing.yaml"),
    );
    expect(complains(dir, /does not describe "sounds\//)).toBe(true);
  });

  it("refuses a description of a file that is not there", () => {
    const dir = copyOfExample((at) =>
      writeFileSync(
        path.join(at, "mod.yaml"),
        `${readFileSync(path.join(at, "mod.yaml"), "utf8")}  - path: levels/ghost.yaml\n    summary: A venue that does not exist.\n`,
      ),
    );
    expect(
      complains(dir, /"levels\/ghost\.yaml" is not in the mod folder/),
    ).toBe(true);
  });

  it("refuses a summary too short to tell a player anything", () => {
    const dir = copyOfExample((at) => {
      const manifest = readFileSync(path.join(at, "mod.yaml"), "utf8").replace(
        /summary: The vault's floor plan[^\n]*/,
        "summary: A map",
      );
      writeFileSync(path.join(at, "mod.yaml"), manifest);
    });
    expect(complains(dir, /needs a summary/)).toBe(true);
  });

  it("refuses a manifest with no inventory at all", () => {
    const dir = copyOfExample((at) => {
      const manifest = readFileSync(path.join(at, "mod.yaml"), "utf8");
      writeFileSync(
        path.join(at, "mod.yaml"),
        manifest.slice(0, manifest.indexOf("contents:")),
      );
    });
    expect(complains(dir, /no contents: block/)).toBe(true);
  });

  it("still COMPILES a mod with no inventory, with a warning", () => {
    // The compiler is what the game runs at load, so a mod published before the
    // block existed must keep working — it just cannot say what it is.
    const dir = copyOfExample((at) => {
      const manifest = readFileSync(path.join(at, "mod.yaml"), "utf8");
      writeFileSync(
        path.join(at, "mod.yaml"),
        manifest.slice(0, manifest.indexOf("contents:")),
      );
    });
    const built = validateMod(dir, { catalog });
    expect(built.warnings.some((w) => /no contents: block/.test(w))).toBe(true);
  });
});

describe("packageMod", () => {
  it("writes an archive holding exactly what the manifest declares", () => {
    const out = path.join(
      mkdtempSync(path.join(tmpdir(), "gis-zip-")),
      "m.zip",
    );
    temps.push(path.dirname(out));
    const result = packageMod(EXAMPLE, { catalog, out });

    const entries = readZip(readFileSync(result.file));
    const names = entries.map((entry) => entry.name).sort();
    // One top-level folder named after the mod — what the game's own reader
    // looks for when it opens a zip (electron/src/mod-archive.ts).
    expect(names.every((name) => name.startsWith("greenhouse/"))).toBe(true);
    expect(names).toContain("greenhouse/mod.yaml");
    expect(names).toContain("greenhouse/README.md");
    expect(names.sort()).toEqual(
      result.entries.map((rel) => `greenhouse/${rel}`).sort(),
    );
    // And the bytes are the files, not a hopeful header.
    const manifest = entries.find((e) => e.name === "greenhouse/mod.yaml");
    expect(manifest?.data.toString("utf8")).toEqual(
      readFileSync(path.join(EXAMPLE, "mod.yaml"), "utf8"),
    );
  });

  it("leaves out the author's own files and the compiler's output", () => {
    const dir = copyOfExample((at) => {
      write(at, ".workshop-id", "123456");
      write(at, "mod.json", "{}");
    });
    const out = path.join(path.dirname(dir), "m.zip");
    const result = packageMod(dir, { catalog, out });
    expect(result.entries).not.toContain(".workshop-id");
    expect(result.entries).not.toContain("mod.json");
  });

  it("writes nothing at all when the folder does not pass", () => {
    const dir = copyOfExample((at) => write(at, "notes.txt", "todo"));
    const out = path.join(path.dirname(dir), "m.zip");
    expect(() => packageMod(dir, { catalog, out })).toThrow(ModPackageError);
    expect(existsSync(out)).toBe(false);
  });

  it("is reproducible — the same folder twice is the same bytes", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "gis-zip2-"));
    temps.push(parent);
    const a = packageMod(EXAMPLE, { catalog, out: path.join(parent, "a.zip") });
    const b = packageMod(EXAMPLE, { catalog, out: path.join(parent, "b.zip") });
    expect(readFileSync(a.file)).toEqual(readFileSync(b.file));
  });
});

/**
 * A zip reader, deliberately independent of the writer under test.
 *
 * Walking the CENTRAL DIRECTORY (rather than trusting the writer's own list) is
 * what makes this an assertion about the FILE: the shipped game reads an
 * archive exactly this way, so a header the writer got wrong fails here instead
 * of on a player's machine.
 */
function readZip(buffer: Buffer): { name: string; data: Buffer }[] {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x0605_4b50) eocd--;
  expect(eocd).toBeGreaterThanOrEqual(0);

  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(at)).toBe(0x0201_4b50);
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    expect(buffer.readUInt32LE(localOffset)).toBe(0x0403_4b50);
    const body =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(body, body + compressed);
    const data = method === 0 ? raw : inflateRawSync(raw);
    expect(data.length).toBe(size);
    entries.push({ name, data });
  }
  return entries;
}
