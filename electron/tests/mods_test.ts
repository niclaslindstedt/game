// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The mods bridge — chiefly its CONTAINMENT check.
//
// One value crosses from the page INWARD in this whole feature: the `folder` a
// PUBLISH names. Everything else travels outward. So that is the one string
// that turns page-supplied text into a filesystem operation — an upload to a
// public Workshop, no less — and it gets a real test rather than a careful
// comment, exactly like `webroot.ts`'s path check.
//
// `electron`'s `app` is stubbed: these tests run under plain vitest with no
// Electron runtime, which is also the arrangement that keeps the desktop
// check job cheap (no 100 MB binary download in CI).

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createModsBridge,
  localModsDir,
  portableModsDir,
  type ModsEvent,
} from "../src/mods";
import { zip, zipDir } from "./zip-fixture";

/** The worked mod in the repo, copied in as the player's own local mod.
 * `__dirname`-relative because this suite compiles to CommonJS. */
const EXAMPLE = join(__dirname, "..", "..", "mod", "examples", "greenhouse");

type InstalledModShape = {
  key: string;
  folder: string;
  source: string;
  bundle: unknown;
  errors: string[];
};

let userData: string;
/** `portableModsDir()` is cwd-relative when unpackaged, so the suite runs from
 * a directory of its own — that IS the "beside the game" folder here. */
let portableHome: string;
const originalCwd = process.cwd();

vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    isPackaged: false,
  },
}));

const temps: string[] = [];

beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), "gis-userdata-"));
  portableHome = mkdtempSync(join(tmpdir(), "gis-install-"));
  temps.push(userData, portableHome);
  process.chdir(portableHome);
});

