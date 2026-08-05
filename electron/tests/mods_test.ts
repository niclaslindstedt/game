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

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createModsBridge,
  localModsDir,
  portableModsDir,
  portableModsPath,
  type ModsEvent,
} from "../src/mods";

/** The suite runs UNPACKAGED, where every platform has a portable folder — so
 * this narrowing is a fact of the fixture, not an assumption about the app. */
const portableDir = (): string => portableModsDir() as string;
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
/** `portableDir()` is cwd-relative when unpackaged, so the suite runs from
 * a directory of its own — that IS the "beside the game" folder here. */
let portableHome: string;
const originalCwd = process.cwd();

const opened: string[] = [];
vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    isPackaged: false,
  },
  shell: {
    openPath: (dir: string) => {
      opened.push(dir);
      return Promise.resolve("");
    },
    openExternal: () => Promise.resolve(),
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

describe("where the folder beside the game is", () => {
  const packaged = (platform: NodeJS.Platform, exe: string) =>
    portableModsPath({ packaged: true, platform, exe, cwd: "/repo" });

  it("is the install folder on Windows and Linux", () => {
    expect(packaged("win32", "C:\\Games\\adastrail\\adastrail.exe")).toBe(
      "C:\\Games\\adastrail\\mods",
    );
    expect(packaged("linux", "/opt/adastrail/adastrail")).toBe(
      "/opt/adastrail/mods",
    );
  });

  it("does NOT exist on macOS, where the app sits in /Applications", () => {
    // Beside the app is a system folder the player does not own, and inside
    // the bundle would break the signature it is notarized under. Application
    // Support is the whole answer there.
    expect(
      packaged(
        "darwin",
        "/Applications/Adas Trail.app/Contents/MacOS/adastrail",
      ),
    ).toBeNull();
  });

  it("is the working directory when unpackaged, on every platform", () => {
    // A checkout is a developer's own tree, not an installed app — so even
    // macOS has one here.
    for (const platform of ["darwin", "linux"] as NodeJS.Platform[]) {
      expect(
        portableModsPath({ packaged: false, platform, exe: "", cwd: "/repo" }),
      ).toBe("/repo/mods");
    }
    expect(
      portableModsPath({
        packaged: false,
        platform: "win32",
        exe: "",
        cwd: "C:\\repo",
      }),
    ).toBe("C:\\repo\\mods");
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
    mkdirSync(portableDir(), { recursive: true });
    writeFileSync(
      join(portableDir(), "greenhouse.zip"),
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

  it("calls a .zip portable even in the authoring folder — it is not publishable", async () => {
    writeFileSync(
      join(localModsDir(), "sent-to-me.zip"),
      zipDir(EXAMPLE, "sent-to-me"),
    );
    const mod = (await list(8)).mods.find(
      (m) => m.key === "local:sent-to-me.zip",
    );
    expect(mod).toBeDefined();
    expect(mod!.source).toBe("portable");
    expect(mod!.errors).toEqual([]);
  });

  it("finds a plain folder beside the game, and calls it portable", async () => {
    cpSync(EXAMPLE, join(portableDir(), "beside"), { recursive: true });
    const mod = (await list(5)).mods.find((m) => m.key === "portable:beside");
    expect(mod).toBeDefined();
    expect(mod!.source).toBe("portable");
    expect(mod!.errors).toEqual([]);
  });

  it("reports a .zip that is not a mod, rather than ignoring the file", async () => {
    // Unlike a nameless directory: a file put in the mods folder was put there
    // to be played, so silence would be the wrong answer.
    writeFileSync(
      join(portableDir(), "holiday-photos.zip"),
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

describe("showing a folder in the file manager", () => {
  const reveal = (which: "local" | "portable") => {
    const bridge = createModsBridge(() => {});
    bridge.handle({ action: "reveal", requestId: 0, which });
  };

  it("opens the folder the page NAMED, resolved here", () => {
    opened.length = 0;
    reveal("local");
    expect(opened).toEqual([localModsDir()]);
    reveal("portable");
    expect(opened[1]).toBe(portableDir());
  });

  it("creates the folder first, so it is never opened into nothing", () => {
    rmSync(portableDir(), { recursive: true, force: true });
    opened.length = 0;
    reveal("portable");
    expect(existsSync(portableDir())).toBe(true);
  });

  it("takes no path from the page — only the two names", () => {
    // The request carries `which`, never a directory: there is no field here
    // that could name /etc or somebody's documents.
    opened.length = 0;
    const bridge = createModsBridge(() => {});
    bridge.handle({
      action: "reveal",
      requestId: 0,
      folder: "/etc",
    } as Parameters<typeof bridge.handle>[0]);
    // With no `which`, it falls back to the authoring folder — never `folder`.
    expect(opened).toEqual([localModsDir()]);
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
    mkdirSync(portableDir(), { recursive: true });
    writeFileSync(join(portableDir(), "sendme.zip"), zipDir(EXAMPLE, "sendme"));
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
    cpSync(EXAMPLE, join(portableDir(), "received"), { recursive: true });
    const reply = await publish(join(portableDir(), "received"));
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
