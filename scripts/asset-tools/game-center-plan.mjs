// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RECONCILE for the Game Center portal entries — what the two committed
// manifests say the portal should hold, minus what it already holds, as a work
// list. Pure: no network, no filesystem beyond a stat the caller does for it,
// so the diff can be tested against a hand-written portal state rather than
// against Apple.
//
// The manifests are already exact (generated from the live catalogs and
// drift-tested), so the interesting part is not WHAT to say but the two ways
// saying it goes wrong SILENTLY:
//
//   1. AN ID THE PORTAL HAS NEVER HEARD OF IS DROPPED. Not an error anywhere —
//      the badge or the score simply never appears. So the match key here is
//      `vendorIdentifier`, which IS the id the game reports, and never the
//      display name or the portal's own resource id.
//   2. A LEADERBOARD'S FORMATTER MUST MATCH THE SCALE THE GAME APPLIES. A
//      score is one Int64, so `kill_rate` goes out ×100 and `jesus_survival` in
//      whole seconds; a formatter that disagrees makes every score on that
//      board wrong by a factor of a hundred, or reads a clock as a bare number.
//      `ASC_FORMATTERS` pairs the two, and an unrecognised format label is a
//      hard refusal rather than a guess — the whole point of the pairing is
//      that nobody may add a format on one side only.
//
// Nothing here ever plans a DELETE. An achievement somebody has earned cannot
// be un-earned and a board's scores cannot be recovered, so a portal row the
// manifest no longer lists is REPORTED and left alone; retiring one is a
// deliberate act in the portal.

/** The locale a Game Center row is authored in when the listing names none. */
export const DEFAULT_LOCALE = "en-US";

/**
 * App Store Connect's score formatter for each label the leaderboard manifest
 * writes, and the scale the game must be applying for that formatter to read
 * correctly (`FORMAT_SCALE` in pwa/src/game/platform-leaderboards.ts).
 *
 * Keyed by Apple's own words because that is what the manifest — the file a
 * human reads and types from — carries. The list is deliberately WIDER than
 * the three formats the game ships, so adding one on the catalog side lands on
 * a known row instead of a refusal; adding one Apple supports and this table
 * does not is the refusal, and the test suite catches it before a push does.
 */
export const ASC_FORMATTERS = {
  Integer: { formatter: "INTEGER", scale: 1 },
  "Fixed Point (1 decimal)": { formatter: "DECIMAL_POINT_1_PLACE", scale: 10 },
  "Fixed Point (2 decimals)": {
    formatter: "DECIMAL_POINT_2_PLACE",
    scale: 100,
  },
  "Fixed Point (3 decimals)": {
    formatter: "DECIMAL_POINT_3_PLACE",
    scale: 1000,
  },
  "Elapsed Time (to seconds)": {
    formatter: "ELAPSED_TIME_SECOND",
    scale: 1 / 1000,
  },
  "Elapsed Time (to minutes)": {
    formatter: "ELAPSED_TIME_MINUTE",
    scale: 1 / 60_000,
  },
};

/** How the manifest's sort/submission words map onto Apple's enums. */
const SORT_TYPES = { "High to Low": "DESC", "Low to High": "ASC" };
const SUBMISSION_TYPES = {
  "Best Score": "BEST_SCORE",
  "Most Recent Score": "MOST_RECENT_SCORE",
};

/** Apple's per-achievement point range, both ends inclusive. */
const POINTS_MIN = 1;
const POINTS_MAX = 100;

/**
 * Everything wrong with the manifests THEMSELVES, checked before a single
 * request goes out. Every one of these would otherwise surface as a 4xx
 * partway through a push, leaving the portal half-written.
 */
