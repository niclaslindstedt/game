// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared helper for the `update-*-snapshot.mjs` scripts: write a content
// snapshot as canonical, PRETTIER-FORMATTED JSON.
//
// The formatting is the point. `JSON.stringify(v, null, 2)` and Prettier
// disagree about short arrays — the former always expands them one element per
// line, the latter collapses any that fit — so a raw-stringified snapshot is
// valid, stable, sorted, and STILL fails `make fmt-check`. That failure lands
// on whoever next accepts an intentional content change, at CI time, with
// nothing in the diff to suggest formatting had anything to do with it. Running
// the output through Prettier here means the snapshot a script writes is the
// snapshot the repo wants, and the trap is gone for every catalog at once.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { format } from "prettier";

/**
 * Canonicalize a value for snapshotting: object keys sorted at every depth, so
 * the file is stable regardless of the order a roster or a YAML tree happens to
 * enumerate its entries. Arrays keep their order — it is data.
 */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort())
      out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/**
 * Write `value` to `path` as Prettier-formatted JSON, creating the directory if
 * needed. `JSON.parse(JSON.stringify(...))` first, so a live catalog's
 * `undefined`s and prototypes are dropped.
 *
 * `sort` (default true) canonicalizes key order. The LEVEL snapshot passes
 * false: its top level is an authored reading order (`order`, `secret`, `defs`)
 * rather than a catalog, and sorting it would rewrite the whole file for no
 * reason on the first run.
 */
export async function writeSnapshot(path, value, { sort = true } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const plain = JSON.parse(JSON.stringify(value));
  const formatted = await format(
    JSON.stringify(sort ? sortKeys(plain) : plain, null, 2),
    { parser: "json", filepath: path },
  );
  writeFileSync(path, formatted);
}
