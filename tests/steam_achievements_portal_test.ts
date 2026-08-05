// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM ACHIEVEMENT WORKSHEET AND ITS VERIFICATION PASS.
//
// Steam's 86 rows are typed into a web form by hand — Valve documents no API
// for creating an achievement DEFINITION — so what is pinned here is everything
// that decides whether the two halves of that job are trustworthy:
//
//   - The worksheet carrying every column the form asks for, in its order, with
//     both icon paths filled in rather than looked up. A column that quietly
//     stopped being emitted is a field somebody types from memory.
//   - The verification pass catching the failure the whole issue is about: an
//     API Name the partner site doesn't have, whose unlocks are dropped on the
//     floor silently and forever. Including the case that LOOKS like a missing
//     row and isn't — one typed slightly wrong — because the fix is an edit
//     rather than a new row.
//   - The escaping, since a description with a comma in it splitting a CSV
//     column would corrupt exactly the transcription this exists to make safe.
//   - The shipped manifest actually being enterable: under Steam's cap, no two
//     rows sharing an API Name, every id a name the partner site accepts.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ART_VARIANTS,
  type GameSchema,
  compareCounts,
  compareSchema,
  editDistance,
  manifestProblems,
  nearestMiss,
  renderWorksheet,
  type SchemaAchievement,
  type SteamAchievementManifest,
  type SteamAchievementRow,
  WORKSHEET_COLUMNS,
  worksheetRows,
} from "../scripts/asset-tools/steam-achievement-plan.mjs";
import { steamAppId } from "../scripts/asset-tools/steam-partner.mjs";
import { parseArgs } from "../scripts/steam-achievements-portal.mjs";

const MANIFEST = JSON.parse(
  readFileSync(
    new URL("../electron/store/steam-achievements.json", import.meta.url),
    "utf8",
  ),
) as SteamAchievementManifest;

const badge = (id: string, over: Partial<SteamAchievementRow> = {}) => ({
  id,
  name: id.toUpperCase().replaceAll("_", " "),
  description: `EARN ${id}`,
  category: "story",
  tier: "beginner",
  hidden: false,
  ...over,
});

const manifest = (rows: SteamAchievementRow[]): SteamAchievementManifest => ({
  limit: 100,
  fullCatalog: false,
  count: rows.length,
  achievements: rows,
});

/** What `GetSchemaForGame` reports for a row that matches the manifest. */
const portalRow = (
  row: SteamAchievementRow,
  over: Partial<SchemaAchievement> = {},
): SchemaAchievement => ({
  id: row.id,
  displayName: row.name,
  description: row.description,
  hidden: row.hidden,
  icon: `https://cdn/${row.id}.jpg`,
  iconGray: `https://cdn/${row.id}_gray.jpg`,
  ...over,
});

const schema = (achievements: SchemaAchievement[]): GameSchema => ({
  gameName: "Ada's Trail",
  gameVersion: "1",
  achievements,
  stats: [],
});

describe("the shipped manifest is enterable", () => {
  it("has nothing to refuse", () => {
    expect(manifestProblems(MANIFEST)).toEqual([]);
  });

  it("stays under Steam's cap for an app without Profile Features", () => {
    expect(MANIFEST.achievements.length).toBeLessThanOrEqual(MANIFEST.limit);
    expect(MANIFEST.count).toBe(MANIFEST.achievements.length);
  });

  // The worksheet is only mechanical if every row is complete: a blank cell is
  // one somebody fills in from somewhere else, which is where a typo comes from.
  it("fills every column of every row", () => {
    const rows = worksheetRows(MANIFEST, { hasArt: () => true });
    expect(rows).toHaveLength(MANIFEST.count);
    for (const row of rows) {
      for (const column of WORKSHEET_COLUMNS) {
        const value = (row as unknown as Record<string, unknown>)[column.key];
        expect(value, `${row.id} has no ${column.label}`).not.toBe("");
        expect(value, `${row.id} has no ${column.label}`).toBeDefined();
      }
    }
  });
});

