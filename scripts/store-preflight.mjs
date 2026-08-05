#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STORE PREFLIGHT — is this checkout actually wired up to ship?
//
// Everything the submission pipelines need that ISN'T code lives in places a
// repo can't hold: the app records (App Store Connect's numeric id and team,
// Steamworks' app and depot ids), the credentials that talk to them
// (native/.env, an App Store Connect API key), the portal entries the game
// reports into (the IAPs, the Game Center achievements and leaderboards, the
// Steam achievements), and the art a listing cannot go up without. Each of
// them fails LATE and unhelpfully — a submission that runs for two minutes and
// then says "app not found", a leaderboard that silently drops every score
// because nobody created it, a build that uploads perfectly into Valve's
// shared test sandbox — so this walks the whole list up front and says which
// specific thing is missing and where to get it.
//
// Both storefronts, one command, because "are we ready to ship" is one
// question. The Steam section is deliberately the STORE-PAGE half only: the
// upload's own guards (a packaged build, Valve's redistributable, a website
// built with the developer menu still in it) live in
// `electron/scripts/steam-upload.mjs --dry-run`, which needs electron/'s
// dependency tree and a finished build before it can say anything.
//
//   make store-preflight
//
// It reads only; nothing here uploads, builds, or touches the network. Exit 1
// means something is genuinely missing; warnings are things that are fine now
// and have to be true before the listing goes live.

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { nativeEnv } from "./asset-tools/app-store-connect.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const native = path.join(root, "native");
const rel = (p) => path.relative(root, p);

// ---------------------------------------------------------------------------
// Reporting. Findings are grouped so the output reads as a checklist of the
// submission, not as a stack of unrelated assertions.
// ---------------------------------------------------------------------------
const findings = [];
let group = "";
const section = (title) => {
  group = title;
};
const ok = (msg) => findings.push({ level: "ok", group, msg });
const warn = (msg, hint) => findings.push({ level: "warn", group, msg, hint });
const fail = (msg, hint) => findings.push({ level: "fail", group, msg, hint });

// ---------------------------------------------------------------------------
// native/.env, read the way fastlane reads it — and the way the Game Center
// pusher reads it, which is why the rules (dotenv searching the fastlane/
// folder and its parent; a value still equal to the one in .env.example
// counting as unset) live in one shared module rather than twice here.
// ---------------------------------------------------------------------------
const env = nativeEnv(root);
const envFile = env.file;

/** The value fastlane would see, with template leftovers treated as absent. */
const envValue = (key) => env.value(key);

// ---------------------------------------------------------------------------
// 1. The app record. Without these `eas submit` has nothing to submit TO.
// ---------------------------------------------------------------------------
section("APP RECORD");

const easJson = JSON.parse(readFileSync(path.join(native, "eas.json"), "utf8"));
const iosSubmit = easJson.submit?.production?.ios ?? {};

if (!existsSync(envFile)) {
  warn(`${rel(envFile)} does not exist`, "cp native/.env.example native/.env");
}

if (/^\d+$/.test(String(iosSubmit.ascAppId ?? ""))) {
  ok(`app id ${iosSubmit.ascAppId} (eas.json → submit.production.ios)`);
} else {
  fail(
    "eas.json → submit.production.ios.ascAppId is not set",
    "create the app in App Store Connect first; it assigns a numeric Apple ID " +
      '(the id########## in the App Store URL). Paste it as "ascAppId".',
  );
}

if (/^[A-Z0-9]{10}$/i.test(String(iosSubmit.appleTeamId ?? ""))) {
  ok(`team ${iosSubmit.appleTeamId} (eas.json → submit.production.ios)`);
} else {
  fail(
    "eas.json → submit.production.ios.appleTeamId is not set",
    "10 alphanumerics, from the developer portal's Membership page.",
  );
}

// EAS needs ONE way to authenticate the submission: an Apple Account, or the
// App Store Connect API key. The key is preferred for the same reason fastlane
// prefers it — no 2FA session to expire mid-upload.
const easHasKey =
  iosSubmit.ascApiKeyPath &&
  iosSubmit.ascApiKeyId &&
  iosSubmit.ascApiKeyIssuerId;
if (iosSubmit.appleId || easHasKey) {
  ok("eas submit has a way to authenticate");
} else {
  warn(
    "eas.json names neither an appleId nor an App Store Connect API key",
    "fine interactively (eas submit prompts and remembers), but a " +
      "--non-interactive run — the native-build workflow with submit: true — " +
      "needs one of them, or the credentials uploaded via `eas credentials`.",
  );
}

