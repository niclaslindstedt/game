// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE MOD TOOLCHAIN NEEDS BESIDE IT, declared once for both desktop
// shells.
//
// The compiler is not part of any shell: `mod/tools/` lives at the repo's top
// level, imports the game's own loaders and validators out of `scripts/`, reads
// three authored catalogs out of `content/`, and is shared verbatim with the
// CLI a modder runs. That is the whole point — ONE compiler, so "it works in my
// mod" and "it works in the game" mean the same thing — and it means the files
// sit outside both `electron/` and `tauri/` and have to be carried into each
// package deliberately.
//
// **THE TREE MIRRORS THE REPO'S LAYOUT, and that is not neatness**: every one
// of these modules finds its neighbours by relative path (`../../scripts/…`,
// `new URL("../../content", import.meta.url)`), so a flattened copy would
// resolve to nothing. Only the root differs — `modtools/` inside whichever
// package is being built.
//
// **AND IT IS ONE LIST BECAUSE TWO WOULD DRIFT.** Both shells package the same
// compiler; a loader added for a new catalog and carried into only one of them
// is a mod that compiles on one desktop build and not the other, with nothing
// anywhere reporting it. `electron/electron-builder.config.cjs` and
// `tauri/scripts/package.mjs` both read this file, and
// `tests/content/mod_toolchain_deps_test.ts` holds `mod/package.json` — the npm
// half of the same question — to what the toolchain actually imports.
//
// A CommonJS module rather than JSON so it can carry these comments, and rather
// than ESM so the Electron config (which is `.cjs` and has no top-level await)
// can `require` it directly. The Tauri packager reaches it through
// `createRequire`.
//
// Paths are relative to the REPOSITORY ROOT. Each shell prefixes its own way.

module.exports = [
  // The compiler and the reference catalog it validates against.
  { from: "mod/tools", to: "modtools/mod/tools" },
  { from: "mod/catalog.json", to: "modtools/mod/catalog.json" },

  // The game's own loaders and schemas, copied rather than vendored a second
  // time — which is what keeps one schema per catalog.
  { from: "scripts/asset-tools", to: "modtools/scripts/asset-tools" },
  { from: "scripts/companion-data", to: "modtools/scripts/companion-data" },
  { from: "scripts/difficulty-data", to: "modtools/scripts/difficulty-data" },
  { from: "scripts/enemy-data", to: "modtools/scripts/enemy-data" },
  // THE HUD, which a mod may replace outright — its loader travels for the
  // same reason every other one here does: the compiler reads a mod's `hud/`
  // folder with the game's own loader and schema.
  { from: "scripts/hud-data", to: "modtools/scripts/hud-data" },
  { from: "scripts/item-data", to: "modtools/scripts/item-data" },
  { from: "scripts/level-data", to: "modtools/scripts/level-data" },
  { from: "scripts/map-data", to: "modtools/scripts/map-data" },
  // THE RUN'S OWN WINDOWS, which a mod may replace like the HUD. ONE FILE
  // rather than the folder it sits in, and deliberately: `scripts/menu-data/`
  // also holds the TITLE menu's loader, which is the one catalog a mod may not
  // ship — and a toolchain that carries a loader it must never call is a
  // toolchain inviting somebody to call it.
  {
    from: "scripts/menu-data/load-ingame-yaml.mjs",
    to: "modtools/scripts/menu-data/load-ingame-yaml.mjs",
  },
  { from: "scripts/music-data", to: "modtools/scripts/music-data" },
  { from: "scripts/powerup-data", to: "modtools/scripts/powerup-data" },
  { from: "scripts/quest-data", to: "modtools/scripts/quest-data" },
  { from: "scripts/script-data", to: "modtools/scripts/script-data" },
  { from: "scripts/set-data", to: "modtools/scripts/set-data" },
  { from: "scripts/sound-data", to: "modtools/scripts/sound-data" },
  { from: "scripts/story-data", to: "modtools/scripts/story-data" },
  { from: "scripts/talent-data", to: "modtools/scripts/talent-data" },

  // The ladder and the loot economy: the compiler reads them so a mod's
  // `savage` and a shipped `savage` mean the same thing.
  { from: "content/ladder.yaml", to: "modtools/content/ladder.yaml" },
  {
    from: "content/item_quality.yaml",
    to: "modtools/content/item_quality.yaml",
  },
  { from: "content/item_rarity.yaml", to: "modtools/content/item_rarity.yaml" },
];
