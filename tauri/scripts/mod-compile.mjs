#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD COMPILER, AS A PROCESS — the adapter the Rust shell reaches
// `mod/tools/build.mjs` through.
//
// There is ONE mod compiler, shared verbatim with the CLI a modder runs, so
// that "it works in my mod" and "it works in the game" mean the same thing.
// Electron's main process is Node and simply `import()`s it; this shell is Rust
// and cannot, so the compiler is spawned and what crosses is JSON.
//
// **IT IS SHELL CODE RATHER THAN SDK CODE**, which is why it lives here and not
// under `mod/`. The SDK's own `cli.mjs` is written for a person at a terminal —
// it prints prose, writes files and exits non-zero — and a machine mode bolted
// onto it would be a shell concern leaking into a published tool. What a Rust
// process needs is a list of folders in and one JSON document out, and that is
// all this is.
//
// THREE RULES, and each is a failure mode rather than a preference:
//
//   * **STDOUT IS THE PROTOCOL.** Every diagnostic goes to stderr, because a
//     stray `console.log` here is an unparseable answer and a mods list that
//     silently comes back empty.
//   * **ONE INVOCATION FOR THE WHOLE LIST.** Reading the reference catalog is
//     the expensive part; a spawn per mod would pay it once per mod.
//   * **A MOD THAT THROWS IS STILL A ROW.** The compiler throwing rather than
//     reporting is a bug in US, not in the mod — and it must not take the other
//     eleven mods down with it, so each folder is compiled inside its own
//     try/catch and the failure becomes that row's error.
//
// Usage — a job on stdin, an answer on stdout:
//   { "tools": "<abs>/mod/tools", "catalog": "<abs>/mod/catalog.json",
//     "folders": ["<abs>/mods/greenhouse", …] }
//   { "results": [ { "folder": "…", "bundle": {…}|null, "errors": ["…"] } ] }

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

main();

async function main() {
  const job = readJob();
  const folders = Array.isArray(job.folders) ? job.folders : [];
  if (folders.length === 0) {
    answer([]);
    return;
  }

  let buildMod;
  let catalog;
  try {
    // A path as an ESM-importable URL. Windows paths are not valid URLs, and a
    // dynamic import of `C:\…` fails with a message about protocols.
    const tools = (file) => pathToFileURL(path.join(job.tools, file)).href;
    ({ buildMod } = await import(tools("build.mjs")));
    const { readCatalog } = await import(tools("catalog-read.mjs"));
    catalog = readCatalog(job.catalog);
  } catch (err) {
    // The toolchain itself is missing or broken, which is a fact about the
    // BUILD rather than about any mod — so every folder gets the same reason
    // and the MODS screen says something true instead of nothing.
    answer(
      folders.map((folder) => ({
        folder,
        bundle: null,
        errors: [describe(err)],
      })),
    );
    return;
  }

  answer(
    folders.map((folder) => {
      try {
        const { bundle, errors } = buildMod(folder, catalog);
        return { folder, bundle: bundle ?? null, errors: errors ?? [] };
      } catch (err) {
        return { folder, bundle: null, errors: [describe(err)] };
      }
    }),
  );
}

/** The job, off stdin. A malformed one compiles nothing rather than guessing. */
function readJob() {
  try {
    // Read descriptor 0 whole: the shell writes one document and closes the
    // pipe, so there is nothing to stream and nothing to wait for twice.
    return JSON.parse(readFileSync(0, "utf8"));
  } catch (err) {
    process.stderr.write(`mod-compile: unreadable job — ${describe(err)}\n`);
    return {};
  }
}

function answer(results) {
  process.stdout.write(`${JSON.stringify({ results })}\n`);
}

function describe(err) {
  return err instanceof Error ? err.message : String(err);
}
