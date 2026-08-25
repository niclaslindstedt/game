#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PUSH THE GAME CENTER ENTRIES — the 86 achievements and 5 leaderboards of the
// two committed manifests, created and updated in App Store Connect through its
// own API instead of typed into 91 web forms.
//
//   node scripts/game-center-push.mjs              # the work list; writes nothing
//   node scripts/game-center-push.mjs --apply      # …and then do it
//   node scripts/game-center-push.mjs --only leaderboards
//   node scripts/game-center-push.mjs --skip-images
//
// A DRY RUN IS THE DEFAULT, because the interesting output is the diff: it is
// the same work list the manifests' own regeneration prints, and reading it is
// how you find out that a catalog change added four badges and re-pointed
// eleven. `--apply` is the second command, deliberately.
//
// IDEMPOTENT, and meant to be re-run: it reconciles against what the portal
// already holds, matching on `vendorIdentifier` — the id the GAME reports, not
// a display name and not Apple's own resource id. Re-running after a catalog
// change is the normal way to apply it.
//
// Why this exists rather than a checklist: both silent-failure modes in this
// corner of the pipeline are exactly the kind a human transcribing a table
// produces. An id the portal has never heard of is dropped with no error
// anywhere — the badge or score simply never appears — and a leaderboard whose
// portal format disagrees with the scale the game applies makes every score on
// that board wrong by a factor of a hundred. Both are checked here before a
// single request goes out (scripts/asset-tools/game-center-plan.mjs).
//
// It authenticates with the App Store Connect API key `fastlane metadata`
// already uses (`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_PATH` in
// native/.env) — no new secret, and `make store-preflight` already verifies it.
//
// TWO THINGS IT DOES NOT DO, both on purpose:
//
//   - IT NEVER DELETES. An achievement somebody has earned cannot be
//     un-earned and a board's scores cannot be recovered, so a portal row the
//     manifest no longer lists is reported and left alone.
//   - IT DOES NOT RELEASE. Attaching the rows to the version under review is
//     the deliberate act native/RELEASING.md §5 describes, tied to a build
//     rather than to a catalog change.
//
// The API surface is App Store Connect's v1 Game Center resources. Its v2 peers
// are the documented successors everywhere EXCEPT the one place that matters
// here: creating an achievement through v2 requires a
// `gameCenterAchievementVersions` linkage, and a version can only be created
// FROM an achievement — a circle with no opening. v1 closes, so v1 is what this
// speaks, in one consistent model rather than a mix.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  AppStoreConnect,
  AscError,
  ascCredentials,
} from "./asset-tools/app-store-connect.mjs";
import {
  DEFAULT_LOCALE,
  manifestProblems,
  planAchievements,
  planCounts,
  planLeaderboards,
} from "./asset-tools/game-center-plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const rel = (p) => path.relative(root, p);

const ACHIEVEMENTS_MANIFEST = "native/store/game-center-achievements.json";
const LEADERBOARDS_MANIFEST = "native/store/game-center-leaderboards.json";
const ACHIEVEMENT_ART = "native/store/achievements";

/** How many portal reads to have in flight at once. Apple's rate limit is far
 * above this; the cap is here so a hundred sockets don't open at once. */
const READ_CONCURRENCY = 6;

const USAGE = `usage: node scripts/game-center-push.mjs [options]

  --apply               write to App Store Connect (default: dry run)
  --only <which>        achievements | leaderboards
  --skip-images         leave the achievement artwork alone
  --app <id>            the numeric Apple ID (default: native/eas.json)
  --locale <locale>     the locale to author (default: the listing's primary)
  --art <dir>           where the badge PNGs are (default: ${ACHIEVEMENT_ART})
  --help
`;