describe("the worksheet", () => {
  const rows = () =>
    worksheetRows(manifest([badge("clear_moon"), badge("boss_slayer")]), {
      hasArt: () => true,
    });

  it("names both icons where the art generator writes them", () => {
    const moon = rows()[0]!;
    expect(moon.icon).toBe(
      `electron/store/achievements/clear_moon-${ART_VARIANTS.icon}.png`,
    );
    expect(moon.iconGray).toBe(
      `electron/store/achievements/clear_moon-${ART_VARIANTS.iconGray}.png`,
    );
    expect(moon.artMissing).toEqual([]);
  });

  it("names the rasters that have not been cut yet", () => {
    const moon = worksheetRows(manifest([badge("clear_moon")]), {
      hasArt: (file) => file.endsWith("-achieved.png"),
    })[0]!;
    expect(moon.artMissing).toEqual([
      "electron/store/achievements/clear_moon-locked.png",
    ]);
  });

  it("honours an art directory that isn't the default", () => {
    const moon = worksheetRows(manifest([badge("clear_moon")]), {
      artDir: "/tmp/badges",
      hasArt: () => true,
    })[0]!;
    expect(moon.icon).toBe("/tmp/badges/clear_moon-achieved.png");
  });

  // The point of the form layout: the fields come in the order the partner
  // site asks for them, so it is filled top to bottom without hunting.
  it("lays a row out in the form's own order", () => {
    const block = renderWorksheet(rows(), { format: "form" }).split("\n");
    const labels = block
      .filter((line) => line.startsWith("  ") && !line.startsWith("  !"))
      .slice(0, WORKSHEET_COLUMNS.length)
      .map((line) => line.trim().split(/\s{2,}/)[0]);
    expect(labels).toEqual(WORKSHEET_COLUMNS.map((c) => c.label));
  });

  it("writes Valve's own 0/1 for the hidden flag in a data format", () => {
    const lines = renderWorksheet(
      worksheetRows(manifest([badge("secret", { hidden: true })]), {
        hasArt: () => true,
      }),
      { format: "tsv" },
    ).split("\n");
    expect(lines[0]!.split("\t")).toEqual(
      WORKSHEET_COLUMNS.map((c) => c.label),
    );
    expect(lines[1]!.split("\t")[3]).toBe("1");
  });

  it("says Yes/No for the same flag on the form, which is a checkbox", () => {
    const block = renderWorksheet(
      worksheetRows(manifest([badge("secret", { hidden: true })]), {
        hasArt: () => true,
      }),
    );
    expect(block).toMatch(/Hidden\s+Yes/);
  });

  // A description with a comma in it would otherwise split a column and shift
  // every field after it — silently, which is this tool's whole enemy.
  it("quotes a CSV field that carries a separator", () => {
    const csv = renderWorksheet(
      worksheetRows(
        manifest([badge("a", { description: 'KILL 10, THEN "RUN"' })]),
        { hasArt: () => true },
      ),
      { format: "csv" },
    );
    expect(csv).toContain('"KILL 10, THEN ""RUN"""');
  });

  it("refuses a format it does not have", () => {
    expect(() => renderWorksheet(rows(), { format: "vdf" as "csv" })).toThrow(
      /unknown worksheet format/,
    );
  });
});

describe("the manifest's refusals", () => {
  it("refuses more rows than Steam allows a new app", () => {
    const rows = Array.from({ length: 101 }, (_, i) => badge(`a${i}`));
    expect(manifestProblems(manifest(rows)).join("\n")).toMatch(
      /101 achievements exceeds Steam's 100/,
    );
  });

  // The cap lifts at Valve's Profile Features threshold, and the manifest says
  // so itself — the refusal must not outlive the limit it is about.
  it("allows the whole catalog once the cap has lifted", () => {
    const rows = Array.from({ length: 226 }, (_, i) => badge(`a${i}`));
    expect(manifestProblems({ ...manifest(rows), fullCatalog: true })).toEqual(
      [],
    );
  });

  it("refuses two rows sharing an API Name", () => {
    expect(
      manifestProblems(manifest([badge("moon"), badge("moon")])).join("\n"),
    ).toMatch(/share the API Name "moon"/);
  });

  it("refuses an API Name the partner site would not take", () => {
    expect(
      manifestProblems(manifest([badge("clear moon!")])).join("\n"),
    ).toMatch(/not a usable API Name/);
  });

  it("refuses a row with no text to type", () => {
    const problems = manifestProblems(
      manifest([badge("a", { name: "" }), badge("b", { description: " " })]),
    ).join("\n");
    expect(problems).toMatch(/a has no display name/);
    expect(problems).toMatch(/b has no description/);
  });
});

