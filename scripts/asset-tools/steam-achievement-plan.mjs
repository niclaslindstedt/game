// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM ACHIEVEMENT WORKSHEET AND RECONCILE — the committed manifest laid
// out in the order the partner-site form asks for it, and the diff between that
// manifest and what the partner site actually ended up holding. Pure: no
// network, no filesystem beyond a predicate the caller supplies, so both halves
// can be tested against a hand-written portal state rather than against Valve.
//
// The Steamworks partner site has no documented API for CREATING an achievement
// definition — the Web API unlocks and queries at runtime, the schema is
// authored in App Admin → Achievements by hand. So unlike Game Center's push
// (scripts/asset-tools/game-center-plan.mjs, which is this module's twin) the
// entry cannot be automated, and the failure mode it protects against is a
// TRANSCRIPTION one:
//
//   1. AN ID THE PARTNER SITE DOESN'T HAVE IS DROPPED ON THE FLOOR, silently,
//      forever. The API Name is the id the game reports verbatim, so one typo
//      in 86 rows costs a badge nobody can ever earn — and nothing anywhere
//      says so. That is what `compareSchema` exists for, and why a missing id
//      is looked up against the ids the portal DOES have (`nearestMiss`): a
//      typo and an unentered row are the same symptom and completely different
//      work, and telling them apart is most of the value.
//   2. THE ICONS ARE A SECOND, QUIETER HALF OF THE SAME ROW. A row created
//      without them shows Valve's default placeholder in the overlay rather
//      than nothing, so it never reads as broken — it just isn't the game's
//      art. Both paths therefore travel in the worksheet, filled in rather than
//      looked up, and the verify names any row the portal is still drawing
//      un-iconed.
//
// Nothing here plans a DELETE. An achievement id is permanent once any player
// has unlocked it, so a portal row the manifest no longer lists is REPORTED and
// left alone.

/**
 * The partner-site form, column by column, in the order it asks for them.
 *
 * `label` is what the form calls the field and `schemaField` is what
 * `GetSchemaForGame` calls the same thing coming back — the pair is here rather
 * than in two places so the worksheet and the verify can never drift into
 * naming one field differently.
 */
export const WORKSHEET_COLUMNS = [
  { key: "id", label: "API Name", schemaField: "name" },
  { key: "displayName", label: "Display Name", schemaField: "displayName" },
  { key: "description", label: "Description", schemaField: "description" },
  { key: "hidden", label: "Hidden", schemaField: "hidden" },
  { key: "icon", label: "Achieved icon", schemaField: "icon" },
  { key: "iconGray", label: "Unachieved icon", schemaField: "icongray" },
];

/** Where `make store-achievement-art` writes Steam's 64×64 pair. */
export const DEFAULT_ART_DIR = "electron/store/achievements";

/** The two rasters one row takes, by the suffix the art generator writes. */
export const ART_VARIANTS = { icon: "achieved", iconGray: "locked" };

/**
 * What the partner site accepts as an API Name. Valve's own achievement ids in
 * the wild are alphanumerics and underscores; anything else risks a refusal at
 * row 40 of 86, which is the worst possible time to find out.
 */
const API_NAME_SHAPE = /^[A-Za-z0-9_]+$/;

// ---------------------------------------------------------------------------
// The worksheet
// ---------------------------------------------------------------------------

/**
 * The manifest as worksheet rows: every column filled in, including both icon
 * paths, plus `artMissing` naming the rasters that have not been cut yet.
 *
 * `hasArt` is a predicate over a repo-relative path, injected so this module
 * stays pure — the caller is the one allowed to touch a disk.
 */
export function worksheetRows(
  manifest,
  { artDir = DEFAULT_ART_DIR, hasArt = () => true } = {},
) {
  return (manifest?.achievements ?? []).map((row) => {
    const art = {};
    const artMissing = [];
    for (const [key, suffix] of Object.entries(ART_VARIANTS)) {
      const file = `${artDir}/${row.id}-${suffix}.png`;
      art[key] = file;
      if (!hasArt(file)) artMissing.push(file);
    }
    return {
      id: row.id,
      displayName: row.name,
      description: row.description,
      hidden: Boolean(row.hidden),
      ...art,
      artMissing,
      category: row.category,
    };
  });
}