export function manifestProblems(achievements, leaderboards) {
  const problems = [];

  const badges = achievements?.achievements ?? [];
  const limit = achievements?.limit ?? 100;
  const budget = achievements?.pointBudget ?? 1000;

  if (badges.length > limit) {
    problems.push(
      `${badges.length} achievements exceeds Game Center's limit of ${limit}`,
    );
  }
  const points = badges.reduce((sum, row) => sum + (row.points ?? 0), 0);
  if (points !== budget) {
    problems.push(
      `the achievement points total ${points}, not Game Center's budget of ` +
        `${budget} — the portal refuses the row that overruns it, so the push ` +
        "would stop partway",
    );
  }
  for (const row of badges) {
    if (row.points < POINTS_MIN || row.points > POINTS_MAX) {
      problems.push(
        `achievement ${row.id} is ${row.points} points, outside Apple's ` +
          `${POINTS_MIN}…${POINTS_MAX} per-achievement range`,
      );
    }
  }
  problems.push(...duplicates(badges, "achievement"));

  const boards = leaderboards?.leaderboards ?? [];
  const boardLimit = leaderboards?.limit ?? 100;
  if (boards.length > boardLimit) {
    problems.push(
      `${boards.length} leaderboards exceeds Game Center's limit of ${boardLimit}`,
    );
  }
  problems.push(...duplicates(boards, "leaderboard"));

  for (const row of boards) {
    const format = ASC_FORMATTERS[row.format];
    if (!format) {
      problems.push(
        `leaderboard ${row.id} has format "${row.format}", which is not one ` +
          "App Store Connect's API names — add it to ASC_FORMATTERS in " +
          "scripts/asset-tools/game-center-plan.mjs with the scale it implies",
      );
      continue;
    }
    // The pair the issue exists for. A mismatch here is the one failure mode
    // that produces plausible-looking scores that are all wrong.
    if (!near(row.scale, format.scale)) {
      problems.push(
        `leaderboard ${row.id} is submitted ×${row.scale} but "${row.format}" ` +
          `formats a value scaled ×${format.scale} — every score on that ` +
          "board would be wrong by that factor",
      );
    }
    if (!SORT_TYPES[row.sort]) {
      problems.push(`leaderboard ${row.id} has unknown sort "${row.sort}"`);
    }
    if (!SUBMISSION_TYPES[row.submission]) {
      problems.push(
        `leaderboard ${row.id} has unknown submission "${row.submission}"`,
      );
    }
  }

  return problems;
}

/** Floating-point scales (1/1000) never compare equal by ===. */
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 1e-12;

/**
 * Ids and reference names have to be unique per portal — the id because the
 * game addresses a row by it, the reference name because App Store Connect
 * refuses a second row carrying one.
 */
