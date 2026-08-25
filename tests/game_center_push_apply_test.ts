// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GAME CENTER PUSH, END TO END — the script driven as a script, against a
// stand-in for App Store Connect (`GIS_ASC_HOST`).
//
// The reconcile itself is unit-tested next door; what this file is for is
// everything BETWEEN the socket and the plan, which no unit test reaches: the
// portal read being flattened into the shape the reconcile compares against,
// the dry run writing nothing at all, the request SEQUENCE a create actually
// makes (row → localization → reserve image → upload bytes → confirm), and the
// second run of an applied push being empty.
//
// The stand-in is deliberately dumb — it stores what it is given and answers
// what it stored. It is not a model of Apple's validation; the point is the
// shape of the conversation, and Apple's own refusals are surfaced verbatim
// rather than predicted here.

import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

/** How many rows the committed manifest holds, read rather than typed: the
 * curated list moves whenever the badge catalog does (a hero rung added, a
 * family sent home), and a number typed into these assertions turns every such
 * change into a sweep through this file. */
const ROWS = (
  JSON.parse(
    readFileSync(
      new URL("../native/store/game-center-achievements.json", import.meta.url),
      "utf8",
    ),
  ) as { achievements: unknown[] }
).achievements.length;
const SCRIPT = path.join(root, "scripts", "game-center-push.mjs");
const APP_ID = "6740000000";
const DETAIL_ID = "detail-1";

/** A credential set shaped like the real thing, signing nothing that matters. */
const credentials = () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return {
    ASC_KEY_ID: "ABCD123456",
    ASC_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    ASC_KEY_CONTENT: Buffer.from(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    ).toString("base64"),
    // The template's own values count as unset, so the path must not linger.
    ASC_KEY_PATH: "",
  };
};

type Row = {
  id: string;
  attributes: Record<string, unknown>;
  localizations: string[];
};
type Localization = {
  id: string;
  parent: string;
  attributes: Record<string, unknown>;
  image: string | null;
};

/** The portal, as far as this test is concerned. */
class Portal {
  rows = new Map<string, Row>();
  localizations = new Map<string, Localization>();
  images = new Map<string, Record<string, unknown>>();
  uploads: { url: string; bytes: number }[] = [];
  log: string[] = [];
  #next = 0;

  id(prefix: string) {
    return `${prefix}-${++this.#next}`;
  }

  /** Seed a row that already matches what the manifest wants. */
  seed(
    collection: string,
    vendorIdentifier: string,
    attributes: Record<string, unknown>,
    text: Record<string, unknown>,
  ) {
    const row: Row = {
      id: this.id(collection),
      attributes: { vendorIdentifier, ...attributes },
      localizations: [],
    };
    const locale: Localization = {
      id: this.id("loc"),
      parent: row.id,
      attributes: text,
      image: null,
    };
    row.localizations.push(locale.id);
    this.rows.set(row.id, row);
    this.localizations.set(locale.id, locale);
    (this.collections[collection] ??= []).push(row.id);
    return row;
  }

  collections: Record<string, string[]> = {};
}

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      );
    });
  });