/** One row's value for one column, as the form wants it typed. */
function formValue(row, column) {
  const value = row[column.key];
  if (column.key === "hidden") return value ? "Yes" : "No";
  return String(value ?? "");
}

/** The same value for a spreadsheet, where Valve's own 0/1 encoding is truer. */
function dataValue(row, column) {
  const value = row[column.key];
  if (column.key === "hidden") return value ? "1" : "0";
  return String(value ?? "");
}

const csvCell = (value) =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** A tab is the field separator, so it can never appear inside a field. */
const tsvCell = (value) => value.replaceAll(/[\t\r\n]/g, " ");

/**
 * The worksheet, rendered.
 *
 *   `form`  — one block per row, field-labelled exactly as the partner-site
 *             form labels them. The default, because the entry is a web FORM:
 *             you fill six fields and hit save, 86 times, and a block read top
 *             to bottom is the shape of that job. A wide table would be scrolled
 *             sideways once per row.
 *   `tsv`   — one line per row, header first, for a spreadsheet (or a bulk
 *             import path, should Valve ever document one).
 *   `csv`   — the same, quoted.
 */
export function renderWorksheet(
  rows,
  { format = "form", columns, flagArt = true } = {},
) {
  const cols = columns ?? WORKSHEET_COLUMNS;
  if (format === "tsv" || format === "csv") {
    const cell = format === "tsv" ? tsvCell : csvCell;
    const join = format === "tsv" ? "\t" : ",";
    const lines = [cols.map((c) => cell(c.label)).join(join)];
    for (const row of rows) {
      lines.push(cols.map((c) => cell(dataValue(row, c))).join(join));
    }
    return `${lines.join("\n")}\n`;
  }
  if (format !== "form") {
    throw new Error(`unknown worksheet format "${format}" — form, tsv or csv`);
  }

  const width = Math.max(...cols.map((c) => c.label.length));
  const out = [];
  for (const [index, row] of rows.entries()) {
    const head = `── ${index + 1}/${rows.length} ── ${row.id} `;
    out.push(head + "─".repeat(Math.max(3, 72 - head.length)));
    for (const column of cols) {
      out.push(`  ${column.label.padEnd(width)}  ${formValue(row, column)}`);
    }
    // Only worth saying per row when SOME art exists: "none of it is cut yet"
    // is one fact about the run, and repeating it 86 times buries the rows it
    // is actually about.
    if (flagArt && row.artMissing.length > 0) {
      out.push(
        `  ${"!".padEnd(width)}  ${row.artMissing.length} icon(s) not cut yet ` +
          '— `make store-achievement-art ARGS="--only steam"`',
      );
    }
    out.push("");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// The manifest's own refusals
// ---------------------------------------------------------------------------

/**
 * Everything wrong with the manifest ITSELF, checked before a worksheet is
 * printed or a request goes out. Each of these would otherwise surface as a
 * partner-site refusal partway through 86 hand-entered rows.
 */
export function manifestProblems(manifest) {
  const problems = [];
  const rows = manifest?.achievements ?? [];
  const limit = manifest?.limit ?? 100;

  // Steam's cap is on the COUNT, and the portal simply refuses row 101 — long
  // after the catalog change that added it.
  if (rows.length > limit && !manifest?.fullCatalog) {
    problems.push(
      `${rows.length} achievements exceeds Steam's ${limit} for an app that ` +
        "has not reached the Profile Features threshold yet",
    );
  }

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.id)) {
      problems.push(
        `two achievements share the API Name "${row.id}" — the partner site ` +
          "refuses the second, and the game could only ever unlock one",
      );
    } else seen.set(row.id, row);

    if (!API_NAME_SHAPE.test(row.id ?? "")) {
      problems.push(
        `achievement "${row.id}" is not a usable API Name — the partner site ` +
          "takes letters, digits and underscores",
      );
    }
    if (!String(row.name ?? "").trim()) {
      problems.push(`achievement ${row.id} has no display name`);
    }
    if (!String(row.description ?? "").trim()) {
      problems.push(`achievement ${row.id} has no description`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The reconcile
// ---------------------------------------------------------------------------

/** Levenshtein distance, capped — the strings here are short ids. */
export function editDistance(a, b) {
  if (a === b) return 0;
  const rows = a.length + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** Case and separators removed — what two ids that differ only in typing share. */
const normalizeId = (id) =>
  String(id)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

/**
 * The portal id most likely to BE this one, mistyped — or null when nothing is
 * close enough to accuse.
 *
 * Two rules, in order. A normalized match (case, hyphen-for-underscore, a stray
 * space) is a certainty rather than a guess, so it wins outright. Otherwise a
 * short edit distance, scaled to the id's length so `moon` needs an exact-ish
 * neighbour while `clear_the_bunker_deep` may be off by more.
 */
export function nearestMiss(id, candidates) {
  const target = normalizeId(id);
  for (const candidate of candidates) {
    if (normalizeId(candidate) === target) {
      return {
        id: candidate,
        distance: editDistance(id, candidate),
        certain: true,
      };
    }
  }
  const budget = Math.max(1, Math.floor(id.length / 5));
  let best = null;
  for (const candidate of candidates) {
    const distance = editDistance(id, candidate);
    if (distance <= budget && (best === null || distance < best.distance)) {
      best = { id: candidate, distance, certain: false };
    }
  }
  return best;
}

/** Which of the worksheet's fields the portal's row disagrees about. */
function textDifferences(row, portal) {
  const changes = [];
  for (const column of WORKSHEET_COLUMNS) {
    if (column.key === "id" || column.key.startsWith("icon")) continue;
    const want = row[column.key];
    const have = portal[column.key];
    if (want === have) continue;
    changes.push({ field: column.label, from: have, to: want });
  }
  return changes;
}

/**
 * The manifest against the partner site, as a verdict per row.
 *
 * `state` is one of:
 *   `ok`      — the portal has this id, with the manifest's own text.
 *   `missing` — the portal has never heard of this id. Every report the game
 *               makes for it is dropped. `suggestion` names the portal id it is
 *               probably a mistyping of, when there is one.
 *   `differs` — the id is right (so nothing is dropped) and the text is not.
 *
 * `icons` names the rows the portal is drawing with no artwork of ours, and
 * `extras` the portal rows the manifest no longer lists — reported, never
 * deleted, because an id is permanent once anybody has unlocked it.
 */
export function compareSchema({ rows, schema }) {
  const portalRows = schema?.achievements ?? [];
  const byId = new Map(portalRows.map((row) => [row.id, row]));
  const wanted = new Set(rows.map((row) => row.id));
  const unmatched = portalRows
    .map((row) => row.id)
    .filter((id) => !wanted.has(id));

  const entries = rows.map((row) => {
    const portal = byId.get(row.id);
    if (!portal) {
      return {
        id: row.id,
        name: row.displayName,
        state: "missing",
        differences: [],
        suggestion: nearestMiss(row.id, unmatched),
        icons: null,
      };
    }
    const differences = textDifferences(row, portal);
    return {
      id: row.id,
      name: row.displayName,
      state: differences.length > 0 ? "differs" : "ok",
      differences,
      suggestion: null,
      icons: {
        achieved: Boolean(portal.icon),
        locked: Boolean(portal.iconGray),
      },
    };
  });

  const extras = unmatched.map((id) => ({
    id,
    name: byId.get(id)?.displayName ?? "",
  }));

  return { entries, extras };
}

/** How the comparison adds up, for the one-line verdict. */
export function compareCounts({ entries, extras }) {
  const count = (state) => entries.filter((e) => e.state === state).length;
  return {
    ok: count("ok"),
    missing: count("missing"),
    differs: count("differs"),
    // A typo is a missing row whose id the portal nearly has — worth counting
    // apart, because the fix is an edit rather than a new row.
    typos: entries.filter((e) => e.state === "missing" && e.suggestion).length,
    iconless: entries.filter(
      (e) => e.icons && (!e.icons.achieved || !e.icons.locked),
    ).length,
    extras: extras.length,
  };
}
