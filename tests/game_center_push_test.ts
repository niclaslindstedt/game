// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GAME CENTER PUSH — the reconcile that turns the two committed manifests
// into App Store Connect entries, and the client that carries them there.
//
// The push itself cannot be tested against Apple, so what is pinned here is
// everything that decides WHETHER it is correct, which is all of it except the
// sockets:
//
//   - The two silent-failure modes the tool exists to prevent: a scale that
//     disagrees with the portal's score format, and a manifest whose points
//     overrun Game Center's budget (which stops a push HALFWAY, leaving the
//     portal part-written).
//   - The loop between the catalog and Apple's formatter names: every format
//     the shipped leaderboard catalog can produce has to map onto one Apple
//     accepts, so adding a format on the catalog side and forgetting the push
//     fails HERE rather than in the portal.
//   - The reconcile being idempotent — the second run of an applied plan must
//     be empty, or a re-run rewrites rows forever.
//   - The ES256 signature encoding, which Apple rejects with a bare 401 when
//     it is DER rather than the raw r‖s pair.

import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AppStoreConnect,
  AscError,
  ASC_AUDIENCE,
  mintToken,
  parseEnvFile,
  TOKEN_TTL_SECONDS,
} from "../scripts/asset-tools/app-store-connect.mjs";
import {
  achievementLocalization,
  ASC_FORMATTERS,
  type AchievementManifest,
  type LeaderboardManifest,
  manifestProblems,
  planAchievements,
  planCounts,
  planLeaderboards,
  type PortalRow,
} from "../scripts/asset-tools/game-center-plan.mjs";
import { parseArgs } from "../scripts/game-center-push.mjs";
import {
  FORMAT_SCALE,
  leaderboardManifest,
} from "../pwa/src/game/platform-leaderboards.ts";

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as T;

const ACHIEVEMENTS = read<AchievementManifest>(
  "../native/store/game-center-achievements.json",
);
const LEADERBOARDS = read<LeaderboardManifest>(
  "../native/store/game-center-leaderboards.json",
);

/** The portal's own shape for a row that matches its manifest entry exactly. */
const asPortalRow = (
  vendorIdentifier: string,
  attributes: Record<string, unknown>,
  text: Record<string, unknown>,
  image?: { id: string; fileName: string; fileSize: number } | null,
): PortalRow => ({
  id: `asc-${vendorIdentifier}`,
  vendorIdentifier,
  ...attributes,
  localizations: [{ id: `loc-${vendorIdentifier}`, ...text, image }] as never,
});

describe("the shipped manifests are pushable", () => {
  it("has nothing to refuse", () => {
    expect(manifestProblems(ACHIEVEMENTS, LEADERBOARDS)).toEqual([]);
  });

  it("spends Game Center's whole point budget, under its own limit", () => {
    const points = ACHIEVEMENTS.achievements.reduce((s, r) => s + r.points, 0);
    expect(points).toBe(ACHIEVEMENTS.pointBudget);
    expect(ACHIEVEMENTS.achievements.length).toBeLessThanOrEqual(
      ACHIEVEMENTS.limit,
    );
  });

  // THE LOOP-CLOSING TEST. The manifest writes Apple's own words for a format;
  // the push turns those words into an API enum. A format added to the catalog
  // that the push has never heard of would otherwise be found by the portal.
  it("knows an API formatter for every format the catalog can produce", () => {
    for (const row of leaderboardManifest()) {
      expect(
        ASC_FORMATTERS[row.format],
        `no App Store Connect formatter for "${row.format}" — teach ` +
          "ASC_FORMATTERS in scripts/asset-tools/game-center-plan.mjs",
      ).toBeDefined();
      expect(ASC_FORMATTERS[row.format]!.scale).toBeCloseTo(row.scale, 12);
    }
  });

  it("agrees with the engine's own scale table", () => {
    for (const scale of Object.values(FORMAT_SCALE)) {
      expect(
        Object.values(ASC_FORMATTERS).some(
          (f) => Math.abs(f.scale - scale) < 1e-12,
        ),
      ).toBe(true);
    }
  });
});