afterAll(() => {
  process.chdir(originalCwd);
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("the local mods folder", () => {
  it("is created on first look, so the path in the docs exists to be opened", async () => {
    const dir = localModsDir();
    expect(dir).toBe(join(userData, "mods"));
    // Calling it again must not throw on the now-existing directory.
    expect(localModsDir()).toBe(dir);
  });
});

describe("listing", () => {
  const list = (requestId: number) =>
    new Promise<{ mods: InstalledModShape[] }>((resolve) => {
      const bridge = createModsBridge((event: ModsEvent) =>
        resolve(event as unknown as { mods: InstalledModShape[] }),
      );
      bridge.handle({ action: "list", requestId });
    });

  it("compiles a real mod through the real compiler", async () => {
    // The end-to-end shape of the thing: the shell dynamically imports the ESM
    // compiler from outside its own tree, reads the reference catalog, and
    // hands the page compiled JSON. If the paths in resources.ts are wrong, or
    // the .mjs cannot be imported from this CommonJS main process, this is
    // where it shows — not on a player's machine.
    cpSync(EXAMPLE, join(localModsDir(), "greenhouse"), { recursive: true });

    const mod = (await list(1)).mods.find((m) => m.key === "local:greenhouse");
    expect(mod).toBeDefined();
    expect(mod!.errors).toEqual([]);
    expect(mod!.source).toBe("local");
    expect((mod!.bundle as { id: string }).id).toBe("greenhouse");
  });

  it("keeps a mod that did not compile, with its errors", async () => {
    // A subscription that fails to build must still reach the MODS screen —
    // an empty list leaves the player with no way to learn why.
    const broken = join(localModsDir(), "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "mod.yaml"), "id: broken\nname: BROKEN\n");

    const mod = (await list(2)).mods.find((m) => m.key === "local:broken");
    expect(mod).toBeDefined();
    expect(mod!.bundle).toBeNull();
    expect(mod!.errors.length).toBeGreaterThan(0);
  });

  it("reads a mod that arrived as a .zip, wrapper folder and all", async () => {
    // What a friend actually sends: the mod folder compressed, so everything
    // sits under one top-level directory inside the archive.
    mkdirSync(portableModsDir(), { recursive: true });
    writeFileSync(
      join(portableModsDir(), "greenhouse.zip"),
      zipDir(EXAMPLE, "greenhouse"),
    );

    const mod = (await list(4)).mods.find(
      (m) => m.key === "portable:greenhouse.zip",
    );
    expect(mod).toBeDefined();
    expect(mod!.errors).toEqual([]);
    expect((mod!.bundle as { id: string }).id).toBe("greenhouse");
    // Unpacked into the archive cache, NOT into the authoring folder — which
    // is what keeps a received mod out of the publish path.
    expect(mod!.folder.startsWith(join(userData, "mod-archives"))).toBe(true);
  });

  it("finds a plain folder beside the game, and calls it portable", async () => {
    cpSync(EXAMPLE, join(portableModsDir(), "beside"), { recursive: true });
    const mod = (await list(5)).mods.find((m) => m.key === "portable:beside");
    expect(mod).toBeDefined();
    expect(mod!.source).toBe("portable");
    expect(mod!.errors).toEqual([]);
  });

  it("reports a .zip that is not a mod, rather than ignoring the file", async () => {
    // Unlike a nameless directory: a file put in the mods folder was put there
    // to be played, so silence would be the wrong answer.
    writeFileSync(
      join(portableModsDir(), "holiday-photos.zip"),
      zip([{ name: "beach.jpg", body: Buffer.from("not a mod") }]),
    );
    const mod = (await list(6)).mods.find(
      (m) => m.key === "portable:holiday-photos.zip",
    );
    expect(mod).toBeDefined();
    expect(mod!.bundle).toBeNull();
    expect(mod!.errors[0]).toMatch(/no mod.yaml/);
  });

  it("ignores a directory that is not a mod at all", async () => {
    mkdirSync(join(localModsDir(), "just-some-notes"), { recursive: true });
    const mods = (await list(3)).mods;
    expect(mods.some((m) => m.key === "local:just-some-notes")).toBe(false);
  });
});

describe("publish refuses a folder outside the player's mods directory", () => {
  /** Drive one publish request through the bridge and read the reply. */
  const publish = (folder: string) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const bridge = createModsBridge((event: ModsEvent) =>
        resolve(event as unknown as Record<string, unknown>),
      );
      bridge.handle({ action: "publish", requestId: 1, folder });
    });

  it("a sibling directory whose name merely STARTS with the mods path", async () => {
    // `…/mods-elsewhere` shares a string prefix with `…/mods` and would pass a
    // naive `startsWith`. It must not.
    const sneaky = join(userData, "mods-elsewhere");
    mkdirSync(sneaky, { recursive: true });
    writeFileSync(join(sneaky, "mod.yaml"), "id: sneaky\n");
    const reply = await publish(sneaky);
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("a traversal back out of the mods directory", async () => {
    const escape = join(userData, "mods", "..", "..");
    const reply = await publish(escape);
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("the cache a received .zip was unpacked into", async () => {
    // A mod that ARRIVED is not a mod the player authored. The extraction
    // cache sits beside `mods/` rather than inside it precisely so the
    // containment check keeps it out of the Workshop.
    mkdirSync(portableModsDir(), { recursive: true });
    writeFileSync(
      join(portableModsDir(), "sendme.zip"),
      zipDir(EXAMPLE, "sendme"),
    );
    const listed = await new Promise<{ mods: InstalledModShape[] }>(
      (resolve) => {
        const bridge = createModsBridge((event: ModsEvent) =>
          resolve(event as unknown as { mods: InstalledModShape[] }),
        );
        bridge.handle({ action: "list", requestId: 7 });
      },
    );
    const unpacked = listed.mods.find((m) => m.key === "portable:sendme.zip");
    expect(unpacked?.folder).toBeDefined();

    const reply = await publish(unpacked!.folder);
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("a folder beside the game rather than in the authoring directory", async () => {
    cpSync(EXAMPLE, join(portableModsDir(), "received"), { recursive: true });
    const reply = await publish(join(portableModsDir(), "received"));
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("an empty folder", async () => {
    const reply = await publish("");
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("a path inside the mods directory that does not exist", async () => {
    const reply = await publish(join(userData, "mods", "no-such-mod"));
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });
});