describe("the verification pass", () => {
  const rows = () =>
    worksheetRows(
      manifest([badge("clear_moon"), badge("boss_slayer"), badge("farm_25")]),
      { hasArt: () => true },
    );

  it("calls a fully-entered portal correct", () => {
    const entered = manifest([
      badge("clear_moon"),
      badge("boss_slayer"),
      badge("farm_25"),
    ]).achievements.map((row) => portalRow(row));
    const counts = compareCounts(
      compareSchema({ rows: rows(), schema: schema(entered) }),
    );
    expect(counts).toMatchObject({ ok: 3, missing: 0, differs: 0, extras: 0 });
  });

  // THE ONE THE ISSUE EXISTS FOR. An id the portal never got is dropped
  // silently, forever — nothing else in the pipeline says a word about it.
  it("names an id the partner site has never heard of", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([portalRow(badge("clear_moon"))]),
    });
    const missing = comparison.entries.filter((e) => e.state === "missing");
    expect(missing.map((e) => e.id)).toEqual(["boss_slayer", "farm_25"]);
    expect(compareCounts(comparison).missing).toBe(2);
  });

  // A typo and an unentered row look identical from here and are completely
  // different work, so the near-miss is named rather than left to be found.
  it("spots a mistyped id among the rows the portal does have", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon")),
        portalRow(badge("boss_slayr")),
        portalRow(badge("farm_25")),
      ]),
    });
    const missing = comparison.entries.filter((e) => e.state === "missing")[0]!;
    expect(missing.id).toBe("boss_slayer");
    expect(missing.suggestion?.id).toBe("boss_slayr");
    expect(compareCounts(comparison).typos).toBe(1);
  });

  // Case and separators are the transcription slips a distance check can be
  // certain about rather than merely suspicious of.
  it("is certain about an id that differs only in typing", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon")),
        portalRow(badge("Boss-Slayer")),
        portalRow(badge("farm_25")),
      ]),
    });
    const missing = comparison.entries.filter((e) => e.state === "missing")[0]!;
    expect(missing.suggestion).toMatchObject({
      id: "Boss-Slayer",
      certain: true,
    });
  });

  it("accuses nothing when no portal id is close", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([portalRow(badge("something_else_entirely"))]),
    });
    expect(comparison.entries.every((e) => e.suggestion === null)).toBe(true);
  });

  it("reports drifted text without calling the row dropped", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon"), { displayName: "The Moon" }),
        portalRow(badge("boss_slayer")),
        portalRow(badge("farm_25")),
      ]),
    });
    const moon = comparison.entries[0]!;
    expect(moon.state).toBe("differs");
    expect(moon.differences).toEqual([
      { field: "Display Name", from: "The Moon", to: "CLEAR MOON" },
    ]);
    expect(compareCounts(comparison).missing).toBe(0);
  });

  it("notices a hidden flag the portal ticked and the catalog did not", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon"), { hidden: true }),
        portalRow(badge("boss_slayer")),
        portalRow(badge("farm_25")),
      ]),
    });
    expect(comparison.entries[0]!.differences[0]!.field).toBe("Hidden");
  });

  // A row with no icons is not broken to look at — Valve draws a placeholder —
  // so nothing but a check like this ever finds it.
  it("names a row the portal is drawing with no artwork", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon"), { iconGray: "" }),
        portalRow(badge("boss_slayer")),
        portalRow(badge("farm_25")),
      ]),
    });
    expect(comparison.entries[0]!.icons).toEqual({
      achieved: true,
      locked: false,
    });
    expect(compareCounts(comparison).iconless).toBe(1);
  });

  // An id is permanent once anybody has unlocked it, so a portal row the
  // manifest no longer lists is reported and never proposed for deletion.
  it("reports a portal row the manifest no longer lists, and leaves it", () => {
    const comparison = compareSchema({
      rows: rows(),
      schema: schema([
        portalRow(badge("clear_moon")),
        portalRow(badge("boss_slayer")),
        portalRow(badge("farm_25")),
        portalRow(badge("retired_badge")),
      ]),
    });
    expect(comparison.extras).toEqual([
      { id: "retired_badge", name: "RETIRED BADGE" },
    ]);
    expect(compareCounts(comparison).missing).toBe(0);
  });

  // The second, larger run this is built for: the cap lifts and another 140
  // rows go in the same way.
  it("scales to the whole catalog the lifted cap allows", () => {
    const all = Array.from({ length: 226 }, (_, i) => badge(`a${i}`));
    const entered = all
      .filter((_, i) => i !== 199)
      .map((row) => portalRow(row));
    const counts = compareCounts(
      compareSchema({
        rows: worksheetRows(
          { ...manifest(all), fullCatalog: true },
          {
            hasArt: () => true,
          },
        ),
        schema: schema(entered),
      }),
    );
    expect(counts).toMatchObject({ ok: 225, missing: 1 });
  });
});

