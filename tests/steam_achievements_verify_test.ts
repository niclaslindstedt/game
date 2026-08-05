// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM VERIFICATION PASS, END TO END — the script driven as a script,
// against a stand-in for Valve's Web API (`GIS_STEAM_API_HOST`).
//
// The reconcile itself is unit-tested next door; what this file is for is
// everything BETWEEN the socket and the verdict, which no unit test reaches:
// the schema read being flattened into the shape the comparison expects
// (including Valve's 0/1 for a checkbox), the EXIT CODE — since the whole point
// of the pass is that a missing row stops something rather than being noticed —
// and the two ways a read can succeed and still be worthless: Valve answering
// an unknown app with HTTP 200 and an empty object, and a personal key getting
// a bodyless 403 on an unreleased app.
//
// The stand-in is deliberately dumb: it answers with whatever schema the test
// put in it. It is not a model of Valve's validation.

import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = path.join(root, "scripts", "steam-achievements-portal.mjs");
const APP_ID = "1234560";
const KEY = "0123456789abcdef0123456789abcdef";

type SchemaAchievement = {
  name: string;
  displayName: string;
  description: string;
  hidden: number;
  icon: string;
  icongray: string;
};

/** The partner site, as far as this test is concerned. */
class Partner {
  achievements: SchemaAchievement[] = [];
  /** Set to answer every read with a status instead of a schema. */
  status = 200;
  /** Set to answer with `{"game":{}}` — Valve's reply for an app it won't show. */
  blank = false;
  log: string[] = [];
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

function stubServer(partner: Partner): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    partner.log.push(`${req.method} ${url.pathname}`);

    if (url.pathname !== "/ISteamUserStats/GetSchemaForGame/v2/") {
      res.writeHead(404).end();
      return;
    }
    // The key travels in the query string, and it must be there — a request
    // without one is how a client that forgot to authenticate looks.
    if (url.searchParams.get("key") !== KEY) {
      res.writeHead(403).end();
      return;
    }
    if (partner.status !== 200) {
      res.writeHead(partner.status).end();
      return;
    }
    if (partner.blank || url.searchParams.get("appid") !== APP_ID) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ game: {} }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        game: {
          gameName: "Ada's Trail",
          gameVersion: "1",
          availableGameStats: { achievements: partner.achievements },
        },
      }),
    );
  });
}

let HOST = "";
let partner: Partner;
let server: Server;

/** The script, run as a script — NOT `spawnSync`: the stand-in server lives on
 * this thread, so blocking it while the child waits is a deadlock. */
const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        cwd: root,
        env: {
          ...process.env,
          STEAM_WEB_API_KEY: KEY,
          GIS_STEAM_API_HOST: HOST,
          ...env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    },
  );

/** The manifest's own rows, as a partner site that was transcribed perfectly. */
const enteredCorrectly = async (): Promise<SchemaAchievement[]> => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(
    readFileSync(
      path.join(root, "electron/store/steam-achievements.json"),
      "utf8",
    ),
  ) as {
    achievements: { id: string; name: string; description: string }[];
  };
  return manifest.achievements.map((row) => ({
    name: row.id,
    displayName: row.name,
    description: row.description,
    hidden: 0,
    icon: `https://cdn/${row.id}.jpg`,
    icongray: `https://cdn/${row.id}_gray.jpg`,
  }));
};

beforeAll(async () => {
  partner = new Partner();
  server = stubServer(partner);
  HOST = await listen(server);
  partner.achievements = await enteredCorrectly();
});

afterAll(() => {
  server.close();
});

