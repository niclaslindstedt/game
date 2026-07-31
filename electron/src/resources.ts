// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FINDING THE MOD TOOLCHAIN, in both shapes this app takes.
//
// The mod compiler is not part of the shell: it lives at the repo's top level
// in `mod/tools/`, imports the game's own loaders and validators out of
// `scripts/`, and is shared verbatim with the CLI a modder runs. That is the
// whole point — one compiler, so "it works in my mod" and "it works in the
// game" mean the same thing — but it means the files sit OUTSIDE `electron/`
// and have to be carried into the package deliberately.
//
// `electron-builder` copies them to `resources/modtools/` (see the
// `extraResources` block in electron-builder.config.cjs), so there are exactly
// two layouts to resolve between:
//
//   a checkout      <repo>/mod/tools/…                — `electron .`, the tests
//   a packaged app  <resources>/modtools/mod/tools/…  — what a player runs
//
// The packaged tree MIRRORS the repo's layout rather than flattening it,
// because every module in there finds its neighbours by relative path
// (`../../scripts/…`, `new URL("../../content", …)`). Only the root differs.
//
// They cannot be told apart by looking for a file, because a developer running
// the packaged app has both. `app.isPackaged` is the only honest answer, and
// it is why this is a module rather than a constant.

import path from "node:path";

import { app } from "electron";

/**
 * A file inside the mod toolchain, by its path relative to `mod/tools/`.
 * (`modToolsPath("../catalog.json")` reaches the reference catalog, which sits
 * beside `tools/` in both layouts.)
 */
export function modToolsPath(file: string): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "modtools", "mod", "tools")
    : path.join(__dirname, "..", "..", "mod", "tools");
  return path.join(root, file);
}

/**
 * The session server's entry point — what `utilityProcess.fork` is given.
 *
 * The SECOND thing outside the asar, and it is here for a different reason
 * from the mod toolchain: not because it is shared with a CLI, but because it
 * is a separate PROCESS. A `utilityProcess` is a real Node child, so its entry
 * has to be a real file on disk — the same rule that forces `steamworks.js`'s
 * native binding to be unpacked.
 *
 * Two layouts again, and unlike the toolchain's they are not the same tree in
 * two places: the compiled output lives beside the shell in a checkout
 * (`electron/server-dist/`, written by `scripts/build-server.mjs`) and under
 * the resources root when packaged. `app.isPackaged` is the only honest way to
 * tell them apart, exactly as above.
 *
 * The compiled tree is self-contained ESM with its own `package.json`, so
 * nothing here has to resolve anything inside it — the one path is the entry,
 * and Node finds the rest by relative import from there.
 */
export function serverEntryPath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..", "server-dist");
  return path.join(root, "server", "main.js");
}
