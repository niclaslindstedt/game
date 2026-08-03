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

/**
 * Shared with native/app.config.js — one identity across every store, which
 * `make store-preflight` now pins so a rename cannot update one shell and miss
 * the other (it did once: the game became Ada's Trail and this line stayed
 * behind, which would have signed the macOS build under an id no store record
 * holds).
 */
const BUNDLE_ID = "se.niclaslindstedt.adastrail";

/**
 * WHAT THE PACKAGE IS STAMPED WITH.
 *
 * Three capabilities belong to the build rather than to the machine that runs
 * it, and they are read from the build environment (`ENABLE_MULTIPLAYER=1`
 * and friends, via the Makefile) and written into the packaged manifest, where
 * `electron/src/capabilities.ts` reads them back. Absent means OFF, here and
 * at the reading end both — a binary carries only what something deliberately
 * gave it.
 */
const enabled = (name) => process.env[`GIS_ENABLE_${name}`] === "1";
const STAMPED = process.env.GIS_STAMP_CAPABILITIES === "1";
const CAPABILITIES = {
  multiplayer: enabled("MULTIPLAYER"),
  mods: enabled("MODS"),
  portMap: enabled("UPNP"),
  licensed: enabled("LICENSED"),
};

/**
 * WHAT COMES OUT OF THE PACKAGER.
 *
 * `dir` is the default because a depot wants a directory of files and its own
 * client owns installing them. Anything distributed on its own needs the
 * opposite — a thing a person can download and open — so the `standalone`
 * profile switches every platform to its conventional installer/archive pair.
 */
const STANDALONE = process.env.GIS_PACKAGE_PROFILE === "standalone";
const MAC_ARCHES = (
  process.env.GIS_MAC_ARCH ?? (STANDALONE ? "x64,arm64" : "x64")
)
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

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

  // The capability stamp travels on the app's own manifest, so it is a fact
  // about the binary rather than about the environment it is started in. The
  // store link rides along from `game.config.json` for the same reason the
  // product name does — one place holds every brand string.
  // A packaging run that did not deliberately stamp itself leaves the field
  // OFF the manifest entirely rather than writing an all-on one. The absence
  // is what marks a developer build (`capabilities.ts`'s `isStamped`), so a
  // plain `npm run dist` out of somebody's tree says what it is instead of
  // passing for a release that happens to have everything enabled.
  extraMetadata: {
    ...(STAMPED ? { capabilities: CAPABILITIES } : {}),
    storeUrl: identity.steamUrl || "",
  },

  // Everything the app needs and nothing else. `webroot/` is the built site
  // (scripts/bundle-web.mjs); `dist/` is the compiled main process. The engine
  // and pwa sources are NOT here — they were compiled into the site already.
  files: ["dist/**/*", "webroot/**/*", "package.json", "!**/*.map"],

  // The game has no translated shell chrome. Chromium otherwise carries every
  // locale it supports, which is tens of megabytes of duplicate UI strings the
  // renderer never asks it to draw.
  electronLanguages: ["en"],

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
    {
      from: "../scripts/companion-data",
      to: "modtools/scripts/companion-data",
    },
    {
      from: "../scripts/difficulty-data",
      to: "modtools/scripts/difficulty-data",
    },
    { from: "../scripts/enemy-data", to: "modtools/scripts/enemy-data" },
    { from: "../scripts/item-data", to: "modtools/scripts/item-data" },
    { from: "../scripts/level-data", to: "modtools/scripts/level-data" },
    { from: "../scripts/map-data", to: "modtools/scripts/map-data" },
    { from: "../scripts/music-data", to: "modtools/scripts/music-data" },
    { from: "../scripts/powerup-data", to: "modtools/scripts/powerup-data" },
    { from: "../scripts/quest-data", to: "modtools/scripts/quest-data" },
    { from: "../scripts/set-data", to: "modtools/scripts/set-data" },
    { from: "../scripts/sound-data", to: "modtools/scripts/sound-data" },
    { from: "../scripts/story-data", to: "modtools/scripts/story-data" },
    { from: "../scripts/talent-data", to: "modtools/scripts/talent-data" },
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

    // THE SESSION SERVER — the engine, compiled for Node
    // (scripts/build-server.mjs). Outside the asar for a different reason from
    // the toolchain's: `utilityProcess.fork` starts a real Node child, and a
    // child's entry point has to be a real file on disk. Self-contained ESM
    // with its own manifest, so only the entry path is ever resolved
    // (electron/src/resources.ts) and Node finds the rest by relative import.
    { from: "server-dist", to: "server" },
  ],

  // The native binding cannot be read from inside an asar archive — the OS
  // loader needs a real file on disk to dlopen. Unpacking it is the standard
  // arrangement for any native module.
  asar: true,
  asarUnpack: ["**/node_modules/steamworks.js/**"],

  win: {
    target: STANDALONE
      ? [
          { target: "nsis", arch: "x64" },
          { target: "zip", arch: "x64" },
        ]
      : [{ target: "dir" }],
    files: [
      "!node_modules/steamworks.js/dist/linux64/**/*",
      "!node_modules/steamworks.js/dist/osx/**/*",
    ],
    extraFiles: STEAM_REDIST.win,
    // Unsigned is tolerated for a Steam-launched app (the client is the trust
    // boundary). Sign anyway if the binary is ever distributed outside Steam.
  },

  mac: {
    // Steam for macOS remains an Intel process, so a depot build is x64 only:
    // it serves Intel Macs directly and Apple Silicon through Rosetta without
    // carrying a second copy of Chromium in every player's download. A
    // standalone download has no Rosetta guarantee to lean on and is expected
    // to be native, so it ships both slices as separate artifacts.
    target: STANDALONE
      ? MAC_ARCHES.flatMap((arch) => [
          { target: "dmg", arch },
          { target: "zip", arch },
        ])
      : MAC_ARCHES.map((arch) => ({ target: "dir", arch })),
    icon: "../pwa/public/maskable-icon-512x512.png",
    files: [
      "!node_modules/steamworks.js/dist/linux64/**/*",
      "!node_modules/steamworks.js/dist/win64/**/*",
      // The Apple Silicon slice of the binding is dropped only when nothing
      // being built here needs it — excluding the slice a build IS for would
      // leave that app unable to load Steam at all.
      ...(MAC_ARCHES.includes("arm64")
        ? []
        : [
            "!node_modules/steamworks.js/dist/osx/steamworksjs.darwin-arm64.node",
          ]),
    ],
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
    target: STANDALONE
      ? [
          { target: "AppImage", arch: "x64" },
          { target: "tar.gz", arch: "x64" },
        ]
      : [{ target: "dir" }],
    files: [
      "!node_modules/steamworks.js/dist/osx/**/*",
      "!node_modules/steamworks.js/dist/win64/**/*",
    ],
    extraFiles: STEAM_REDIST.linux,
    category: "Game",
  },
};