function duplicates(rows, kind) {
  const problems = [];
  for (const field of ["id", "name"]) {
    const seen = new Map();
    for (const row of rows) {
      const value = row[field];
      if (seen.has(value)) {
        problems.push(
          `two ${kind}s share the ${field === "id" ? "id" : "reference name"} ` +
            `"${value}" (${seen.get(value)} and ${row.id})`,
        );
      } else seen.set(value, row.id);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The achievements
// ---------------------------------------------------------------------------

/** The attributes App Store Connect should hold for one manifest row. */
export function achievementAttributes(row) {
  return {
    referenceName: row.name,
    vendorIdentifier: row.id,
    points: row.points,
    // The shelf shows every condition already, so hiding one in the portal
    // would tell a player LESS than the game does.
    showBeforeEarned: !row.hidden,
    repeatable: false,
  };
}

/** The localized text one manifest row should carry, in the given locale. */
export function achievementLocalization(row, locale) {
  return {
    locale,
    name: row.name,
    // One line, shown both before and after the badge is earned — the manifest
    // carries a single description because the game's shelf does.
    beforeEarnedDescription: row.description,
    afterEarnedDescription: row.description,
  };
}

/** The attributes App Store Connect should hold for one leaderboard row. */
export function leaderboardAttributes(row) {
  return {
    referenceName: row.name,
    vendorIdentifier: row.id,
    defaultFormatter: ASC_FORMATTERS[row.format].formatter,
    scoreSortType: SORT_TYPES[row.sort],
    submissionType: SUBMISSION_TYPES[row.submission],
  };
}

/** The localized text one leaderboard row should carry. */
export function leaderboardLocalization(row, locale) {
  const text = { locale, name: row.name, description: row.description };
  // A duration is written by the platform as a clock and takes no unit; the
  // manifest omits the suffix for exactly those boards.
  if (row.suffixPlural !== undefined) text.formatterSuffix = row.suffixPlural;
  if (row.suffixSingular !== undefined) {
    text.formatterSuffixSingular = row.suffixSingular;
  }
  return text;
}

/** Which of `want`'s fields `have` disagrees about, as `field a → b` lines. */
function differences(want, have) {
  const changes = [];
  for (const [field, value] of Object.entries(want)) {
    const current = have?.[field];
    if (current === value) continue;
    // An attribute Apple simply does not report back (it omits some on a
    // relationship read) is not a difference — writing it again every run
    // would make the plan never converge.
    if (current === undefined && value === false) continue;
    changes.push({ field, from: current, to: value });
  }
  return changes;
}

/**
 * One manifest row's plan against the portal.
 *
 * `image` is what the caller found on disk for this row — `{ file, bytes }`, or
 * null when the artwork has not been generated. A missing image is OUTSTANDING
 * rather than fatal: the rows are worth creating without it, and Game Center
 * lets one be added afterwards.
 */
function planRow({ row, portal, locale, localize, attributesOf, image }) {
  const wantAttributes = attributesOf(row);
  const wantText = localize(row, locale);
  const localization = portal?.localizations?.find((l) => l.locale === locale);

  const plan = {
    id: row.id,
    name: row.name,
    row,
    portalId: portal?.id ?? null,
    action: portal ? "update" : "create",
    attributes: wantAttributes,
    attributeChanges: portal ? differences(wantAttributes, portal) : [],
    localization: {
      action: localization ? "update" : "create",
      id: localization?.id ?? null,
      fields: wantText,
      changes: localization ? differences(wantText, localization) : [],
    },
    image: null,
  };

  if (image !== undefined) {
    plan.image = planImage(image, localization?.image ?? null);
  }

  if (
    portal &&
    plan.attributeChanges.length === 0 &&
    plan.localization.action === "update" &&
    plan.localization.changes.length === 0 &&
    (plan.image === null || plan.image.action === "ok")
  ) {
    plan.action = "unchanged";
  }
  return plan;
}

/**
 * What to do about one row's artwork. Apple reports only a name and a byte
 * count for an image it holds, so those are the comparison — which is enough:
 * the generator is deterministic, so a re-rendered badge that is byte-identical
 * genuinely needs no upload, and one that changed changes size.
 */
function planImage(image, current) {
  if (!image) return { action: "outstanding" };
  if (!current) return { action: "upload", ...image };
  if (
    current.fileName === image.fileName &&
    Number(current.fileSize) === image.bytes.length
  ) {
    return { action: "ok", ...image, portalId: current.id };
  }
  return { action: "replace", ...image, portalId: current.id };
}

/**
 * The whole work list: one entry per manifest row, plus the portal rows the
 * manifest no longer lists (reported, never deleted — see the header).
 *
 * `portalRows` is the normalized portal state: `{ id, vendorIdentifier,
 * …attributes, localizations: [{ id, locale, …text, image }] }`.
 */
export function planEntries({
  rows,
  portalRows,
  locale = DEFAULT_LOCALE,
  attributesOf,
  localize,
  imageFor,
}) {
  const byVendor = new Map(
    (portalRows ?? []).map((portal) => [portal.vendorIdentifier, portal]),
  );
  const entries = rows.map((row) =>
    planRow({
      row,
      portal: byVendor.get(row.id) ?? null,
      locale,
      attributesOf,
      localize,
      image: imageFor ? imageFor(row) : undefined,
    }),
  );
  const wanted = new Set(rows.map((row) => row.id));
  const extras = (portalRows ?? [])
    .filter((portal) => !wanted.has(portal.vendorIdentifier))
    .map((portal) => ({
      id: portal.vendorIdentifier,
      portalId: portal.id,
      name: portal.referenceName,
    }));
  return { entries, extras };
}

/** The plan for the achievement manifest. */
export function planAchievements({ rows, portalRows, locale, imageFor }) {
  return planEntries({
    rows,
    portalRows,
    locale,
    imageFor,
    attributesOf: achievementAttributes,
    localize: achievementLocalization,
  });
}

/** The plan for the leaderboard manifest. Game Center's leaderboard image is
 * optional and nothing generates one, so no image is planned. */
export function planLeaderboards({ rows, portalRows, locale }) {
  return planEntries({
    rows,
    portalRows,
    locale,
    attributesOf: leaderboardAttributes,
    localize: leaderboardLocalization,
  });
}

/** How many entries the plan actually writes. */
export function planCounts({ entries, extras }) {
  const count = (action) => entries.filter((e) => e.action === action).length;
  return {
    create: count("create"),
    update: count("update"),
    unchanged: count("unchanged"),
    images: entries.filter(
      (e) =>
        e.image &&
        (e.image.action === "upload" || e.image.action === "replace"),
    ).length,
    outstandingImages: entries.filter((e) => e.image?.action === "outstanding")
      .length,
    extras: extras.length,
  };
}
