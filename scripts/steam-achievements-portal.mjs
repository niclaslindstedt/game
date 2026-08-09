#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM ACHIEVEMENT ROWS — the worksheet a human types into the Steamworks
// partner site, and the verification pass that proves they typed it right.
//
//   node scripts/steam-achievements-portal.mjs                 # the worksheet
//   node scripts/steam-achievements-portal.mjs --format tsv
//   node scripts/steam-achievements-portal.mjs --out sheet.tsv --format tsv
//   node scripts/steam-achievements-portal.mjs --verify         # …then check it
//
// THE ENTRY CANNOT BE AUTOMATED AND THE CHECK CAN. Game Center's rows go up
// through App Store Connect's own API (scripts/game-center-push.mjs); Steam's
// same list does not, because the Steamworks Web API unlocks and queries stats at
// RUNTIME and has no documented endpoint for creating a definition — that lives
// in App Admin → Achievements, as a web form, once per row. So this tool splits
// the job at the line Valve draws:
//
//   - THE WORKSHEET makes the typing mechanical. One block per achievement,
//     fields in the order the form asks for them, both icon paths filled in
//     from `make store-achievement-art` rather than looked up. Nothing is
//     re-derived per row and nothing is read out of a JSON file in one window
//     while a web form waits in another — which is exactly where a typo comes
//     from.
//   - THE VERIFICATION PASS is the half that actually retires the risk, and it
//     is worth more than the worksheet. `ISteamUserStats/GetSchemaForGame`
//     reads the app's achievement schema back, so after entry the portal can be
//     diffed against the manifest and every id that is missing — or mistyped,
//     which is the same symptom and different work — named out loud.
//
// The failure it exists for is silent and permanent: an achievement id the
// partner site doesn't have is dropped on the floor with no error anywhere, so
// the badge simply never appears for anybody (electron/RELEASING.md → What
// fails quietly). One typo anywhere in the transcription costs a badge nobody
// can ever earn, and nothing in the game, the build or the upload notices.
//
// Built for the SECOND run as much as this one: Steam caps a new app at 100
// achievements, so the shipped list is a curated subset of the catalog (the
// manifest's own `count` and `limit` say where it stands — run the worksheet).
// When the app clears Valve's Profile Features threshold that cap lifts,
// `STEAM_FULL_CATALOG` flips false → true, and every remaining row wants the
// same treatment.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  compareCounts,
  compareSchema,
  DEFAULT_ART_DIR,
  manifestProblems,
  renderWorksheet,
  worksheetRows,
} from "./asset-tools/steam-achievement-plan.mjs";
import {
  SPACEWAR_APP_ID,
  SteamApiError,
  SteamPartner,
  SteamSchemaEmptyError,
  steamAppId,
  steamCredentials,
  STEAM_KEY_HINT,
} from "./asset-tools/steam-partner.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const MANIFEST = "electron/store/steam-achievements.json";
const GENERATOR = "steam-achievements.mjs";

const USAGE = `usage: node scripts/steam-achievements-portal.mjs [options]

  --verify              read the partner site back and diff it against the manifest
  --strict              --verify also fails on drifted text, not only missing rows
  --format <fmt>        form (default) | tsv | csv
  --out <file>          write the worksheet to a file instead of stdout
  --app <id>            the Steam app id (default: electron/store/steam.json)
  --art <dir>           where the badge PNGs are (default: ${DEFAULT_ART_DIR})
  --language <name>     the schema language to read back (default: english)
  --help
`;

export function parseArgs(argv) {
  const opts = { verify: false, strict: false, format: "form" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verify") opts.verify = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (
      arg === "--format" ||
      arg === "--out" ||
      arg === "--app" ||
      arg === "--art" ||
      arg === "--language"
    ) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      opts[arg.slice(2)] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!["form", "tsv", "csv"].includes(opts.format)) {
    throw new Error(`--format takes form, tsv or csv, not ${opts.format}`);
  }
  if (opts.strict && !opts.verify) {
    throw new Error("--strict only means something with --verify");
  }
  return opts;
}

// ---------------------------------------------------------------------------
// What the portal should hold: the committed manifest, and only if it is still
// the catalog's. A worksheet cut from a stale manifest is a whole afternoon of
// yesterday's catalog typed in by hand, which is worse than refusing to print
// one.
// ---------------------------------------------------------------------------

