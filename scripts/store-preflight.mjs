#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STORE PREFLIGHT — is this checkout actually wired up to an App Store record?
//
// Everything the submission pipeline needs that ISN'T code lives in three
// places a repo can't hold: the app record in App Store Connect (its numeric
// id, the team it belongs to), the credentials that talk to it (native/.env,
// an App Store Connect API key), and the portal entries the game reports into
// (the IAPs, the Game Center achievements and leaderboards). Each of them
// fails LATE and unhelpfully — a submission that runs for two minutes and then
// says "app not found", a leaderboard that silently drops every score because
// nobody created it — so this walks the whole list up front and says which
// specific thing is missing and where to get it.
//
//   make store-preflight
//
// It reads only; nothing here uploads, builds, or touches the network. Exit 1
// means something is genuinely missing; warnings are things that are fine now
// and have to be true before the listing goes live.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

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
// native/.env, read the way fastlane reads it (dotenv searches the fastlane/
// folder and its parent, and the lane is run from native/). A value that is
// still the one shipped in .env.example counts as unset — a half-filled
// template is the most common way this ends up "configured" but not working.
// ---------------------------------------------------------------------------
const parseEnv = (file) => {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
};

const envFile = path.join(native, ".env");
const dotenv = parseEnv(envFile);
const template = parseEnv(path.join(native, ".env.example"));

/** The value fastlane would see, with template leftovers treated as absent. */
const envValue = (key) => {
  const value = process.env[key] ?? dotenv[key] ?? "";
  if (!value) return "";
  return value === template[key] ? "" : value;
};

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

// The bundle id is defined once in app.config.js; fastlane repeats it, and a
// drift means deliver would upload this listing onto a different app.
const appConfig = readFileSync(path.join(native, "app.config.js"), "utf8");
const appfile = readFileSync(path.join(native, "fastlane", "Appfile"), "utf8");
const configBundle = /BUNDLE_ID = "([^"]+)"/.exec(appConfig)?.[1];
const fastlaneBundle = /app_identifier\("([^"]+)"\)/.exec(appfile)?.[1];
if (configBundle && configBundle === fastlaneBundle) {
  ok(`bundle id ${configBundle} (app.config.js = fastlane/Appfile)`);
} else {
  fail(
    `bundle id drift: app.config.js has ${configBundle}, ` +
      `fastlane/Appfile has ${fastlaneBundle}`,
    "app.config.js is the source of truth — fix the Appfile.",
  );
}

const identity = JSON.parse(
  readFileSync(path.join(root, "game.config.json"), "utf8"),
);
if (!identity.appStoreUrl) {
  warn(
    "game.config.json → appStoreUrl is empty",
    "fill it once the app is public: the library's only call to action " +
      "points at the listing, and stays hidden while this is empty.",
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
      `every row of ${file} — the id column is the ${label.slice(0, -1)} id.`,
    );
  } else {
    fail(
      `${file} has drifted from the game's catalog`,
      `run \`node scripts/${script}\` and create the new rows in the portal.`,
    );
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

const shotsDir = path.join(native, "store", "screenshots");
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir, { recursive: true }).filter((f) =>
      String(f).endsWith(".png"),
    ).length
  : 0;
if (shots > 0) ok(`${shots} store screenshots staged`);
else
  warn(
    "no store screenshots have been captured",
    "`make store-shots` — fastlane uploads text only without them.",
  );

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
    "\nsee native/RELEASING.md for the order these are done in",
);
process.exit(failed > 0 ? 1 : 0);