export function parseArgs(argv) {
  const opts = { apply: false, skipImages: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--dry-run") opts.apply = false;
    else if (arg === "--skip-images") opts.skipImages = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (
      arg === "--only" ||
      arg === "--app" ||
      arg === "--locale" ||
      arg === "--art"
    ) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      opts[arg.slice(2)] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (opts.only && !["achievements", "leaderboards"].includes(opts.only)) {
    throw new Error(
      `--only takes achievements or leaderboards, not ${opts.only}`,
    );
  }
  return opts;
}

// ---------------------------------------------------------------------------
// What the portal should hold: the committed manifests, and only if they are
// still the catalog's. Pushing a stale manifest writes yesterday's catalog into
// the portal and reports success, which is worse than refusing.
// ---------------------------------------------------------------------------

function readManifest(file, generator) {
  const check = spawnSync(
    process.execPath,
    [path.join(here, generator), "--check"],
    { cwd: root, encoding: "utf8" },
  );
  if (check.status !== 0) {
    const why = (check.stderr || check.stdout || "").trim();
    throw new Error(
      `${file} is not the catalog's — refusing to push it.\n${why}`,
    );
  }
  return JSON.parse(readFileSync(path.join(root, file), "utf8"));
}

/** The locale the listing is primarily authored in — one source of truth, so a
 * game whose store page is not English does not need a second place to say so. */
function primaryLocale() {
  try {
    const listing = parseYaml(
      readFileSync(path.join(root, "native/store/listing.yaml"), "utf8"),
    );
    return Object.keys(listing?.apple?.info ?? {})[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** The app record's numeric Apple ID, from where `eas submit` reads it. */
function appId() {
  const easJson = JSON.parse(
    readFileSync(path.join(root, "native/eas.json"), "utf8"),
  );
  return String(easJson.submit?.production?.ios?.ascAppId ?? "");
}

/** The rendered badge for one row, or null when the artwork has not been cut. */
function artworkFor(dir, id) {
  const file = path.resolve(root, dir, `${id}.png`);
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return { file, fileName: `${id}.png`, bytes: readFileSync(file) };
}

// ---------------------------------------------------------------------------
// What the portal holds today.
// ---------------------------------------------------------------------------

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapPool(items, limit, fn) {
  const queue = [...items.entries()];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await fn(next[1], next[0]);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * The app's Game Center detail, which every achievement and leaderboard below
 * hangs off.
 *
 * READ IT THROUGH THE APP, NOT AS A COLLECTION. `gameCenterDetails` allows only
 * CREATE, GET_INSTANCE and UPDATE — a filtered collection GET is refused with a
 * 403 naming the operation rather than the credential, which reads like an
 * un-entitled key and is not one. The app's own to-one relationship is the
 * documented read, and it answers 404 while Game Center has never been switched
 * on for the record.
 */
async function gameCenterDetailId(api, id) {
  let body = null;
  try {
    body = await api.get(`/v1/apps/${id}/gameCenterDetail`);
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  const detailId = body?.data?.id;
  if (!detailId) {
    throw new Error(
      `app ${id} has no Game Center detail — enable Game Center on the app ` +
        "record first (App Store Connect → your app → Game Center). See " +
        "native/RELEASING.md §1.3.",
    );
  }
  return detailId;
}

/**
 * The portal's rows, flattened into the shape the reconcile compares against:
 * the attributes inline, and every localization with the image Apple holds for
 * it. Localizations are read per row rather than sideloaded, because a
 * relationship read that returns nothing for a row is indistinguishable from a
 * row that genuinely has none — and guessing wrong there is how a description
 * silently never gets written.
 */
async function readPortalRows(api, detailId, kind) {
  const { data } = await api.list(
    `/v1/gameCenterDetails/${detailId}/${kind.collection}`,
  );
  const rows = data.map((row) => ({
    id: row.id,
    ...row.attributes,
    localizations: [],
  }));
  await mapPool(rows, READ_CONCURRENCY, async (row) => {
    const { data: locales, included } = await api.list(
      `/v1/${kind.collection}/${row.id}/localizations`,
      kind.imageRelationship ? { include: kind.imageRelationship } : undefined,
    );
    const images = new Map(
      included
        .filter((item) => item.type === kind.imageType)
        .map((item) => [item.id, item]),
    );
    row.localizations = locales.map((locale) => {
      const linked =
        kind.imageRelationship &&
        locale.relationships?.[kind.imageRelationship]?.data?.id;
      const image = linked ? images.get(linked) : undefined;
      return {
        id: locale.id,
        ...locale.attributes,
        image: image
          ? {
              id: image.id,
              fileName: image.attributes?.fileName,
              fileSize: image.attributes?.fileSize,
            }
          : null,
      };
    });
  });
  return rows;
}

const ACHIEVEMENTS = {
  label: "ACHIEVEMENTS",
  collection: "gameCenterAchievements",
  localizations: "gameCenterAchievementLocalizations",
  parentRelationship: "gameCenterAchievement",
  imageRelationship: "gameCenterAchievementImage",
  imageType: "gameCenterAchievementImages",
  images: "gameCenterAchievementImages",
  imageParent: "gameCenterAchievementLocalization",
};

const LEADERBOARDS = {
  label: "LEADERBOARDS",
  collection: "gameCenterLeaderboards",
  localizations: "gameCenterLeaderboardLocalizations",
  parentRelationship: "gameCenterLeaderboard",
  // Game Center's leaderboard image is optional and nothing in this repo
  // generates one, so none is read and none is pushed.
  imageRelationship: null,
};

// ---------------------------------------------------------------------------
// Writing.
// ---------------------------------------------------------------------------

/**
 * The same attributes minus one Apple's update requests do not carry, because it
 * IS the resource's identity — `vendorIdentifier` for a row (the id the game
 * reports, which the reconcile matched on) and `locale` for a localization.
 */
function withoutIdentity(attributes, identity) {
  const patch = { ...attributes };
  delete patch[identity];
  return patch;
}

async function applyEntry(api, detailId, kind, entry, opts) {
  let id = entry.portalId;

  if (entry.action === "create") {
    const created = await api.post(`/v1/${kind.collection}`, {
      data: {
        type: kind.collection,
        attributes: entry.attributes,
        relationships: {
          gameCenterDetail: {
            data: { type: "gameCenterDetails", id: detailId },
          },
        },
      },
    });
    id = created.data.id;
  } else if (entry.attributeChanges.length > 0) {
    await api.patch(`/v1/${kind.collection}/${id}`, {
      data: {
        type: kind.collection,
        id,
        attributes: withoutIdentity(entry.attributes, "vendorIdentifier"),
      },
    });
  }

  let localizationId = entry.localization.id;
  if (entry.localization.action === "create") {
    const created = await api.post(`/v1/${kind.localizations}`, {
      data: {
        type: kind.localizations,
        attributes: entry.localization.fields,
        relationships: {
          [kind.parentRelationship]: {
            data: { type: kind.collection, id },
          },
        },
      },
    });
    localizationId = created.data.id;
  } else if (entry.localization.changes.length > 0) {
    await api.patch(`/v1/${kind.localizations}/${localizationId}`, {
      data: {
        type: kind.localizations,
        id: localizationId,
        attributes: withoutIdentity(entry.localization.fields, "locale"),
      },
    });
  }

  if (
    !opts.skipImages &&
    entry.image &&
    (entry.image.action === "upload" || entry.image.action === "replace")
  ) {
    await pushImage(api, kind, localizationId, entry.image);
  }
}

/**
 * Reserve, upload, confirm — Apple's three-step asset flow. The bytes go to a
 * pre-signed URL Apple hands back, and the resource stays in a pending state
 * until the final PATCH says the upload finished, so an interrupted run leaves
 * an unconfirmed image rather than a corrupt badge.
 */
async function pushImage(api, kind, localizationId, image) {
  if (image.portalId) {
    // A localization holds at most one image, so a replacement is a delete
    // followed by a create rather than an overwrite.
    await api.delete(`/v1/${kind.images}/${image.portalId}`);
  }
  const created = await api.post(`/v1/${kind.images}`, {
    data: {
      type: kind.images,
      attributes: { fileName: image.fileName, fileSize: image.bytes.length },
      relationships: {
        [kind.imageParent]: {
          data: { type: kind.localizations, id: localizationId },
        },
      },
    },
  });
  await api.uploadAsset(created.data.attributes?.uploadOperations, image.bytes);
  await api.patch(`/v1/${kind.images}/${created.data.id}`, {
    data: {
      type: kind.images,
      id: created.data.id,
      attributes: { uploaded: true },
    },
  });
}

// ---------------------------------------------------------------------------
// Output. The dry run's shape is the point of the tool, so it reads as a work
// list: one line per row that needs something, and a count for the rest.
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function describe(entry) {
  if (entry.action === "create") {
    const { points, defaultFormatter } = entry.attributes;
    const detail =
      points !== undefined ? `${points} pts` : `${defaultFormatter}`;
    return `${pad(detail, 22)}${entry.name}`;
  }
  return entry.attributeChanges
    .concat(entry.localization.changes)
    .map(
      (c) => `${c.field} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`,
    )
    .join(", ");
}

function report(label, plan) {
  const counts = planCounts(plan);
  console.log(`\n${label}`);
  const width = Math.max(
    2,
    ...plan.entries.map((entry) => entry.id.length),
    ...plan.extras.map((extra) => extra.id.length),
  );
  for (const entry of plan.entries) {
    if (entry.action !== "unchanged") {
      console.log(
        `  ${pad(entry.action, 10)}${pad(entry.id, width)}  ${describe(entry)}`,
      );
    }
    const image = entry.image;
    if (image?.action === "upload" || image?.action === "replace") {
      console.log(
        `  ${pad(image.action === "replace" ? "reimage" : "image", 10)}` +
          `${pad(entry.id, width)}  ${kb(image.bytes.length)}  ${image.fileName}`,
      );
    }
  }
  if (counts.unchanged > 0) console.log(`  ${counts.unchanged} unchanged`);
  if (counts.outstandingImages > 0) {
    console.log(
      `  ${counts.outstandingImages} without artwork — \`make store-achievement-art\`` +
        `\n    (a row is worth creating without one; Game Center takes the image later)`,
    );
  }
  if (plan.extras.length > 0) {
    console.log(
      `  ${plan.extras.length} in the portal but not in the manifest, left alone:` +
        `\n    ${plan.extras.map((extra) => extra.id).join(", ")}`,
    );
  }
  return counts;
}

// ---------------------------------------------------------------------------

async function main(opts) {
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const achievements = readManifest(
    ACHIEVEMENTS_MANIFEST,
    "game-center-achievements.mjs",
  );
  const leaderboards = readManifest(
    LEADERBOARDS_MANIFEST,
    "game-center-leaderboards.mjs",
  );

  // Every refusal at once, before anything is read or written: the count under
  // Apple's 100, the points landing on exactly 1000, and each board's formatter
  // agreeing with the scale the game submits.
  const problems = manifestProblems(achievements, leaderboards);
  if (problems.length > 0) {
    throw new Error(
      `the manifests are not pushable:\n  - ${problems.join("\n  - ")}`,
    );
  }
  console.log(
    `${achievements.count} achievements, ` +
      `${achievements.points}/${achievements.pointBudget} points; ` +
      `${leaderboards.count} leaderboards — every format matches its scale`,
  );

  const id = opts.app ?? appId();
  if (!/^\d+$/.test(id)) {
    throw new Error(
      "native/eas.json → submit.production.ios.ascAppId is not set, and no " +
        "--app was given. The app record has to exist first; App Store Connect " +
        "assigns the numeric Apple ID (native/RELEASING.md §1).",
    );
  }

  const credentials = ascCredentials(root);
  if (credentials.missing.length > 0) {
    throw new Error(
      `the App Store Connect API key is not configured in ${rel(credentials.envFile)}:\n` +
        `  - ${credentials.missing.join("\n  - ")}\n` +
        "`make store-preflight` walks the whole credential set.",
    );
  }

  const locale = opts.locale ?? primaryLocale();
  // GIS_ASC_HOST points the client at a stand-in for Apple. It exists so the
  // read → plan → write path is exercisable end to end
  // (tests/game_center_push_apply_test.ts) instead of only up to the first
  // socket.
  const api = new AppStoreConnect(credentials, {
    ...(process.env.GIS_ASC_HOST ? { host: process.env.GIS_ASC_HOST } : {}),
  });
  const detailId = await gameCenterDetailId(api, id);
  console.log(
    `app ${id} · gameCenterDetail ${detailId} · locale ${locale}` +
      `${opts.apply ? "" : " · DRY RUN, nothing is written"}`,
  );

  const wanted = [];
  if (opts.only !== "leaderboards") {
    wanted.push({
      kind: ACHIEVEMENTS,
      plan: planAchievements({
        rows: achievements.achievements,
        portalRows: await readPortalRows(api, detailId, ACHIEVEMENTS),
        locale,
        imageFor: opts.skipImages
          ? undefined
          : (row) => artworkFor(opts.art ?? ACHIEVEMENT_ART, row.id),
      }),
    });
  }
  if (opts.only !== "achievements") {
    wanted.push({
      kind: LEADERBOARDS,
      plan: planLeaderboards({
        rows: leaderboards.leaderboards,
        portalRows: await readPortalRows(api, detailId, LEADERBOARDS),
        locale,
      }),
    });
  }

  let created = 0;
  let updated = 0;
  let images = 0;
  for (const { kind, plan } of wanted) {
    const counts = report(kind.label, plan);
    created += counts.create;
    updated += counts.update;
    images += counts.images;
  }

  console.log(
    `\n${created} to create, ${updated} to update, ${images} image(s) to upload`,
  );

  if (!opts.apply) {
    console.log("nothing written — re-run with --apply to push it");
    return;
  }

  for (const { kind, plan } of wanted) {
    const work = plan.entries.filter((entry) => entry.action !== "unchanged");
    for (const [index, entry] of work.entries()) {
      console.log(
        `${kind.label.toLowerCase()} ${index + 1}/${work.length}  ` +
          `${entry.action} ${entry.id}`,
      );
      await applyEntry(api, detailId, kind, entry, opts);
    }
  }

  console.log(
    `\npushed ${created} new and ${updated} changed row(s) in ${api.requests} requests.\n` +
      "They are configured but not RELEASED: attach them to the version under " +
      "review in App Store Connect (native/RELEASING.md §5).",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof AscError
        ? `App Store Connect refused a request:\n${error.message}`
        : `error: ${error.message}`,
    );
    process.exitCode = 1;
  }
}
