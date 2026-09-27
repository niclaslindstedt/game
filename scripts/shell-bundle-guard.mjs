// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAST CHECK BEFORE A WEBROOT GOES INTO A STORE APP: it names nobody.
//
// Owner decision D17, and strictly so: the phone app (native/, the zipped
// webroot it embeds) and the desktop app (tauri/, its copied webroot) carry no
// link back to the source — no repository, issues, releases, sponsor or
// author page, no web-edition domain — and the domain owner's name appears in
// them in no form at all. The build takes those out at build time
// (`shellIdentity` in pwa/pwa-plugin.ts, `VITE_SHELL_BUILD=on`); this is what
// makes a regression a refused bundle instead of a shipped one.
//
// A BYTE search over every file, not a text grep: a JS chunk, a JSON manifest,
// a font or a PNG's text chunk all count, and a file a text tool calls
// "binary" is exactly where a string slips past one. Shared by
// native/scripts/bundle-web.mjs and tauri/scripts/bundle-web.mjs so the two
// shells cannot disagree about what "clean" means.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** The string no store bundle may contain, in any file, in any form. */
export const FORBIDDEN = "niclaslindstedt";

const NEEDLE = Buffer.from(FORBIDDEN, "utf8");

/**
 * The paths (forward-slashed, relative to the root) whose bytes contain
 * `FORBIDDEN`, from a `{ "path": bytes }` map — the shape the phone bundle
 * zips.
 *
 * @param {Record<string, Uint8Array>} files
 * @returns {string[]}
 */
export function offendingFiles(files) {
  return Object.entries(files)
    .filter(([, bytes]) =>
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
        NEEDLE,
      ),
    )
    .map(([path]) => path)
    .sort();
}

/**
 * The same over a directory on disk — the shape the desktop bundle copies.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function offendingFilesIn(dir) {
  const files = {};
  const walk = (at) => {
    for (const entry of readdirSync(at)) {
      const abs = join(at, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else files[relative(dir, abs).split("\\").join("/")] = readFileSync(abs);
    }
  };
  walk(dir);
  return offendingFiles(files);
}

/**
 * Print why and exit non-zero when `offending` is not empty. `what` names the
 * bundle in the message ("the phone webroot", "the desktop webroot").
 *
 * @param {string[]} offending
 * @param {string} what
 */
export function refuseIfNamed(offending, what) {
  if (offending.length === 0) return;
  const shown = offending.slice(0, 20).map((p) => `    ${p}`);
  if (offending.length > shown.length) {
    shown.push(`    … and ${offending.length - shown.length} more`);
  }
  console.error(
    [
      `✗ refusing ${what}: ${offending.length} file(s) contain "${FORBIDDEN}".`,
      "  A store build links to no source, repository, author page or web-edition",
      "  domain (D17). Build it with VITE_SHELL_BUILD=on — this script does, so a",
      "  --skip-build over a plain website build is the usual cause — and clear the",
      "  source of any new occurrence at build time (see shellIdentity in",
      "  pwa/pwa-plugin.ts):",
      ...shown,
    ].join("\n"),
  );
  process.exit(1);
}