describe("the manifest refusals", () => {
  const badges = (rows: AchievementManifest["achievements"]) => ({
    limit: 100,
    pointBudget: 1000,
    count: rows.length,
    points: rows.reduce((s, r) => s + r.points, 0),
    achievements: rows,
  });
  const badge = (id: string, points: number, name = id.toUpperCase()) => ({
    id,
    name,
    description: `EARN ${id}`,
    category: "story",
    tier: "beginner",
    points,
    incremental: false,
    hidden: false,
  });
  /** Ten hundred-point badges — a manifest with nothing wrong on its own half,
   * so a leaderboard assertion below reads only the leaderboard's refusals. */
  const okBadges = () =>
    badges(Array.from({ length: 10 }, (_, i) => badge(`a${i}`, 100)));
  const boards = (rows: LeaderboardManifest["leaderboards"]) => ({
    limit: 100,
    count: rows.length,
    leaderboards: rows,
  });
  const board = (
    over: Partial<LeaderboardManifest["leaderboards"][0]> = {},
  ) => ({
    id: "kill_rate",
    name: "Kill Rate",
    description: "Kills per minute.",
    format: "Fixed Point (2 decimals)",
    scale: 100,
    sort: "High to Low",
    submission: "Best Score",
    ...over,
  });

  it("refuses a point total that is not the budget", () => {
    const problems = manifestProblems(
      badges([badge("a", 500), badge("b", 400)]),
      boards([board()]),
    );
    expect(problems.join("\n")).toMatch(/points total 900, not/);
  });

  // The reason the whole check runs BEFORE the first request: Apple refuses the
  // row that overruns the budget, so an over-budget manifest half-writes.
  it("refuses a point total over the budget", () => {
    const problems = manifestProblems(
      badges([badge("a", 100), badge("b", 100), badge("c", 100)]),
      boards([board()]),
    );
    expect(problems.join("\n")).toMatch(/points total 300, not/);
  });

  it("refuses a per-achievement value outside Apple's 1…100", () => {
    const problems = manifestProblems(
      badges([badge("a", 1000)]),
      boards([board()]),
    );
    expect(problems.join("\n")).toMatch(/achievement a is 1000 points/);
    expect(problems.join("\n")).toMatch(/outside Apple's 1…100/);
  });

  it("refuses more achievements than Game Center allows", () => {
    const rows = Array.from({ length: 101 }, (_, i) => badge(`a${i}`, 10));
    expect(
      manifestProblems(badges(rows), boards([board()])).join("\n"),
    ).toMatch(/101 achievements exceeds Game Center's limit of 100/);
  });

  it("refuses two rows sharing an id or a reference name", () => {
    const problems = manifestProblems(
      badges([badge("a", 500, "SAME"), badge("b", 500, "SAME")]),
      boards([board(), board({ id: "kill_rate" })]),
    );
    expect(problems.join("\n")).toMatch(/share the reference name "SAME"/);
    expect(problems.join("\n")).toMatch(/share the id "kill_rate"/);
  });

  // The one the issue exists for.
  it("refuses a scale that disagrees with the portal's format", () => {
    const problems = manifestProblems(
      okBadges(),
      boards([board({ scale: 1 })]),
    );
    expect(problems.join("\n")).toMatch(
      /submitted ×1 but "Fixed Point \(2 decimals\)" formats a value scaled ×100/,
    );
  });

  it("refuses a format App Store Connect has no name for", () => {
    const problems = manifestProblems(
      okBadges(),
      boards([board({ format: "Roman Numerals", scale: 1 })]),
    );
    expect(problems.join("\n")).toMatch(/is not one App Store Connect's API/);
  });

  it("refuses an unknown sort or submission word", () => {
    const problems = manifestProblems(
      okBadges(),
      boards([board({ sort: "Sideways", submission: "Whenever" })]),
    );
    expect(problems.join("\n")).toMatch(/unknown sort "Sideways"/);
    expect(problems.join("\n")).toMatch(/unknown submission "Whenever"/);
  });
});

describe("the achievement reconcile", () => {
  const rows = ACHIEVEMENTS.achievements.slice(0, 3);
  const locale = "en-US";

  it("creates every row against an empty portal", () => {
    const plan = planAchievements({ rows, portalRows: [], locale });
    expect(planCounts(plan)).toMatchObject({
      create: 3,
      update: 0,
      unchanged: 0,
      extras: 0,
    });
    expect(plan.entries[0]!.attributes).toMatchObject({
      vendorIdentifier: rows[0]!.id,
      referenceName: rows[0]!.name,
      points: rows[0]!.points,
      showBeforeEarned: true,
      repeatable: false,
    });
    // One line, both before and after — the game's shelf shows the condition
    // whether or not the badge is earned.
    expect(plan.entries[0]!.localization.fields).toEqual({
      locale,
      name: rows[0]!.name,
      beforeEarnedDescription: rows[0]!.description,
      afterEarnedDescription: rows[0]!.description,
    });
  });

  const portalFor = (only = rows) =>
    only.map((row) =>
      asPortalRow(
        row.id,
        {
          referenceName: row.name,
          points: row.points,
          showBeforeEarned: true,
          repeatable: false,
        },
        achievementLocalization(row, locale),
      ),
    );

  // Idempotence. A second run that still wants to write is a run that rewrites
  // the portal forever.
  it("plans nothing when the portal already agrees", () => {
    const plan = planAchievements({ rows, portalRows: portalFor(), locale });
    expect(planCounts(plan)).toMatchObject({
      create: 0,
      update: 0,
      unchanged: 3,
    });
  });

  it("matches on the id the game reports, never the display name", () => {
    const portalRows = portalFor();
    portalRows[0]!.referenceName = "SOMETHING ELSE";
    const plan = planAchievements({ rows, portalRows, locale });
    expect(plan.entries[0]!.action).toBe("update");
    expect(plan.entries[0]!.portalId).toBe(`asc-${rows[0]!.id}`);
    expect(plan.entries[0]!.attributeChanges).toEqual([
      { field: "referenceName", from: "SOMETHING ELSE", to: rows[0]!.name },
    ]);
  });

  it("names the re-pointed rows a catalog change produced", () => {
    const portalRows = portalFor();
    portalRows[1]!.points = 99;
    const plan = planAchievements({ rows, portalRows, locale });
    expect(plan.entries[1]!.attributeChanges).toEqual([
      { field: "points", from: 99, to: rows[1]!.points },
    ]);
  });

  it("updates a localization whose text drifted", () => {
    const portalRows = portalFor();
    portalRows[2]!.localizations![0]!.afterEarnedDescription = "STALE";
    const plan = planAchievements({ rows, portalRows, locale });
    expect(plan.entries[2]!.localization.action).toBe("update");
    expect(plan.entries[2]!.localization.changes).toEqual([
      {
        field: "afterEarnedDescription",
        from: "STALE",
        to: rows[2]!.description,
      },
    ]);
  });

  it("creates the localization for a locale the portal lacks", () => {
    const plan = planAchievements({
      rows,
      portalRows: portalFor(),
      locale: "sv-SE",
    });
    expect(plan.entries[0]!.localization.action).toBe("create");
    expect(plan.entries[0]!.localization.id).toBeNull();
  });

  // Never a delete: an earned achievement cannot be un-earned.
  it("reports a portal row the manifest no longer lists, and leaves it", () => {
    const portalRows = [
      ...portalFor(),
      asPortalRow("retired_badge", { referenceName: "RETIRED" }, {}),
    ];
    const plan = planAchievements({ rows, portalRows, locale });
    expect(plan.extras).toEqual([
      { id: "retired_badge", portalId: "asc-retired_badge", name: "RETIRED" },
    ]);
    expect(plan.entries.some((e) => e.id === "retired_badge")).toBe(false);
  });
});

describe("the achievement artwork", () => {
  const rows = ACHIEVEMENTS.achievements.slice(0, 1);
  const locale = "en-US";
  const bytes = Buffer.alloc(2048, 7);
  const art = () => ({
    file: `/tmp/${rows[0]!.id}.png`,
    fileName: `${rows[0]!.id}.png`,
    bytes,
  });

  it("reports a badge with no rendered image as outstanding, not fatal", () => {
    const plan = planAchievements({
      rows,
      portalRows: [],
      locale,
      imageFor: () => null,
    });
    expect(plan.entries[0]!.image).toEqual({ action: "outstanding" });
    expect(planCounts(plan).outstandingImages).toBe(1);
    // The row is still worth creating — Game Center takes the image later.
    expect(plan.entries[0]!.action).toBe("create");
  });

  it("uploads an image the portal has none of", () => {
    const plan = planAchievements({
      rows,
      portalRows: [],
      locale,
      imageFor: art,
    });
    expect(plan.entries[0]!.image).toMatchObject({ action: "upload" });
    expect(planCounts(plan).images).toBe(1);
  });

  it("leaves an image whose name and byte count already match", () => {
    const portalRows = [
      asPortalRow(
        rows[0]!.id,
        {
          referenceName: rows[0]!.name,
          points: rows[0]!.points,
          showBeforeEarned: true,
          repeatable: false,
        },
        achievementLocalization(rows[0]!, locale),
        { id: "img-1", fileName: `${rows[0]!.id}.png`, fileSize: bytes.length },
      ),
    ];
    const plan = planAchievements({ rows, portalRows, locale, imageFor: art });
    expect(plan.entries[0]!.image).toMatchObject({ action: "ok" });
    expect(plan.entries[0]!.action).toBe("unchanged");
  });

  it("replaces an image whose byte count changed", () => {
    const portalRows = [
      asPortalRow(
        rows[0]!.id,
        {
          referenceName: rows[0]!.name,
          points: rows[0]!.points,
          showBeforeEarned: true,
          repeatable: false,
        },
        achievementLocalization(rows[0]!, locale),
        { id: "img-1", fileName: `${rows[0]!.id}.png`, fileSize: 999 },
      ),
    ];
    const plan = planAchievements({ rows, portalRows, locale, imageFor: art });
    expect(plan.entries[0]!.image).toMatchObject({
      action: "replace",
      portalId: "img-1",
    });
    expect(plan.entries[0]!.action).toBe("update");
  });
});

describe("the leaderboard reconcile", () => {
  const rows = LEADERBOARDS.leaderboards;
  const locale = "en-US";

  it("turns each board's format into Apple's own enum", () => {
    const plan = planLeaderboards({ rows, portalRows: [], locale });
    const byId = new Map(plan.entries.map((e) => [e.id, e]));
    expect(byId.get("kill_rate")!.attributes).toMatchObject({
      defaultFormatter: "DECIMAL_POINT_2_PLACE",
      scoreSortType: "DESC",
      submissionType: "BEST_SCORE",
    });
    expect(byId.get("jesus_survival")!.attributes).toMatchObject({
      defaultFormatter: "ELAPSED_TIME_SECOND",
    });
    expect(byId.get("foes_felled")!.attributes).toMatchObject({
      defaultFormatter: "INTEGER",
    });
  });

  it("writes a unit suffix only for the boards that have one", () => {
    const plan = planLeaderboards({ rows, portalRows: [], locale });
    const byId = new Map(plan.entries.map((e) => [e.id, e]));
    expect(byId.get("foes_felled")!.localization.fields).toMatchObject({
      formatterSuffix: "kills",
      formatterSuffixSingular: "kill",
    });
    // A duration is written by the platform as a clock and takes no unit.
    expect(byId.get("jesus_survival")!.localization.fields).not.toHaveProperty(
      "formatterSuffix",
    );
  });

  it("plans no image — Game Center's board image is optional", () => {
    const plan = planLeaderboards({ rows, portalRows: [], locale });
    expect(plan.entries.every((entry) => entry.image === null)).toBe(true);
    expect(planCounts(plan).images).toBe(0);
  });
});

describe("the token", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const credentials = {
    keyId: "ABCD123456",
    issuerId: "69a6de70-0000-0000-0000-000000000000",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };

  it("carries the header and claims App Store Connect requires", () => {
    const token = mintToken(credentials, { now: 1_700_000_000 });
    const [header, payload] = token
      .split(".")
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
    expect(header).toEqual({
      alg: "ES256",
      kid: credentials.keyId,
      typ: "JWT",
    });
    expect(payload).toEqual({
      iss: credentials.issuerId,
      iat: 1_700_000_000,
      exp: 1_700_000_000 + TOKEN_TTL_SECONDS,
      aud: ASC_AUDIENCE,
    });
  });

  it("never asks for longer than Apple's twenty-minute ceiling", () => {
    expect(TOKEN_TTL_SECONDS).toBeLessThanOrEqual(20 * 60);
  });

  // The DER-vs-raw trap: OpenSSL's default encoding is rejected as a bare 401.
  it("signs with the raw r‖s pair rather than a DER sequence", () => {
    const token = mintToken(credentials, { now: 1_700_000_000 });
    const [header, payload, signature] = token.split(".") as [
      string,
      string,
      string,
    ];
    const raw = Buffer.from(signature, "base64url");
    expect(raw.length).toBe(64);
    expect(
      createVerify("SHA256")
        .update(`${header}.${payload}`)
        .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, raw),
    ).toBe(true);
  });
});

describe("the client", () => {
  const credentials = (() => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    return {
      keyId: "ABCD123456",
      issuerId: "issuer",
      privateKey: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    };
  })();

  const json = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  });

  it("follows links.next to the end of a collection", async () => {
    const calls: string[] = [];
    const api = new AppStoreConnect(credentials, {
      fetch: (async (url: string) => {
        calls.push(url);
        return calls.length === 1
          ? json({
              data: [{ id: "1" }],
              included: [{ id: "i1" }],
              links: { next: "https://api.example/page2" },
            })
          : json({ data: [{ id: "2" }] });
      }) as never,
    });
    const { data, included } = await api.list("/v1/things", { limit: 1 });
    expect(data.map((d) => d.id)).toEqual(["1", "2"]);
    expect(included.map((d) => d.id)).toEqual(["i1"]);
    // The cursor already carries every parameter; re-appending them fights it.
    expect(calls[0]).toContain("limit=1");
    expect(calls[1]).toBe("https://api.example/page2");
  });

  it("raises Apple's own words on a refusal, pointer included", async () => {
    const api = new AppStoreConnect(credentials, {
      fetch: (async () =>
        json(
          {
            errors: [
              {
                title: "An attribute value is not acceptable",
                detail: "points must be between 1 and 100",
                source: { pointer: "/data/attributes/points" },
              },
            ],
          },
          409,
        )) as never,
    });
    await expect(api.post("/v1/gameCenterAchievements", {})).rejects.toThrow(
      /points must be between 1 and 100 \(at \/data\/attributes\/points\)/,
    );
    await expect(
      api.post("/v1/gameCenterAchievements", {}),
    ).rejects.toBeInstanceOf(AscError);
  });

  it("retries a rate limit and gives up on a bad request", async () => {
    let attempts = 0;
    const waited: number[] = [];
    const api = new AppStoreConnect(credentials, {
      sleep: async (ms: number) => void waited.push(ms),
      fetch: (async () => {
        attempts++;
        return attempts < 3 ? json({}, 429) : json({ data: [] });
      }) as never,
    });
    await api.get("/v1/things");
    expect(attempts).toBe(3);
    expect(waited.length).toBe(2);

    let badRequests = 0;
    const strict = new AppStoreConnect(credentials, {
      sleep: async () => {},
      fetch: (async () => {
        badRequests++;
        return json({ errors: [{ detail: "nope" }] }, 400);
      }) as never,
    });
    await expect(strict.get("/v1/things")).rejects.toThrow(/nope/);
    expect(badRequests).toBe(1);
  });

  it("sends an asset's bytes with the headers Apple handed back", async () => {
    const sent: { url: string; init: Record<string, never> }[] = [];
    const api = new AppStoreConnect(credentials, {
      fetch: (async (url: string, init: Record<string, never>) => {
        sent.push({ url, init });
        return { ok: true, status: 200, headers: { get: () => null } };
      }) as never,
    });
    const bytes = Buffer.from("0123456789");
    await api.uploadAsset(
      [
        {
          method: "PUT",
          url: "https://upload.example/part1",
          offset: 0,
          length: 4,
          requestHeaders: [{ name: "Content-Type", value: "image/png" }],
        },
        {
          method: "PUT",
          url: "https://upload.example/part2",
          offset: 4,
          length: 6,
          requestHeaders: [],
        },
      ],
      bytes,
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]!.init.headers).toEqual({ "Content-Type": "image/png" });
    expect(Buffer.from(sent[0]!.init.body as never).toString()).toBe("0123");
    expect(Buffer.from(sent[1]!.init.body as never).toString()).toBe("456789");
    // The pre-signed PUT is not authenticated with the API token.
    expect(sent[0]!.init.headers).not.toHaveProperty("Authorization");
  });
});

describe("the arguments", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--dry-run"]).apply).toBe(false);
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });

  it("takes one half of the work, or refuses a name it doesn't know", () => {
    expect(parseArgs(["--only", "leaderboards"]).only).toBe("leaderboards");
    expect(() => parseArgs(["--only", "badges"])).toThrow(/--only takes/);
    expect(() => parseArgs(["--only"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--push"])).toThrow(/unknown argument/);
  });

  it("reads the credentials the way dotenv does", () => {
    const file = new URL("../native/.env.example", import.meta.url);
    const env = parseEnvFile(file.pathname);
    expect(env.ASC_KEY_ID).toBe("XXXXXXXXXX");
    expect(parseEnvFile("/nowhere/at/all/.env")).toEqual({});
  });
});
