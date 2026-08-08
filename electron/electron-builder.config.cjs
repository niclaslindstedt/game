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
/**
 * THE MOD TOOLCHAIN'S FILES, declared once for both desktop shells —
 * `scripts/modtools-manifest.cjs` carries the list and the argument for it.
 */
const MODTOOLS = require("../scripts/modtools-manifest.cjs");

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
 * Four capabilities belong to the build rather than to the machine that runs
 * it, and they are read from the build environment (`ENABLE_MULTIPLAYER=1`
 * and friends, via the Makefile) and written into the packaged manifest, where
 * `electron/src/capabilities.ts` reads them back. Absent means OFF, here and
 * at the reading end both — a binary carries only what something deliberately
 * gave it.
 *
 * VOICE is the newest and the one most worth being deliberate about: it opens
 * the player's microphone and makes the host relay every speaker to every
 * listener. The depot build ships with it (`make desktop-steam`); a plain
 * download does not unless somebody asks (`make desktop-dist`).
 */
const enabled = (name) => process.env[`GIS_ENABLE_${name}`] === "1";
const STAMPED = process.env.GIS_STAMP_CAPABILITIES === "1";
const CAPABILITIES = {
  multiplayer: enabled("MULTIPLAYER"),
  mods: enabled("MODS"),
  portMap: enabled("UPNP"),
  voice: enabled("VOICE"),
  licensed: enabled("LICENSED"),
};

/**
 * WHAT COMES OUT OF THE PACKAGER.
 *
 * `dir` is the default because a depot wants a directory of files and its own
 * client owns installing them. The `standalone` profile is for a download
 * instead, and it produces ARCHIVES on every platform rather than installers.
 *
 * That is a deliberate narrowing rather than a shortcut. An installer is a
 * promise this project cannot keep unsigned: an unsigned NSIS setup trips
 * SmartScreen, an un-notarized DMG is refused outright by Gatekeeper, and an
 * AppImage cannot even be NAMED here (electron-builder refuses the apostrophe
 * in the product name for a file path). An archive has none of those problems,
 * is what a player who wants a portable copy actually wants, and is honest
 * about what it is — so when the signing credentials exist, installers come
 * back as an addition rather than as a fix.
 */
/** The app bundle's name — the brand with its apostrophe removed. Derived
 * rather than written out, so a rename still travels from `game.config.json`
 * like every other brand string. */
