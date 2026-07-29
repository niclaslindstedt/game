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