function readManifest() {
  const check = spawnSync(
    process.execPath,
    [path.join(here, GENERATOR), "--check"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (check.status !== 0) {
    const why = (check.stderr || check.stdout || "").trim();
    throw new Error(
      `${MANIFEST} is not the catalog's — refusing to use it.\n${why}`,
    );
  }
  return JSON.parse(readFileSync(path.join(root, MANIFEST), "utf8"));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);

function reportWorksheet(rows, opts) {
  const bare = rows.filter((row) => row.artMissing.length > 0).length;
  const body = renderWorksheet(rows, {
    format: opts.format,
    // Flag the rows individually only when the artwork is PARTLY cut — with
    // none of it cut, the one summary line below says the same thing once.
    flagArt: bare > 0 && bare < rows.length,
  });
  if (opts.out) {
    const file = path.resolve(root, opts.out);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    console.log(`${rows.length} rows → ${path.relative(root, file)}`);
  } else {
    process.stdout.write(body);
  }

  const missingArt = rows.reduce((n, row) => n + row.artMissing.length, 0);
  const notes = [
    `${rows.length} rows for App Admin → Achievements. The API Name is the id ` +
      "the game reports verbatim — an id the partner site doesn't have is " +
      "dropped silently, forever.",
  ];
  if (missingArt > 0) {
    notes.push(
      `${missingArt} of ${rows.length * 2} icons have not been cut yet — ` +
        '`make store-achievement-art ARGS="--only steam"`.',
    );
  }
  notes.push(
    "When the rows are in, `--verify` reads them back and names anything " +
      "missing or mistyped.",
  );
  console.error(`\n${notes.join("\n")}`);
}

function reportVerify(comparison, { appId, schema }) {
  const counts = compareCounts(comparison);
  const width = Math.max(
    2,
    ...comparison.entries.map((entry) => entry.id.length),
    ...comparison.extras.map((extra) => extra.id.length),
  );

  console.log(
    `\napp ${appId}${schema.gameName ? ` · ${schema.gameName}` : ""} · ` +
      `${schema.achievements.length} row(s) in the partner site, ` +
      `${comparison.entries.length} in the manifest`,
  );

  for (const entry of comparison.entries) {
    if (entry.state === "missing") {
      console.log(
        `  ${pad("MISSING", 9)}${pad(entry.id, width)}  ${entry.name}`,
      );
      if (entry.suggestion) {
        console.log(
          `  ${" ".repeat(9)}${" ".repeat(width)}  ↳ the partner site has ` +
            `"${entry.suggestion.id}"${
              entry.suggestion.certain
                ? " — the same id typed differently, so RENAME that row"
                : " — likely this row, mistyped"
            }`,
        );
      }
    } else if (entry.state === "differs") {
      for (const change of entry.differences) {
        console.log(
          `  ${pad("differs", 9)}${pad(entry.id, width)}  ${change.field} ` +
            `${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`,
        );
      }
    }
    if (entry.icons && (!entry.icons.achieved || !entry.icons.locked)) {
      const which = [
        entry.icons.achieved ? null : "achieved",
        entry.icons.locked ? null : "unachieved",
      ].filter(Boolean);
      console.log(
        `  ${pad("no icon", 9)}${pad(entry.id, width)}  ${which.join(" + ")} ` +
          "not uploaded — the overlay draws Valve's placeholder",
      );
    }
  }

  if (counts.ok > 0) console.log(`  ${counts.ok} correct`);
  if (comparison.extras.length > 0) {
    console.log(
      `  ${comparison.extras.length} in the partner site but not in the ` +
        "manifest, left alone (an id is permanent once anybody unlocked it):" +
        `\n    ${comparison.extras.map((extra) => extra.id).join(", ")}`,
    );
  }

  const verdict =
    counts.missing > 0
      ? `${counts.missing} achievement(s) the game reports and the partner ` +
        `site has never heard of${
          counts.typos > 0
            ? `, ${counts.typos} of them a near-miss on an id it DOES have`
            : ""
        } — every unlock of those is dropped, silently, forever`
      : counts.differs > 0
        ? `every id is present; ${counts.differs} row(s) show text the catalog ` +
          "no longer says (nothing is dropped — the id is what the game reports)"
        : "every id in the manifest exists in the partner site";
  console.log(`\n${verdict}`);
  return counts;
}

// ---------------------------------------------------------------------------

async function main(opts) {
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const manifest = readManifest();
  const problems = manifestProblems(manifest);
  if (problems.length > 0) {
    throw new Error(
      `the manifest is not usable:\n  - ${problems.join("\n  - ")}`,
    );
  }

  const artDir = opts.art ?? DEFAULT_ART_DIR;
  const rows = worksheetRows(manifest, {
    artDir,
    hasArt: (file) => existsSync(path.resolve(root, file)),
  });

  if (!opts.verify) {
    reportWorksheet(rows, opts);
    return 0;
  }

  const { id: appId, source } = steamAppId(root, opts.app);
  if (!Number.isInteger(appId) || appId <= 0) {
    throw new Error(
      "no Steam app id — electron/store/steam.json → appId is not set and no " +
        "--app was given. The app has to exist first; the id is the number in " +
        "the partner-site URL (electron/RELEASING.md §1).",
    );
  }
  if (appId === SPACEWAR_APP_ID) {
    throw new Error(
      `app id ${SPACEWAR_APP_ID} is Valve's shared Spacewar test app — its ` +
        "schema is not this game's, so verifying against it proves nothing.",
    );
  }

  const credentials = steamCredentials();
  if (credentials.missing.length > 0) {
    throw new Error(
      `cannot read the partner site:\n  - ${credentials.missing.join("\n  - ")}`,
    );
  }

  // GIS_STEAM_API_HOST points the client at a stand-in for Valve, so the
  // read → compare → verdict path is exercisable end to end
  // (tests/steam_achievements_verify_test.ts) instead of only up to the socket.
  const api = new SteamPartner(credentials.key, {
    ...(process.env.GIS_STEAM_API_HOST
      ? { host: process.env.GIS_STEAM_API_HOST }
      : {}),
  });
  console.log(`reading app ${appId} (${source}) back from Steam…`);
  const schema = await api.schemaForGame(appId, {
    language: opts.language ?? "english",
  });

  const counts = reportVerify(compareSchema({ rows, schema }), {
    appId,
    schema,
  });
  if (counts.missing > 0) return 1;
  if (opts.strict && counts.differs > 0) return 1;
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof SteamSchemaEmptyError || error instanceof SteamApiError
        ? `Steam: ${error.message}`
        : `error: ${error.message}`,
    );
    if (error instanceof SteamApiError && error.status === 403) {
      console.error(`  ${STEAM_KEY_HINT}`);
    }
    process.exitCode = 1;
  }
}