function stubServer(portal: Portal) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const parts = url.pathname.split("/").filter(Boolean);
    portal.log.push(`${req.method} ${url.pathname}`);

    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const body = () =>
      new Promise<Record<string, never>>((resolve) => {
        let text = "";
        req.on("data", (chunk) => (text += chunk));
        req.on("end", () => resolve(text ? JSON.parse(text) : {}));
      });

    // The pre-signed upload target Apple hands back. Not part of the API.
    if (parts[0]! === "upload") {
      let bytes = 0;
      req.on("data", (chunk) => (bytes += chunk.length));
      req.on("end", () => {
        portal.uploads.push({ url: url.pathname, bytes });
        res.writeHead(200).end();
      });
      return;
    }

    const resource = (row: Row, type: string) => ({
      type,
      id: row.id,
      attributes: row.attributes,
    });

    // GET /v1/apps/{id}/gameCenterDetail — the app's own to-one relationship,
    // which is the ONLY read Apple offers: `gameCenterDetails` allows just
    // CREATE, GET_INSTANCE and UPDATE, so a filtered collection GET is refused
    // with a 403. An app with Game Center switched off answers 404 here.
    if (
      req.method === "GET" &&
      parts[1]! === "apps" &&
      parts[3]! === "gameCenterDetail" &&
      parts.length === 4
    ) {
      return parts[2]! === APP_ID
        ? send(200, { data: { type: "gameCenterDetails", id: DETAIL_ID } })
        : send(404, { errors: [{ status: "404", code: "NOT_FOUND" }] });
    }

    // GET /v1/gameCenterDetails/{id}/{collection}
    if (
      req.method === "GET" &&
      parts[1]! === "gameCenterDetails" &&
      parts.length === 4
    ) {
      const collection = parts[3]!;
      const ids = portal.collections[collection] ?? [];
      return send(200, {
        data: ids.map((id) => resource(portal.rows.get(id)!, collection)),
      });
    }

    // GET /v1/{collection}/{id}/localizations
    if (req.method === "GET" && parts[3]! === "localizations") {
      const row = portal.rows.get(parts[2]!);
      const locales = (row?.localizations ?? []).map((id) =>
        portal.localizations.get(id)!,
      );
      const included = locales
        .filter((locale) => locale.image)
        .map((locale) => ({
          type: "gameCenterAchievementImages",
          id: locale.image,
          attributes: portal.images.get(locale.image!),
        }));
      return send(200, {
        data: locales.map((locale) => ({
          type: `${parts[1]!}Localizations`,
          id: locale.id,
          attributes: locale.attributes,
          relationships: locale.image
            ? {
                gameCenterAchievementImage: {
                  data: {
                    type: "gameCenterAchievementImages",
                    id: locale.image,
                  },
                },
              }
            : {},
        })),
        included,
      });
    }

    if (req.method === "POST") {
      void body().then((payload) => {
        const data = payload.data as unknown as {
          type: string;
          attributes: Record<string, unknown>;
          relationships?: Record<string, { data: { id: string } }>;
        };
        const type = data.type;
        if (type.endsWith("Localizations")) {
          const parent = Object.values(data.relationships ?? {})[0]!.data.id;
          const locale: Localization = {
            id: portal.id("loc"),
            parent,
            attributes: data.attributes,
            image: null,
          };
          portal.localizations.set(locale.id, locale);
          portal.rows.get(parent)?.localizations.push(locale.id);
          return send(201, {
            data: { type, id: locale.id, attributes: locale.attributes },
          });
        }
        if (type.endsWith("Images")) {
          const localizationId = Object.values(data.relationships ?? {})[0]!
            .data.id;
          const id = portal.id("img");
          portal.images.set(id, { ...data.attributes, uploaded: false });
          portal.localizations.get(localizationId)!.image = id;
          return send(201, {
            data: {
              type,
              id,
              attributes: {
                ...data.attributes,
                uploadOperations: [
                  {
                    method: "PUT",
                    url: `${HOST}/upload/${id}`,
                    offset: 0,
                    length: data.attributes.fileSize,
                    requestHeaders: [
                      { name: "Content-Type", value: "image/png" },
                    ],
                  },
                ],
              },
            },
          });
        }
        const row: Row = {
          id: portal.id(type),
          attributes: data.attributes,
          localizations: [],
        };
        portal.rows.set(row.id, row);
        (portal.collections[type] ??= []).push(row.id);
        return send(201, { data: resource(row, type) });
      });
      return;
    }

    if (req.method === "PATCH") {
      void body().then((payload) => {
        const data = payload.data as unknown as {
          type: string;
          id: string;
          attributes: Record<string, unknown>;
        };
        const target =
          portal.rows.get(data.id) ?? portal.localizations.get(data.id) ?? null;
        if (target) {
          Object.assign(target.attributes, data.attributes);
        } else if (portal.images.has(data.id)) {
          Object.assign(portal.images.get(data.id)!, data.attributes);
        }
        return send(200, { data: { type: data.type, id: data.id } });
      });
      return;
    }

    if (req.method === "DELETE") {
      portal.images.delete(parts[2]!);
      for (const locale of portal.localizations.values()) {
        if (locale.image === parts[2]!) locale.image = null;
      }
      res.writeHead(204).end();
      return;
    }

    send(404, {
      errors: [{ detail: `stub has no ${req.method} ${url.pathname}` }],
    });
  });
}

let HOST = "";
let portal: Portal;
let server: Server;

/**
 * The script, run as a script. NOT `spawnSync`: the stand-in server lives on
 * this very thread, so blocking it while the child waits for an answer is a
 * deadlock — the request arrives and nothing is listening.
 */
const run = (args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        cwd: root,
        env: { ...process.env, ...credentials(), GIS_ASC_HOST: HOST },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    },
  );

beforeAll(async () => {
  portal = new Portal();
  server = stubServer(portal);
  HOST = await listen(server);
});

afterAll(() => {
  server.close();
});