describe("the worksheet", () => {
  it("prints every row without touching the network", async () => {
    const result = await run([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("── 1/86 ── clear_goodco_hq");
    expect(result.stdout).toContain("  API Name         clear_goodco_hq");
    expect(result.stdout).toContain(
      "  Achieved icon    electron/store/achievements/clear_goodco_hq-achieved.png",
    );
    expect(result.stderr).toContain("86 rows for App Admin → Achievements");
    expect(partner.log).toHaveLength(0);
  });

  it("emits a header row and 86 data rows as TSV", async () => {
    const result = await run(["--format", "tsv"]);
    expect(result.status).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(87);
    expect(lines[0]!.split("\t")[0]).toBe("API Name");
    expect(lines[1]!.split("\t")).toHaveLength(6);
  });
});

describe("the verification pass", () => {
  it("passes a partner site that matches the manifest", async () => {
    partner.log.length = 0;
    const result = await run(["--verify", "--app", APP_ID]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("86 row(s) in the partner site");
    expect(result.stdout).toContain("86 correct");
    expect(result.stdout).toContain(
      "every id in the manifest exists in the partner site",
    );
    expect(partner.log).toEqual(["GET /ISteamUserStats/GetSchemaForGame/v2/"]);
  });

  // The failure the whole tool exists for, and the reason it exits non-zero:
  // an unlock for an id the portal doesn't have is dropped, silently, forever.
  it("fails, and names the row, when an id was never entered", async () => {
    const full = partner.achievements;
    partner.achievements = full.filter((row) => row.name !== "clear_mars");
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MISSING  clear_mars");
      expect(result.stdout).toContain(
        "1 achievement(s) the game reports and the partner site has never heard of",
      );
      expect(result.stdout).toContain("dropped, silently, forever");
    } finally {
      partner.achievements = full;
    }
  });

  it("says which entered row a missing id was probably mistyped as", async () => {
    const full = partner.achievements;
    partner.achievements = full.map((row) =>
      row.name === "clear_mars" ? { ...row, name: "clear_marss" } : row,
    );
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('the partner site has "clear_marss"');
      expect(result.stdout).toContain("a near-miss on an id it DOES have");
    } finally {
      partner.achievements = full;
    }
  });

  // Drifted text costs nothing at runtime — the id is what the game reports —
  // so it is reported and does not fail unless the caller asks it to.
  it("reports drifted text, and fails on it only with --strict", async () => {
    const full = partner.achievements;
    partner.achievements = full.map((row) =>
      row.name === "clear_moon" ? { ...row, displayName: "The Moon" } : row,
    );
    try {
      const lenient = await run(["--verify", "--app", APP_ID]);
      expect(lenient.status).toBe(0);
      expect(lenient.stdout).toContain("differs  clear_moon");
      expect(lenient.stdout).toContain('Display Name "The Moon" → "THE MOON"');

      const strict = await run(["--verify", "--strict", "--app", APP_ID]);
      expect(strict.status).toBe(1);
    } finally {
      partner.achievements = full;
    }
  });

  it("reads Valve's 0/1 as the checkbox it is", async () => {
    const full = partner.achievements;
    partner.achievements = full.map((row) =>
      row.name === "clear_moon" ? { ...row, hidden: 1 } : row,
    );
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.stdout).toContain("Hidden true → false");
    } finally {
      partner.achievements = full;
    }
  });

  it("names a row the partner site is drawing with no artwork", async () => {
    const full = partner.achievements;
    partner.achievements = full.map((row) =>
      row.name === "clear_moon" ? { ...row, icongray: "" } : row,
    );
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(
        /no icon\s+clear_moon\s+unachieved not uploaded/,
      );
    } finally {
      partner.achievements = full;
    }
  });

  it("reports an id the portal has and the manifest does not, without deleting it", async () => {
    const full = partner.achievements;
    partner.achievements = [
      ...full,
      {
        name: "retired_badge",
        displayName: "RETIRED",
        description: "gone from the catalog",
        hidden: 0,
        icon: "https://cdn/x.jpg",
        icongray: "https://cdn/x_gray.jpg",
      },
    ];
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("left alone");
      expect(result.stdout).toContain("retired_badge");
    } finally {
      partner.achievements = full;
    }
  });
});

describe("the reads that succeed and mean nothing", () => {
  // Valve answers an app the key cannot see with HTTP 200 and `{"game":{}}` —
  // byte-identical to a real app with no rows created yet. Reporting "86
  // missing" for that would send somebody to re-enter rows they already have.
  it("refuses to read an empty schema as 86 missing rows", async () => {
    partner.blank = true;
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("returned an empty schema");
      expect(result.stderr).toContain("cannot be read off the response");
      expect(result.stdout).not.toContain("MISSING");
    } finally {
      partner.blank = false;
    }
  });

  it("says what a bodyless 403 means", async () => {
    partner.status = 403;
    try {
      const result = await run(["--verify", "--app", APP_ID]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("the key is not authorized for this app");
      expect(result.stderr).toContain("publisher key");
    } finally {
      partner.status = 200;
    }
  });

  it("refuses to verify against Valve's shared test app", async () => {
    const result = await run(["--verify", "--app", "480"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Spacewar test app");
  });

  it("says where a Web API key comes from when there is none", async () => {
    const result = await run(["--verify", "--app", APP_ID], {
      STEAM_WEB_API_KEY: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("STEAM_WEB_API_KEY is not set");
    expect(result.stderr).toContain("Create Web API Key");
  });

  it("catches a truncated key before it reaches Valve", async () => {
    partner.log.length = 0;
    const result = await run(["--verify", "--app", APP_ID], {
      STEAM_WEB_API_KEY: "0123456789abcdef",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not the 32 hex digits");
    expect(partner.log).toHaveLength(0);
  });
});
