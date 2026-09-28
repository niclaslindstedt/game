#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEPENDENCY LICENCE CHECK — every package in every lockfile, against one
// allow-list.
//
// The game is three dependency trees (the root workspace, the phone shell in
// native/, the desktop shell's tooling in tauri/), and npm records each
// package's declared licence in its lockfile. So this reads the lockfiles —
// no install, no network, nothing a fresh clone lacks — and fails on any
// package whose licence is not on the list below, or that declares none.
//
// The list has two tiers, because what a licence asks depends on whether the
// package reaches a player:
//
//   ALLOWED     permissive licences, and the ones whose conditions shipping an
//               unmodified package already meets (MPL-2.0 is file-level; the
//               CC-BY data sets ask for attribution the package carries)
//   BUILD_ONLY  allowed only for a package the lockfile marks `dev` — a build
//               tool that never ships in the game (sharp's libvips, LGPL)
//
// An SPDX expression is read the way it is meant: `A OR B` passes when either
// does, `A AND B` only when both do. A new licence is a decision to add here
// on purpose, with its reason — never to widen a pattern.
//
//   node scripts/check-licences.mjs            # check, print a summary
//   node scripts/check-licences.mjs --verbose  # …and every licence's count
//   make licences

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCKFILES = [
  "package-lock.json",
  "native/package-lock.json",
  "tauri/package-lock.json",
];

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "BlueOak-1.0.0",
  "Unlicense",
  "CC0-1.0",
  "Python-2.0",
  // caniuse-lite: browser-support data, attribution carried in the package.
  "CC-BY-4.0",
  // lightningcss and friends: file-level copyleft, met by shipping unmodified.
  "MPL-2.0",
]);
const BUILD_ONLY = new Set(["LGPL-3.0-or-later"]);

const USAGE = `usage: node scripts/check-licences.mjs [--verbose]

Checks the declared licence of every package in ${LOCKFILES.join(", ")}
against the allow-list in this script. Exits 1 on a package whose licence is
not allowed (or not declared), 2 on a bad flag.

  --verbose   print how many packages carry each licence
  --help      this text`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = args.filter((a) => a !== "--verbose");
if (unknown.length) {
  console.error(
    `check-licences: unknown option ${unknown.join(" ")}\n\n${USAGE}`,
  );
  process.exit(2);
}
const verbose = args.includes("--verbose");

/** Whether one SPDX id is acceptable for a package (`dev` = build-only). */
const allowedId = (id, dev) => ALLOWED.has(id) || (dev && BUILD_ONLY.has(id));

/** Whether an SPDX expression is acceptable: OR needs one side, AND both. */
function allowedExpression(expression, dev) {
  const bare = expression.replace(/[()]/g, " ").trim();
  return bare
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative.split(/\s+AND\s+/).every((id) => allowedId(id.trim(), dev)),
    );
}

const refused = [];
const counts = new Map();
let checked = 0;

for (const lockfile of LOCKFILES) {
  const file = join(ROOT, lockfile);
  if (!existsSync(file)) {
    refused.push(
      `${lockfile}: missing — every package.json commits its lockfile`,
    );
    continue;
  }
  const { packages = {} } = JSON.parse(readFileSync(file, "utf8"));
  for (const [where, pkg] of Object.entries(packages)) {
    // The root entry and workspace members are this game's own code.
    if (!where.includes("node_modules/") || pkg.link) continue;
    checked += 1;
    const licence =
      typeof pkg.license === "object" ? pkg.license?.type : pkg.license;
    const name = `${lockfile}: ${where.slice(where.lastIndexOf("node_modules/") + 13)}@${pkg.version}`;
    if (!licence) {
      refused.push(`${name} declares no licence`);
      continue;
    }
    counts.set(licence, (counts.get(licence) ?? 0) + 1);
    if (!allowedExpression(licence, Boolean(pkg.dev))) {
      refused.push(
        `${name} is ${licence}${pkg.dev ? "" : " (ships: not a dev dependency)"}`,
      );
    }
  }
}

console.log(
  `check-licences: read ${LOCKFILES.length} lockfiles, ${checked} packages`,
);
if (verbose) {
  for (const [licence, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${licence}`);
  }
}
if (refused.length) {
  console.error(`check-licences: ${refused.length} package(s) not allowed:`);
  for (const line of refused) console.error(`  ✗ ${line}`);
  process.exit(1);
}
console.log("check-licences: every licence is on the allow-list");