/** Every test here SPAWNS the real script against the HTTP stand-in — two full
 * runs of it in places — so vitest's 5 s default is not a budget for anything
 * these measure, and under the full suite's load it timed one out on a run
 * where the same test passes in 11 s on its own. The number is a ceiling for a
 * hung child process, not a performance assertion. */
const SPAWN_MS = 60_000;

describe("the dry run", { timeout: SPAWN_MS }, () => {
  it("reads the portal, prints the work list, and writes nothing", async () => {
    const result = await run(["--app", APP_ID, "--only", "leaderboards"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DRY RUN, nothing is written");
    expect(result.stdout).toContain(
      "5 leaderboards — every format matches its scale",
    );
    expect(result.stdout).toContain("create    hardest_blow");
    expect(result.stdout).toContain("5 to create, 0 to update");
    expect(result.stdout).toContain("re-run with --apply");
    // The whole conversation was reads.
    expect(portal.log.every((line) => line.startsWith("GET"))).toBe(true);
    expect(portal.rows.size).toBe(0);
  });

  // A missing detail is a PLANNED CREATE rather than a refusal: enabling Game
  // Center on an app IS creating this resource, and CREATE is one of the three
  // operations Apple allows on it. The dry run says so and writes nothing.
  it("plans the Game Center detail for an app that has none", async () => {
    portal.log.length = 0;
    const result = await run(["--app", "999", "--only", "leaderboards"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/would be CREATED/);
    expect(portal.log.every((line) => line.startsWith("GET"))).toBe(true);
  });
});

describe("the apply", { timeout: SPAWN_MS }, () => {
  it("creates each board and its localization, then has nothing left to do", async () => {
    portal.log.length = 0;
    const first = await run([
      "--app",
      APP_ID,
      "--only",
      "leaderboards",
      "--apply",
    ]);
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/pushed 5 new and 0 changed row\(s\)/);
    // Configured is not released — the push says so rather than implying it.
    expect(first.stdout).toMatch(/not RELEASED/);

    expect(portal.collections.gameCenterLeaderboards!).toHaveLength(5);
    const created = portal.collections.gameCenterLeaderboards!.map(
      (id) => portal.rows.get(id)!.attributes,
    );
    const killRate = created.find((a) => a.vendorIdentifier === "kill_rate")!;
    expect(killRate.defaultFormatter).toBe("DECIMAL_POINT_2_PLACE");
    expect(killRate.scoreSortType).toBe("DESC");
    expect(killRate.submissionType).toBe("BEST_SCORE");
    const survival = created.find(
      (a) => a.vendorIdentifier === "jesus_survival",
    )!;
    expect(survival.defaultFormatter).toBe("ELAPSED_TIME_SECOND");

    const text = [...portal.localizations.values()].map((l) => l.attributes);
    expect(text).toHaveLength(5);
    expect(text.every((t) => t.locale === "en-US")).toBe(true);
    expect(text.find((t) => t.name === "Foes Felled")).toMatchObject({
      formatterSuffix: "kills",
      formatterSuffixSingular: "kill",
    });

    // THE IDEMPOTENCE THAT MAKES RE-RUNNING THE NORMAL WAY TO APPLY A CHANGE.
    portal.log.length = 0;
    const second = await run([
      "--app",
      APP_ID,
      "--only",
      "leaderboards",
      "--apply",
    ]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("0 to create, 0 to update");
    expect(second.stdout).toContain("5 unchanged");
    expect(portal.log.every((line) => line.startsWith("GET"))).toBe(true);
  });

  it("patches only what drifted, and never the vendor id", async () => {
    const board = [...portal.rows.values()].find(
      (row) => row.attributes.vendorIdentifier === "foes_felled",
    )!;
    board.attributes.referenceName = "OLD NAME";
    const localization = portal.localizations.get(board.localizations[0]!)!;
    localization.attributes.description = "stale blurb";

    portal.log.length = 0;
    const result = await run([
      "--app",
      APP_ID,
      "--only",
      "leaderboards",
      "--apply",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 to create, 1 to update");
    expect(board.attributes.referenceName).toBe("Foes Felled");
    expect(board.attributes.vendorIdentifier).toBe("foes_felled");
    expect(localization.attributes.description).toBe(
      "Every mob killed, across every hero and every run.",
    );
    // One row touched, not five.
    expect(portal.log.filter((line) => line.startsWith("PATCH"))).toHaveLength(
      2,
    );
  });

  it("leaves a board the manifest no longer lists alone, and says so", async () => {
    portal.seed(
      "gameCenterLeaderboards",
      "retired_board",
      { referenceName: "Retired" },
      { locale: "en-US", name: "Retired" },
    );
    const result = await run([
      "--app",
      APP_ID,
      "--only",
      "leaderboards",
      "--apply",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "1 in the portal but not in the manifest, left alone:",
    );
    expect(result.stdout).toContain("retired_board");
    expect(
      [...portal.rows.values()].some(
        (row) => row.attributes.vendorIdentifier === "retired_board",
      ),
    ).toBe(true);
  });
});

describe("the achievements", { timeout: SPAWN_MS }, () => {
  it("creates every badge and reports the artwork it has none of", async () => {
    // `--art` points at an EMPTY directory rather than trusting the real one to
    // be empty: the badge PNGs are gitignored build output, so whether they
    // exist depends on whether somebody ran `make store-achievement-art` — and
    // a suite that passes or fails on that is a suite nobody can trust.
    const result = await run([
      "--app",
      APP_ID,
      "--only",
      "achievements",
      "--art",
      mkdtempSync(path.join(tmpdir(), "gc-noart-")),
      "--apply",
    ]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${ROWS} achievements, 1000/1000 points`);
    expect(result.stdout).toContain(`${ROWS} without artwork`);
    expect(portal.collections.gameCenterAchievements!).toHaveLength(ROWS);

    const attributes = portal.collections.gameCenterAchievements!.map(
      (id) => portal.rows.get(id)!.attributes,
    );
    expect(attributes.every((a) => a.repeatable === false)).toBe(true);
    expect(attributes.every((a) => a.showBeforeEarned === true)).toBe(true);
    expect(attributes.reduce((sum, a) => sum + Number(a.points), 0)).toBe(1000);

    // Every badge carries the id the game reports, which is the whole point.
    const vendors = new Set(attributes.map((a) => a.vendorIdentifier));
    expect(vendors.size).toBe(ROWS);
    expect(vendors.has("clear_goodco_hq")).toBe(true);
  });

  // Apple's three-step asset flow: reserve the image, PUT the bytes at the
  // pre-signed URL it hands back, then confirm. An interrupted run leaves an
  // unconfirmed image rather than a corrupt badge, which is why the confirm is
  // a separate request and worth asserting.
  it("reserves, uploads and confirms a badge's artwork", async () => {
    const art = mkdtempSync(path.join(tmpdir(), "gc-art-"));
    const png = Buffer.alloc(4096, 3);
    writeFileSync(path.join(art, "clear_goodco_hq.png"), png);
    writeFileSync(path.join(art, "clear_moon.png"), png);

    const first = await run([
      "--app",
      APP_ID,
      "--only",
      "achievements",
      "--art",
      art,
      "--apply",
    ]);
    expect(first.stderr).toBe("");
    // Two of the rows have art in the temp directory; the rest do not.
    expect(first.stdout).toContain(`${ROWS - 2} without artwork`);
    expect(first.stdout).toContain("2 image(s) to upload");
    expect(portal.uploads.map((u) => u.bytes)).toEqual([
      png.length,
      png.length,
    ]);
    const images = [...portal.images.values()];
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.uploaded === true)).toBe(true);
    expect(images.map((image) => image.fileName).sort()).toEqual([
      "clear_goodco_hq.png",
      "clear_moon.png",
    ]);

    // Re-running leaves a byte-identical image alone.
    portal.uploads.length = 0;
    const second = await run([
      "--app",
      APP_ID,
      "--only",
      "achievements",
      "--art",
      art,
      "--apply",
    ]);
    expect(second.stdout).toContain("0 image(s) to upload");
    expect(portal.uploads).toHaveLength(0);

    // A re-rendered badge that changed size is replaced — a localization holds
    // one image, so the old one is deleted first.
    const stale = [...portal.images.entries()][0]!;
    stale[1].fileSize = 17;
    portal.log.length = 0;
    const third = await run([
      "--app",
      APP_ID,
      "--only",
      "achievements",
      "--art",
      art,
      "--apply",
    ]);
    expect(third.stdout).toContain("1 image(s) to upload");
    expect(portal.log).toContain(
      `DELETE /v1/gameCenterAchievementImages/${stale[0]}`,
    );
    expect(portal.uploads.map((u) => u.bytes)).toEqual([png.length]);
    expect(portal.images.has(stale[0])).toBe(false);
    expect([...portal.images.values()]).toHaveLength(2);

    rmSync(art, { recursive: true, force: true });
  });
});