// The bundle id is defined once in app.config.js; fastlane repeats it and so
// does the desktop packager, and a drift means deliver would upload this
// listing onto a different app — or, on the desktop side, sign and notarize a
// build under an id no store record holds. Both repeats are checked here
// rather than derived, because neither file can import the other: the Appfile
// is Ruby and electron-builder's config lives in a separate dependency tree.
const appConfig = readFileSync(path.join(native, "app.config.js"), "utf8");
const appfile = readFileSync(path.join(native, "fastlane", "Appfile"), "utf8");
const builderConfig = readFileSync(
  path.join(root, "electron", "electron-builder.config.cjs"),
  "utf8",
);
const configBundle = /BUNDLE_ID = "([^"]+)"/.exec(appConfig)?.[1];
const fastlaneBundle = /app_identifier\("([^"]+)"\)/.exec(appfile)?.[1];
const desktopBundle = /BUNDLE_ID = "([^"]+)"/.exec(builderConfig)?.[1];
if (
  configBundle &&
  configBundle === fastlaneBundle &&
  configBundle === desktopBundle
) {
  ok(
    `bundle id ${configBundle} ` +
      `(app.config.js = fastlane/Appfile = electron-builder.config.cjs)`,
  );
} else {
  const drifted = [
    fastlaneBundle === configBundle
      ? null
      : `fastlane/Appfile has ${fastlaneBundle}`,
    desktopBundle === configBundle
      ? null
      : `electron-builder.config.cjs has ${desktopBundle}`,
  ].filter(Boolean);
  fail(
    `bundle id drift: app.config.js has ${configBundle}, ${drifted.join("; ")}`,
    "app.config.js is the source of truth — fix the others to match.",
  );
}

const identity = JSON.parse(
  readFileSync(path.join(root, "game.config.json"), "utf8"),
);
if (!identity.appStoreUrl) {
  warn(
    "game.config.json → appStoreUrl is empty",
    "fill it once the app is public: the library's pages link to the listing, " +
      "and that link stays hidden while this is empty.",
  );
} else if (!/^https:\/\/apps\.apple\.com\//.test(identity.appStoreUrl)) {
  fail(
    `game.config.json → appStoreUrl is not an App Store URL (${identity.appStoreUrl})`,
    "expected https://apps.apple.com/…",
  );
} else {
  ok(`listing linked: ${identity.appStoreUrl}`);
}

// ---------------------------------------------------------------------------
// 2. Credentials. These are what `fastlane metadata` uploads the listing with.
// ---------------------------------------------------------------------------
section("CREDENTIALS");

const REQUIRED_ENV = [
  ["APPLE_ID", "the Apple Account email the developer program is under"],
  ["APPLE_TEAM_ID", "developer portal → Membership"],
  ["ASC_TEAM_ID", "App Store Connect → Users and Access (a number)"],
  ["ASC_KEY_ID", "the key id of the .p8"],
  ["ASC_ISSUER_ID", "one per team, above the key list (a UUID)"],
];
for (const [key, where] of REQUIRED_ENV) {
  if (envValue(key)) ok(`${key} set`);
  else fail(`${key} is not set`, where);
}

const keyPath = envValue("ASC_KEY_PATH");
const keyContent = envValue("ASC_KEY_CONTENT");
if (keyPath && keyContent) {
  fail(
    "both ASC_KEY_PATH and ASC_KEY_CONTENT are set",
    "set exactly one — fastlane passes both to the API-key action and the " +
      "loser is silently ignored.",
  );
} else if (keyContent) {
  ok("ASC_KEY_CONTENT set (base64 key)");
} else if (keyPath) {
  // fastlane runs from native/, so a relative path resolves against it.
  const resolved = path.resolve(native, keyPath);
  if (existsSync(resolved)) ok(`ASC_KEY_PATH → ${keyPath}`);
  else
    fail(
      `ASC_KEY_PATH points at a file that does not exist (${keyPath})`,
      "a relative path resolves against native/, since that is where " +
        "`bundle exec fastlane metadata` runs.",
    );
} else {
  fail(
    "neither ASC_KEY_PATH nor ASC_KEY_CONTENT is set",
    "App Store Connect → Users and Access → Integrations → generate an " +
      "App Manager key. The .p8 downloads once.",
  );
}

const envTeam = envValue("APPLE_TEAM_ID");
if (envTeam && iosSubmit.appleTeamId && envTeam !== iosSubmit.appleTeamId) {
  fail(
    `APPLE_TEAM_ID (${envTeam}) and eas.json appleTeamId ` +
      `(${iosSubmit.appleTeamId}) disagree`,
    "fastlane and EAS would act as different teams.",
  );
}