const PRODUCT_NAME = identity.title.replace(/['\u2019]/g, "");

/** What the executable is called on the platforms where it is a COMMAND: one
 * lowercase word, no spaces, nothing to quote. */
const EXECUTABLE_NAME = PRODUCT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "");

const STANDALONE = process.env.GIS_PACKAGE_PROFILE === "standalone";
const MAC_ARCHES = (
  process.env.GIS_MAC_ARCH ?? (STANDALONE ? "x64,arm64" : "x64")
)
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

/**
 * WHO SIGNS THE macOS BUILD — and why an UNSIGNED one is not an option.
 *
 * Apple Silicon does not merely distrust unsigned arm64 code, it refuses to
 * EXECUTE it: every arm64 binary must carry a signature for the kernel to map
 * it at all. macOS reports that refusal to the player as *"'Adas Trail.app' is
 * damaged and can't be opened"* — the same wording it uses for a corrupted
 * download, which is what made the first arm64 release look like a broken zip
 * rather than a missing signature. x86_64 has no such rule, which is exactly
 * why the Intel slice ran (under Rosetta, slowly) while the native one died on
 * launch. Leaving the app unsigned therefore ships a macOS build that only
 * ever worked by accident.
 *
 * So the mac build ALWAYS signs, and the only question is with what:
 *
 *   - With a **Developer ID Application** certificate when one is provided
 *     (`CSC_LINK`/`CSC_KEY_PASSWORD`, or a name in `GIS_MAC_IDENTITY`). That is
 *     the real thing: with `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
 *     `APPLE_TEAM_ID` set too, electron-builder notarizes on the way out and
 *     Gatekeeper lets the download open with no ceremony at all.
 *   - **Ad hoc** (`identity: "-"`) otherwise, which is what an ordinary CI run
 *     and any developer build gets. An ad-hoc signature satisfies the kernel —
 *     the app RUNS, natively, at full speed — but it is nobody's identity, so a
 *     downloaded copy still meets Gatekeeper's unidentified-developer prompt
 *     and needs one trip through System Settings → Privacy & Security. That is
 *     a prompt the player can answer; "damaged" is not.
 *
 * An ad-hoc signature cannot be timestamped (there is no certificate for a
 * timestamp to outlive), so the timestamp is switched off on that path;
 * `codesign` fails outright if asked for one. It stays ON for a real identity,
 * where notarization requires it.
 *
 * The hardened runtime is on for both, and the entitlements it needs — the JIT
 * pair, and `disable-library-validation` for Valve's unsigned `libsteam_api`
 * and steamworks.js' addon — are already in `build/entitlements.mac.plist`.
 * Ad-hoc signing without that last one launches to an immediate dyld failure.
 */
const MAC_IDENTITY =
  process.env.GIS_MAC_IDENTITY ||
  (process.env.CSC_LINK || process.env.CSC_NAME ? undefined : "-");
const MAC_ADHOC = MAC_IDENTITY === "-";

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
  // THE APP'S NAME ON DISK, and deliberately not `identity.title` verbatim.
  //
  // The brand is "Ada's Trail" and stays that everywhere a person READS it —
  // the window title, the store pages, the site. This is the name given to a
  // FILE, and an apostrophe in a file path is a running argument with every
  // packager and shell there is: electron-builder refuses it outright for an
  // AppImage, and everything else that accepts it hands the player a path they
  // have to quote. So the bundle drops the punctuation and keeps the words.
  //
  // macOS shows this one (`Adas Trail.app`, which is what a player sees in
  // Finder and the Dock); Windows and Linux name their executable `adastrail`
  // below, because a command somebody types should be one lowercase word.
  productName: PRODUCT_NAME,
  copyright: `Copyright © ${new Date().getFullYear()} ${identity.author.name}`,
  buildVersion: version,

  directories: {
    output: "release",
    buildResources: "build",
  },

  // NAMED FROM THE PACKAGE NAME rather than the product name, because the
  // product name has an apostrophe in it and a file path may not. Spelled out
  // rather than left to the per-target defaults so every download reads the
  // same way and carries its platform and architecture on its face.
  artifactName: `${EXECUTABLE_NAME}-\${version}-\${os}-\${arch}.\${ext}`,

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
    // THE GAME'S version, not the shell package's. `electron/` keeps its own
    // manifest version and nothing updates it, so a download named after it
    // would claim a number no release ever had.
    version,
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
    // The loaders, the schemas and the three authored catalogs the compiler
    // reads — ONE list, shared with `tauri/scripts/package.mjs`, because two
    // shells carrying two copies of it is how a loader lands in one desktop
    // build and not the other with nothing anywhere reporting it. Paths in the
    // manifest are relative to the REPO ROOT; this config's are relative to
    // `electron/`.
    ...MODTOOLS.map(({ from, to }) => ({ from: `../${from}`, to })),
    // The Lua VM, compiled (scripts/build-lua.mjs). The script validator IS the
    // engine's own interpreter and this process has no TypeScript, so the
    // compiled copy has to travel beside the toolchain that imports it. Staged
    // INSIDE this tree rather than at the repo root, which is why it is not in
    // the shared manifest.
    { from: "modtools-lua", to: "modtools/lua-vm" },
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
    executableName: EXECUTABLE_NAME,
    target: STANDALONE ? [{ target: "zip", arch: "x64" }] : [{ target: "dir" }],
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
    target: MAC_ARCHES.map((arch) => ({
      target: STANDALONE ? "zip" : "dir",
      arch,
    })),
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
    // THE MICROPHONE PROMPT'S SENTENCE, and it is stamped into EVERY macOS
    // build rather than only into one carrying the voice capability.
    //
    // That is not belt-and-braces: on macOS a process that reaches for a
    // device whose usage string is missing is not refused, it is KILLED by TCC
    // — so a build where the key is absent and the capability is somehow on
    // would exit the moment somebody pressed talk, with no dialog and nothing
    // in the log. The key costs a build without voice nothing at all (the
    // prompt only ever appears when something asks for the device, and
    // `main.ts` refuses to ask without the capability), whereas getting the
    // pairing wrong costs a crash that reproduces on exactly one platform.
    extendInfo: {
      NSMicrophoneUsageDescription:
        "Ada's Trail uses your microphone for voice chat with the other " +
        "players in your multiplayer session. Nothing is recorded or stored, " +
        "and your microphone stays off until you turn voice chat on.",
    },
    // NEVER unsigned — an unsigned arm64 app cannot run at all. See
    // MAC_IDENTITY above for what each value means and what the player sees.
    identity: MAC_IDENTITY,
    ...(MAC_ADHOC ? { timestamp: "none", notarize: false } : {}),
    // Gatekeeper still asks about an ad-hoc signature, so a frictionless macOS
    // release wants a Developer ID certificate and notarization on top. Both
    // need credentials that cannot live in the repo — see README.md.
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
  },

  linux: {
    executableName: EXECUTABLE_NAME,
    target: STANDALONE
      ? [{ target: "tar.gz", arch: "x64" }]
      : [{ target: "dir" }],
    files: [
      "!node_modules/steamworks.js/dist/osx/**/*",
      "!node_modules/steamworks.js/dist/win64/**/*",
    ],
    extraFiles: STEAM_REDIST.linux,
    category: "Game",
  },
};
