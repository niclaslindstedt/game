// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// PACKAGING A MOD — the folder, as a zip somebody else can drop into their
// game's `mods/` directory (see `cli.mjs where`).
//
// The reason this is a command rather than an instruction to select the folder
// and choose "Compress" is everything the archiver would happily put in the
// file: the `.DS_Store` the Finder just wrote, the `mod.json` the compiler
// left, the `.workshop-id` that names the author's OWN Workshop item, the
// layered source art nobody needs to download, the `.git` directory. A zip is
// forever once it is in somebody's hands, so what goes in it is decided from
// the manifest rather than from whatever the folder happens to contain:
//
//   the manifest, every file its `contents:` declares, and the sidecars that
//   are the author's to hand over — README, LICENSE, the Workshop thumbnail.
//
// Nothing else, ever. And because `contents:` is the list, a file the author
// forgot to describe cannot slip in unnoticed — the validator refuses first,
// naming it.
//
// The archive holds ONE top-level folder named after the mod's id, which is
// what the game's own reader looks for when it opens a zip
// (`electron/src/mod-archive.ts` → `modRoot`), and what makes unpacking it by
// hand land a tidy folder rather than forty loose files.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { MANIFEST } from "./layout.mjs";
import { packagedFiles, validateMod } from "./validate.mjs";
import { writeZip } from "./zip.mjs";

/** Thrown when the mod is not fit to package. Carries every finding, so one
 * round trip fixes the folder. */
export class ModPackageError extends Error {
  constructor(message, problems) {
    super(message);
    this.problems = problems;
  }
}

/**
 * Package a mod folder into a zip.
 *
 * @param modDir the folder holding `mod.yaml`
 * @param opts.catalog the parsed `mod/catalog.json` — the mod is COMPILED as
 *   part of the audit, so a package can never hold a mod that does not load
 * @param opts.out the archive to write; defaults to
 *   `<mod's parent>/<id>-<version>.zip`
 * @returns `{ file, entries, bytes, warnings }`
 */
export function packageMod(modDir, { catalog, out } = {}) {
  const audit = validateMod(modDir, { catalog });
  if (audit.errors.length > 0) {
    throw new ModPackageError(
      `${path.basename(modDir)} is not ready to package`,
      audit.errors,
    );
  }

  const manifest = parse(readFileSync(path.join(modDir, MANIFEST), "utf8"));
  const root = String(manifest.id);
  const names = packagedFiles(audit.files);
  const archive = writeZip(
    names.map((rel) => ({
      name: `${root}/${rel}`,
      data: readFileSync(path.join(modDir, rel)),
    })),
  );

  const file = out
    ? path.resolve(out)
    : path.join(
        path.dirname(path.resolve(modDir)),
        `${root}-${slug(String(manifest.version))}.zip`,
      );
  writeFileSync(file, archive);
  return {
    file,
    entries: names,
    bytes: archive.length,
    warnings: audit.warnings,
  };
}

/** A version string, made safe for a file name. */
function slug(version) {
  return (
    version.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "0"
  );
}