// ---------------------------------------------------------------------------
// 3. The listing. Delegated to the generator, which owns Apple's limits.
// ---------------------------------------------------------------------------
section("LISTING");

const run = (script, args = []) =>
  spawnSync(process.execPath, [path.join(here, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });

// A `--check` generator exits non-zero for two very different reasons: the
// manifest really has drifted, or the generator never ran at all. Only the
// first is a portal work list — the second is a broken checkout, and telling
// someone to regenerate a manifest that is already byte-correct is the one
// answer that cannot help them.
const drifted = (result) => /out of date/.test(result.stderr ?? "");

// A PNG's dimensions live in the IHDR chunk, at a fixed offset right after the
// 8-byte signature — so the one image fact this script needs costs 24 bytes of
// a read rather than a dependency on an image library.
const pngSize = (file) => {
  const head = Buffer.alloc(24);
  let fd;
  try {
    fd = openSync(file, "r");
    if (readSync(fd, head, 0, 24, 0) < 24) return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  if (head.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
};

const crashHint = (result) => {
  const detail = (result.stderr || result.stdout || "").trim();
  if (/ERR_MODULE_NOT_FOUND|src\/generated/.test(detail)) {
    return (
      "src/generated/ is missing — the compiled catalogs are build output " +
      "(§11.2), and the manifests are derived from them. Run `make levels`."
    );
  }
  return detail || "run it directly for the detail";
};

const listing = run("generate-store-metadata.mjs", ["--check"]);
if (listing.status === 0) {
  ok("native/store/listing.yaml passes every App Store limit");
} else {
  fail(
    "the listing does not compile",
    (listing.stderr || listing.stdout || "").trim() ||
      "run `make store-metadata` for the detail",
  );
}

// Apple calls the review contact number. The shipped placeholder is not one.
const listingDoc = parse(
  readFileSync(path.join(native, "store", "listing.yaml"), "utf8"),
);
const phone = String(listingDoc?.apple?.review?.phone ?? "").trim();
if (!phone || /0{6,}/.test(phone.replace(/[\s-]/g, ""))) {
  fail(
    `native/store/listing.yaml → review.phone is a placeholder (${phone})`,
    "App Store review needs a reachable number with a country code.",
  );
} else {
  ok(`review contact ${phone}`);
}

// ---------------------------------------------------------------------------
// 4. The portal entries. A product, badge or board the portal has never heard
//    of is not an error anywhere — the report is just dropped.
// ---------------------------------------------------------------------------
section("PORTAL ENTRIES");

const storeTs = readFileSync(path.join(root, "pwa/src/game/store.ts"), "utf8");
const skus = [...storeTs.matchAll(/sku:\s*"([^"]+)"/g)].map((m) => m[1]);
warn(
  `${skus.length} consumable IAPs must exist: ${skus.join(", ")}`,
  "App Store Connect → your app → In-App Purchases. Submit them WITH the " +
    "first binary — IAPs reviewed separately get stuck waiting for one.",
);

for (const [label, script, file] of [
  [
    "achievements",
    "game-center-achievements.mjs",
    "native/store/game-center-achievements.json",
  ],
  [
    "leaderboards",
    "game-center-leaderboards.mjs",
    "native/store/game-center-leaderboards.json",
  ],
]) {
  const result = run(script, ["--check"]);
  const manifest = JSON.parse(readFileSync(path.join(root, file), "utf8"));
  if (result.status === 0) {
    warn(
      `${manifest.count} Game Center ${label} must exist in the portal`,
      `every row of ${file} — the id column is the ${label.slice(0, -1)} id. ` +
        "`make store-game-center` prints the diff against the portal and " +
        'pushes it with ARGS="--apply"; no hand entry needed.',
    );
  } else if (drifted(result)) {
    fail(
      `${file} has drifted from the game's catalog`,
      `run \`node scripts/${script}\`, then \`make store-game-center\` to ` +
        "push the new rows.",
    );
  } else {
    // The generator did not get as far as comparing anything. Reporting that
    // as drift sends you to regenerate a manifest that is already correct —
    // and on a fresh checkout the real cause is always the same one.
    fail(`scripts/${script} could not read the catalog`, crashHint(result));
  }
}

// ---------------------------------------------------------------------------
// 5. Build inputs. Not needed to configure the record, needed before a build.
// ---------------------------------------------------------------------------
section("BUILD INPUTS");

const webroot = path.join(native, "assets", "webroot.zip");
if (existsSync(webroot)) {
  const mb = (statSync(webroot).size / 1e6).toFixed(1);
  ok(`assets/webroot.zip present (${mb} MB)`);
} else {
  warn(
    "native/assets/webroot.zip has not been built",
    "`npm run build:production` bundles it for you; a hand-driven " +
      "`eas build` needs `npm run bundle -- --profile production` first.",
  );
}

/** How many PNGs a generated art directory holds (0 when it was never run). */
const pngCount = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true }).filter((f) =>
        String(f).endsWith(".png"),
      ).length
    : 0;

const shots = pngCount(path.join(native, "store", "screenshots"));
if (shots > 0) ok(`${shots} store screenshots staged`);
else
  warn(
    "no store screenshots have been captured",
    "`make store-shots` — fastlane uploads text only without them.",
  );

// One image per achievement, and Game Center has no default to fall back on —
// a row created without one goes up blank.
const gcBadges = JSON.parse(
  readFileSync(
    path.join(native, "store/game-center-achievements.json"),
    "utf8",
  ),
).count;
const gcArt = pngCount(path.join(native, "store", "achievements"));
if (gcArt >= gcBadges) ok(`${gcArt} Game Center achievement images rendered`);
else
  warn(
    `${gcArt} of ${gcBadges} Game Center achievement images rendered`,
    "`make store-achievement-art` — cut from the game's own sprite atlas, so " +
      "the portal badge is the picture the in-game shelf shows.",
  );

// ---------------------------------------------------------------------------
// 6. Steam. The desktop shell ships to a THIRD storefront, and everything
//    above is Apple's. `electron/scripts/steam-upload.mjs --dry-run` already
//    guards the UPLOAD (ids, a packaged build, Valve's redistributable, a
//    website built with the developer menu still in it) — but it can only run
//    once electron/'s own dependency tree is installed and a build exists, so
//    it answers "can I upload this" rather than "what is left". These are the
//    store-page facts, which are true or false from a cold checkout.
// ---------------------------------------------------------------------------
section("STEAM");

const electron = path.join(root, "electron");
const steamConfigPath = path.join(electron, "store", "steam.json");
let steamConfig = {};
try {
  steamConfig = JSON.parse(readFileSync(steamConfigPath, "utf8"));
} catch {
  fail(
    "electron/store/steam.json could not be read",
    "it holds the app and depot ids the upload writes into its VDF.",
  );
}

// 480 is Spacewar, Valve's shared test app. Everything works with it — the
// build uploads, achievements report — into a sandbox every developer on Steam
// shares. It is the quietest of the four quiet failures in electron/RELEASING.
const steamAppId = Number(process.env.GIS_STEAM_APP_ID || steamConfig.appId);
if (steamAppId === 480) {
  fail(
    "electron/store/steam.json → appId is 480 (Valve's Spacewar test app)",
    "everything works and the data goes into a sandbox shared with every " +
      "developer on Steam. Use this app's own id.",
  );
} else if (Number.isInteger(steamAppId) && steamAppId > 0) {
  ok(`Steam app ${steamAppId} (electron/store/steam.json)`);
} else {
  fail(
    "electron/store/steam.json → appId is not set",
    "create the app in Steamworks; the app id is the number in the " +
      "partner-site URL.",
  );
}

for (const os of ["windows", "macos", "linux"]) {
  const depot = Number(
    process.env[`GIS_STEAM_DEPOT_${os.toUpperCase()}`] ??
      steamConfig.depots?.[os],
  );
  if (Number.isInteger(depot) && depot > 0) ok(`${os} depot ${depot}`);
  else
    fail(
      `electron/store/steam.json → depots.${os} is not set`,
      "App Admin → Depots → create one per platform, then paste its id here.",
    );
}

{
  const script = "steam-achievements.mjs";
  const result = run(script, ["--check"]);
  const manifest = JSON.parse(
    readFileSync(
      path.join(electron, "store", "steam-achievements.json"),
      "utf8",
    ),
  );
  if (result.status === 0) {
    warn(
      `${manifest.count ?? manifest.achievements?.length} Steam achievements ` +
        "must exist in the partner site",
      "App Admin → Achievements — the id column is the API Name, and the " +
        "game reports it verbatim. An id the portal never heard of is dropped " +
        "silently, forever. Valve documents no API for creating one, so " +
        "`make store-steam-achievements` prints them as a paste-ready " +
        'worksheet and ARGS="--verify" reads them back afterwards and names ' +
        "anything missing or mistyped.",
    );
  } else if (drifted(result)) {
    fail(
      "electron/store/steam-achievements.json has drifted from the catalog",
      `run \`node scripts/${script}\` and create the new rows in the portal.`,
    );
  } else {
    fail(`scripts/${script} could not read the catalog`, crashHint(result));
  }
}

// Valve's store-page art. Every one of these is required, none has a
// generator (they are marketing art with the logo laid out per aspect ratio),
// and a listing cannot go up without them — so they are the longest-lead item
// on this list after the 30-day store-page wait itself.
const CAPSULES = [
  ["header", 920, 430, "top of the store page"],
  ["small", 462, 174, "search results, top sellers"],
  ["main", 1232, 706, "store front-page carousel"],
  ["vertical", 748, 896, "seasonal sale pages"],
  ["library", 600, 900, "the player's library grid"],
  ["library-header", 920, 430, "recent games"],
  ["library-hero", 3840, 1240, "library detail page — no text"],
  ["library-logo", 1280, 720, "over the hero — transparent PNG"],
];
const capsuleDir = path.join(electron, "store", "capsules");
const missingCapsules = [];
const wrongCapsules = [];
for (const [name, width, height, where] of CAPSULES) {
  const file = path.join(capsuleDir, `${name}.png`);
  if (!existsSync(file)) {
    missingCapsules.push(`${name} ${width}×${height} (${where})`);
    continue;
  }
  const size = pngSize(file);
  if (!size || size.width !== width || size.height !== height) {
    wrongCapsules.push(
      `${name} is ${size ? `${size.width}×${size.height}` : "not a PNG"}, ` +
        `Valve wants ${width}×${height}`,
    );
  }
}
if (missingCapsules.length === 0 && wrongCapsules.length === 0) {
  ok(`${CAPSULES.length} store capsules present (electron/store/capsules/)`);
}
if (missingCapsules.length > 0) {
  warn(
    `${missingCapsules.length} of ${CAPSULES.length} Steam capsules are missing`,
    "drop them in electron/store/capsules/ as <name>.png — " +
      missingCapsules.join(", "),
  );
}
if (wrongCapsules.length > 0) {
  fail(
    `${wrongCapsules.length} Steam capsule(s) are the wrong size`,
    wrongCapsules.join("; "),
  );
}

// Valve requires at least five, and four of them marked suitable for all ages.
const STEAM_MIN_SHOTS = 5;
const steamShots = pngCount(path.join(electron, "store", "screenshots"));
if (steamShots >= STEAM_MIN_SHOTS) {
  ok(`${steamShots} Steam screenshots captured`);
} else {
  warn(
    `${steamShots} of ${STEAM_MIN_SHOTS} required Steam screenshots captured`,
    "`node pwa/scripts/store-shots.mjs --only steam` — the 1920×1080 raster, " +
      "written to electron/store/screenshots/.",
  );
}

// TWO icons per achievement — Steam draws the achieved and locked variants side
// by side in the overlay.
const steamBadges = JSON.parse(
  readFileSync(path.join(electron, "store/steam-achievements.json"), "utf8"),
).count;
const steamArt = pngCount(path.join(electron, "store", "achievements"));
if (steamArt >= steamBadges * 2) {
  ok(`${steamArt} Steam achievement icons rendered`);
} else {
  warn(
    `${steamArt} of ${steamBadges * 2} Steam achievement icons rendered`,
    "`make store-achievement-art` — the achieved/locked 64×64 pair for every " +
      "row, cut from the badge's own sprite.",
  );
}

if (!identity.steamUrl) {
  warn(
    "game.config.json → steamUrl is empty",
    "fill it once the store page is public — the library's pages link to it " +
      "the same way they link to the App Store listing.",
  );
} else if (!/^https:\/\/store\.steampowered\.com\//.test(identity.steamUrl)) {
  fail(
    `game.config.json → steamUrl is not a Steam URL (${identity.steamUrl})`,
    "expected https://store.steampowered.com/app/…",
  );
} else {
  ok(`Steam page linked: ${identity.steamUrl}`);
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------
const MARK = { ok: "  ok  ", warn: " todo ", fail: " FAIL " };
let printed = "";
for (const f of findings) {
  if (f.group !== printed) {
    printed = f.group;
    console.log(`\n${printed}`);
  }
  console.log(`${MARK[f.level]} ${f.msg}`);
  if (f.hint) console.log(`        ${f.hint.replace(/\n/g, "\n        ")}`);
}

const failed = findings.filter((f) => f.level === "fail").length;
const todo = findings.filter((f) => f.level === "warn").length;
console.log(
  `\n${findings.length - failed - todo} ready, ${todo} to do, ${failed} blocking` +
    "\nsee native/RELEASING.md (App Store / Play) and electron/RELEASING.md " +
    "(Steam)\nfor the order these are done in",
);
process.exit(failed > 0 ? 1 : 0);
