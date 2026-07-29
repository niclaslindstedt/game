// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// Reading `mod/catalog.json` back — its own module because BOTH sides need it
// and they have nothing else in common: the CLI reads it out of the repo, and
// the shipped desktop app reads the copy packaged beside its compiled main
// process. Neither should have to know the file's shape.

import { readFileSync } from "node:fs";

/** The format this compiler understands. A catalog from a newer game than the
 * compiler reading it is refused rather than half-understood — the id sets
 * would parse fine and the MEANING would have moved. */
export const CATALOG_FORMAT = 1;

/**
 * Parse a reference catalog, failing loudly on anything unusable. Throws
 * rather than returning a finding: without a catalog there is no compile at
 * all, so this is not one of the problems a mod author can fix in their mod.
 */
export function readCatalog(file) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(
      `could not read the reference catalog at ${file} — ${e.message}. ` +
        "Regenerate it with `node mod/tools/catalog.mjs`.",
      { cause: e },
    );
  }
  if (catalog.formatVersion !== CATALOG_FORMAT) {
    throw new Error(
      `reference catalog is format ${catalog.formatVersion}, this tool ` +
        `understands ${CATALOG_FORMAT} — update the game or the tool, ` +
        "whichever is older.",
    );
  }
  return catalog;
}