describe("nearestMiss", () => {
  it("scales its tolerance to the id's length", () => {
    // Four characters: only an exact-ish neighbour may be accused.
    expect(nearestMiss("moon", ["mars"])).toBeNull();
    expect(nearestMiss("moon", ["moom"])?.id).toBe("moom");
    // Twenty-one: two slips is still plainly the same id.
    expect(
      nearestMiss("clear_the_bunker_deep", ["clear_the_bunkr_deep"])?.id,
    ).toBe("clear_the_bunkr_deep");
  });

  it("prefers the closest of several candidates", () => {
    expect(
      nearestMiss("boss_slayer", ["boss_slayerr", "boss_sxayerr"])?.id,
    ).toBe("boss_slayerr");
  });

  it("measures an edit distance the usual way", () => {
    expect(editDistance("moon", "moon")).toBe(0);
    expect(editDistance("moon", "moo")).toBe(1);
    expect(editDistance("", "mars")).toBe(4);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("the command line", () => {
  it("prints the worksheet and writes nothing by default", () => {
    expect(parseArgs([])).toMatchObject({
      verify: false,
      strict: false,
      format: "form",
    });
  });

  it("takes the flags the docs promise", () => {
    expect(
      parseArgs(["--verify", "--strict", "--app", "1234560"]),
    ).toMatchObject({ verify: true, strict: true, app: "1234560" });
    expect(parseArgs(["--format", "tsv", "--out", "sheet.tsv"])).toMatchObject({
      format: "tsv",
      out: "sheet.tsv",
    });
  });

  it("refuses what it cannot do", () => {
    expect(() => parseArgs(["--format", "vdf"])).toThrow(/--format takes/);
    expect(() => parseArgs(["--strict"])).toThrow(/only means something/);
    expect(() => parseArgs(["--out"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--push"])).toThrow(/unknown argument/);
  });
});

describe("the app id", () => {
  const root = new URL("..", import.meta.url).pathname;

  it("prefers an explicit override to everything else", () => {
    expect(steamAppId(root, "999999")).toEqual({ id: 999999, source: "--app" });
  });

  it("falls back to the committed ids", () => {
    // Unset in a fresh checkout — the point is that it reads the file rather
    // than inventing a default that would ship into Valve's shared sandbox.
    const resolved = steamAppId(root);
    expect(
      resolved.source === null || resolved.source.endsWith("steam.json"),
    ).toBe(true);
  });
});
