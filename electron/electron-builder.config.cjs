// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Packaging config for the desktop app.
//
// A `.cjs` config rather than the usual `electron-builder.yml` for one reason:
// brand identity is centralized in `game.config.json` (AGENTS.md — "Never
// re-hardcode a brand string elsewhere"), and only a JS config can read it. The
// bundle id is shared with the mobile app (native/app.config.js) so the game is
// one identity across every store it ships to.
//
// **The default target is `dir`, not an installer, because Steam does not want
// one.** Steam distributes by uploading a DIRECTORY of files to a depot, and
// its own client owns installing, updating and launching them. An NSIS or DMG
// installer inside a depot would ask the player to install a game they already
// installed. `dir` output (`release/<platform>-unpacked/`) is what steamcmd
// uploads; the installer targets stay available for any non-Steam distribution.
//
// Linux is built too, and deliberately: the Steam Deck runs Linux, so a native
// depot means the Deck plays the real binary rather than the Windows one under
// Proton. steamworks.js ships a prebuilt linux64 binding, so it costs nothing.

const identity = require("../game.config.json");
const { version } = require("../package.json");

/**
 * The packages the MOD TOOLCHAIN needs at runtime, read from its own manifest
 * rather than listed here.
 *
 * The toolchain ships outside the asar and is loaded by dynamic `import()`, so
 * it cannot resolve anything inside the archive — its dependencies have to be
 * copied out beside it. Which ones that is, is declared once in
 * `mod/package.json`, because the same list is needed by the desktop CI job,
 * and two hand-maintained lists that must agree is how the first version of
 * this broke. `tests/content/mod_toolchain_deps_test.ts` proves the manifest
 * matches what the toolchain actually imports.
 */
const MOD_TOOLCHAIN_DEPS = Object.keys(
  require("../mod/package.json").dependencies ?? {},
).map((pkg) => ({
  from: `../node_modules/${pkg}`,
  to: `modtools/node_modules/${pkg}`,
}));

/** Shared with native/app.config.js — one identity across every store. */
const BUNDLE_ID = "se.niclaslindstedt.goneinspace";

/**
 * The Steam redistributable that each platform's binding needs beside the
 * executable. steamworks.js ships these inside its own package; the native
 * `.node` addon links against them at load time, so they must sit next to the
 * app binary rather than inside the asar.
 *
 * NOTE: this is the piece most likely to need adjusting on a real build
 * machine — `to` is relative to the app's resources root, which differs across
 * platforms (macOS buries the executable in `Contents/MacOS`). Verify the app
 * launches with Steam running before trusting it; a wrong path shows up as
 * `steam: unavailable` in the log rather than as a crash, because steam.ts
 * degrades instead of throwing.
 */
const STEAM_REDIST = {
  win: [
    { from: "node_modules/steamworks.js/dist/win64/steam_api64.dll", to: "." },
  ],
  mac: [
    { from: "node_modules/steamworks.js/dist/osx/libsteam_api.dylib", to: "." },
  ],
  linux: [
    {
      from: "node_modules/steamworks.js/dist/linux64/libsteam_api.so",
      to: ".",
    },
  ],
};

module.exports = {
  appId: BUNDLE_ID,
  productName: identity.title,
  copyright: `Copyright © ${new Date().getFullYear()} ${identity.author.name}`,
  buildVersion: version,

  directories: {
    output: "release",
    buildResources: "build",
  },

  // Everything the app needs and nothing else. `webroot/` is the built site
  // (scripts/bundle-web.mjs); `dist/` is the compiled main process. The engine
  // and pwa sources are NOT here — they were compiled into the site already.
  files: ["dist/**/*", "webroot/**/*", "package.json", "!**/*.map"],

  // THE MOD TOOLCHAIN, carried in from outside `electron/`.
  //
  // The compiler runs in the MAIN process at load — that is the security
  // boundary, the reason the renderer never sees a mod's YAML — so it has to
  // ship. It cannot go in `files` because these paths are above this directory,
  // and it must NOT go inside the asar: it is loaded by dynamic `import()`,
  // which resolves real files on disk rather than asar entries.
  //
  // What travels is exactly what the compiler reaches: `mod/tools` and the
  // reference catalog, plus the game's own loaders and validators under
  // `scripts/`, which are the SAME modules the shipped content pipeline uses.
  // Copying them rather than vendoring a second copy is what keeps one schema.
  // The tree MIRRORS the repo's layout under `modtools/`, and that is not
  // neatness: every one of these modules finds its neighbours by relative
  // path (`../../scripts/…`, `new URL("../../content", import.meta.url)`), so
  // a flattened copy would resolve to nothing. Its npm dependencies ride along
  // for the same reason (see MOD_TOOLCHAIN_DEPS above).
  extraResources: [
    { from: "../mod/tools", to: "modtools/mod/tools" },
    { from: "../mod/catalog.json", to: "modtools/mod/catalog.json" },
    { from: "../scripts/asset-tools", to: "modtools/scripts/asset-tools" },
    { from: "../scripts/enemy-data", to: "modtools/scripts/enemy-data" },
    { from: "../scripts/item-data", to: "modtools/scripts/item-data" },
    { from: "../scripts/level-data", to: "modtools/scripts/level-data" },
    { from: "../scripts/sound-data", to: "modtools/scripts/sound-data" },
    // The ladder and the loot economy: the compiler reads them so a mod's
    // `savage` and a shipped `savage` mean the same thing.
    { from: "../content/ladder.yaml", to: "modtools/content/ladder.yaml" },
    {
      from: "../content/item_quality.yaml",
      to: "modtools/content/item_quality.yaml",
    },
    {
      from: "../content/item_rarity.yaml",
      to: "modtools/content/item_rarity.yaml",
    },
    ...MOD_TOOLCHAIN_DEPS,
  ],

  // The native binding cannot be read from inside an asar archive — the OS
  // loader needs a real file on disk to dlopen. Unpacking it is the standard
  // arrangement for any native module.
  asar: true,
  asarUnpack: ["**/node_modules/steamworks.js/**"],

  win: {
    target: [{ target: "dir" }],
    extraFiles: STEAM_REDIST.win,
    // Unsigned is tolerated for a Steam-launched app (the client is the trust
    // boundary). Sign anyway if the binary is ever distributed outside Steam.
  },

  mac: {
    // One depot for both Apple Silicon and Intel — the arch belongs on the
    // target entry, not on this block.
    target: [{ target: "dir", arch: "universal" }],
    extraFiles: STEAM_REDIST.mac,
    category: "public.app-category.action-games",
    // Gatekeeper blocks an un-notarized app even when Steam launches it, so a
    // real macOS release needs a Developer ID certificate and notarization.
    // Both need credentials that cannot live in the repo — see README.md.
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
  },

  linux: {
    target: [{ target: "dir" }],
    extraFiles: STEAM_REDIST.linux,
    category: "Game",
  },
};
