// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MODS — the SHELL half of the Steam Workshop seam: the thing that joins the
// Workshop (`workshop.ts`) to the compiler (`mod/tools/build.mjs`) and answers
// the page's bridge (`pwa/src/app/mods-bridge.ts`). Keep the protocol here in
// step with the one documented there.
//
// It is the peer of `cloud-save.ts` — a bridge that moves JSON — with one
// difference that shapes the whole file: this one does REAL WORK on the main
// process, because compiling is the security boundary. A mod's YAML is read,
// parsed and validated here, and only plain checked JSON crosses to the
// renderer. The page has no filesystem, no YAML parser, and no way to run
// anything a mod shipped, and that stays true precisely because this module
// does not hand it anything but data.
//
// THREE SOURCES, one list:
//
//   WORKSHOP  what the player subscribed to. Steam owns the download and the
//             folder; we ask where it is.
//   LOCAL     `<userData>/mods/<name>/`, for the mod the player is WRITING.
//             Without it, authoring means publishing to the Workshop to test —
//             which is a terrible loop and litters the Workshop with drafts.
//             It is also the only source PUBLISH is offered for.
//   PORTABLE  `mods/` BESIDE THE GAME, for a mod somebody was sent. It is the
//             answer to "my friend zipped me a mod": a folder the player can
//             find without being told an application-data path, holding either
//             unpacked mod folders or `.zip` files (`mod-archive.ts` opens
//             those). Windows and Linux only — macOS installs into
//             /Applications, which is not the player's to write to; see
//             `portableModsDir`. It is not publishable either way: what is
//             published is what somebody AUTHORED, and this is where what
//             somebody RECEIVED goes.
//
// A mod that fails to compile is NOT dropped: it crosses with its errors, so
// the MODS screen can tell the player why their subscription is not playable.
// A silent omission would leave them with an empty list and no way to find out.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { app, shell } from "electron";

import { STEAM_APP_ID } from "./config";
import { ArchiveError, modEntries, readZip } from "./mod-archive";
import { output } from "./output";
import { modToolsPath } from "./resources";
import { publishMod, subscribedItems } from "./workshop";

/** A message from the web side (already parsed; `__gisMods` checked). */
export type ModsRequest = {
  action?: "list" | "publish" | "workshop" | "reveal";
  requestId?: number;
  folder?: string;
  changeNote?: string;
  /** Which of OUR folders to reveal. A NAME, never a path: the page picking
   * from a closed set is what keeps "open this in the file manager" from
   * becoming "open anything on this disk in the file manager". */
  which?: "local" | "portable";
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type ModsEvent =
  | {
      event: "list";
      requestId: number;
      ok: boolean;
      mods: InstalledMod[];
      /** The folders that list was read from, for the screen to show and to
       * offer to open. `portable` is null where the platform has none. */
      folders: { local: string; portable: string | null };
    }
  | {
      event: "publish";
      requestId: number;
      ok: boolean;
      itemId?: string;
      needsToAcceptAgreement?: boolean;
      reason?: string;
      detail?: string;
    };

/** One mod as the page sees it. `bundle` is the compiled JSON, or null with
 * `errors` saying why. */
type InstalledMod = {
  key: string;
  folder: string;
  source: "workshop" | "local" | "portable";
  bundle: unknown;
  errors: string[];
  needsUpdate: boolean;
};

export type ModsBridge = { handle: (request: ModsRequest) => void };

/** The compiler and the reference catalog, loaded ONCE and shared by every
 * mod. Both are ESM `.mjs` in a CommonJS main process, so they come in through
 * a dynamic import — which is also why every entry point here is async. */
let toolchain: Promise<{
  buildMod: (
    dir: string,
    catalog: unknown,
  ) => {
    bundle: unknown;
    errors: string[];
    warnings: string[];
  };
  catalog: unknown;
}> | null = null;

async function tools() {
  toolchain ??= (async () => {
    const build = await import(
      /* webpackIgnore: true */ toFileUrl(modToolsPath("build.mjs"))
    );
    const read = await import(
      /* webpackIgnore: true */ toFileUrl(modToolsPath("catalog-read.mjs"))
    );
    return {
      buildMod: build.buildMod,
      catalog: read.readCatalog(modToolsPath("../catalog.json")),
    };
  })();
  return toolchain;
}

/** The folder a player drops a mod they are writing into. Created on first
 * look so the path in the docs always exists to be opened. */
export function localModsDir(): string {
  const dir = path.join(app.getPath("userData"), "mods");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* a read-only userData is not worth failing a launch over */
  }
  return dir;
}

/**
 * `mods/` BESIDE THE GAME — the folder a player can find without being told,
 * where the platform has one.
 *
 * The application-data path `localModsDir` answers is correct and unguessable:
 * spelled differently on three platforms and hidden on two. That is fine for
 * the mod somebody is WRITING, who typed a command to be told where it is, and
 * it is the wrong answer for "a friend sent me this". On Windows and Linux the
 * install folder is the answer — the player owns it, it is one place, and it
 * travels with a copied install.
 *
 * **macOS has no such folder, on purpose.** An installed app lives in
 * `/Applications`, so "beside the app" is a system directory the player does
 * not own and should not be littered with a game's data — and the inside of the
 * bundle is worse than that: adding a file there breaks the code signature the
 * app is notarized under. macOS keeps user data in Application Support and this
 * follows the platform rather than fighting it, so `localModsDir()` is the
 * whole answer there.
 *
 * Unpackaged (a checkout, `electron .`) it is the working directory on every
 * platform — that is a developer's own tree, not an installed app.
 */
export function portableModsDir(): string | null {
  return portableModsPath({
    packaged: app.isPackaged,
    platform: process.platform,
    exe: app.isPackaged ? app.getPath("exe") : "",
    cwd: process.cwd(),
  });
}

/** The rule above, as a pure function — the platform branch is the part worth
 * testing, and it cannot be tested through `app`. */
export function portableModsPath(env: {
  packaged: boolean;
  platform: NodeJS.Platform;
  exe: string;
  cwd: string;
}): string | null {
  // The separator follows the PLATFORM rather than the host: in production
  // they are the same thing, and picking it explicitly is what lets the rule
  // be tested for all three from one machine.
  const p = env.platform === "win32" ? path.win32 : path.posix;
  if (!env.packaged) return p.join(env.cwd, "mods");
  if (env.platform === "darwin") return null;
  return p.join(p.dirname(env.exe), "mods");
}

/** Where an archive is unpacked to be compiled. Deliberately NOT inside
 * `localModsDir()`: a mod that arrived as a zip is not one the player is
 * authoring, and the publish containment check is a prefix of that folder. */
function archiveCacheDir(): string {
  return path.join(app.getPath("userData"), "mod-archives");
}

export function createModsBridge(emit: (event: ModsEvent) => void): ModsBridge {
  return {
    handle(request) {
      const requestId = request.requestId ?? 0;
      if (request.action === "list") {
        void listInstalled().then((mods) =>
          emit({
            event: "list",
            requestId,
            ok: true,
            mods,
            folders: { local: localModsDir(), portable: portableModsDir() },
          }),
        );
        return;
      }
      // Open one of our own folders in the desktop's file manager. Creating it
      // first is the point: a folder the player is told about and then cannot
      // find is worse than no row at all, and the portable one is never made
      // at startup (an install directory may be read-only, which is fine to
      // READ from and worth failing quietly on here).
      if (request.action === "reveal") {
        const dir =
          request.which === "portable" ? portableModsDir() : localModsDir();
        if (dir) {
          try {
            mkdirSync(dir, { recursive: true });
          } catch {
            /* opening a read-only folder still works */
          }
          void shell.openPath(dir);
        }
        return;
      }
      if (request.action === "publish") {
        void runPublish(request).then((event) =>
          emit({ ...event, requestId } as ModsEvent),
        );
        return;
      }
      // Open the game's Workshop hub in the Steam client — where a
      // joiner refused for a missing mod goes to get it. A fixed steam:// URL
      // built from OUR OWN app id, never from anything the page sent: the one
      // thing this action must not become is an open-arbitrary-URL channel.
      if (request.action === "workshop") {
        void shell.openExternal(
          `steam://url/SteamWorkshopPage/${STEAM_APP_ID}`,
        );
      }
    },
  };
}

/** Every mod on this machine, compiled. Workshop items first, then the folders
 * on disk: a mod the player put there themselves is the one they want at the
 * bottom of the load order, winning, because it is the one they just added. */
async function listInstalled(): Promise<InstalledMod[]> {
  const found: InstalledMod[] = [];
  const { buildMod, catalog } = await tools();

  const compile = (
    folder: string,
    key: string,
    source: InstalledMod["source"],
    needsUpdate: boolean,
  ): InstalledMod => {
    try {
      const { bundle, errors } = buildMod(folder, catalog);
      if (errors.length > 0) {
        output.warn(
          `mods: ${key} did not compile — ${errors.length} problem(s): ${errors[0]}`,
        );
      }
      return { key, folder, source, bundle, errors, needsUpdate };
    } catch (err) {
      // The compiler throwing rather than reporting is a bug in US, not in the
      // mod — but it must still not take the list down with it.
      const detail = err instanceof Error ? err.message : String(err);
      output.warn(`mods: ${key} could not be read — ${detail}`);
      return {
        key,
        folder,
        source,
        bundle: null,
        errors: [detail],
        needsUpdate,
      };
    }
  };

  for (const item of subscribedItems()) {
    found.push(compile(item.folder, item.itemId, "workshop", item.needsUpdate));
  }

  // The two folders on disk, in load order: what the player is writing, then
  // what they were sent. A portable mod wins a clash with an authoring copy of
  // itself, which is the right way round for the person the feature is for —
  // and either can still be moved by hand on the LOAD ORDER screen.
  const roots: { dir: string; source: InstalledMod["source"] }[] = [
    { dir: localModsDir(), source: "local" },
    ...(portableModsDir() === null
      ? [] // macOS: there is no folder beside the app — see portableModsDir.
      : ([{ dir: portableModsDir() as string, source: "portable" }] as const)),
  ];
  const seen = new Set<string>();

  for (const { dir, source } of roots) {
    // A checkout run with `electron .` has cwd === the repo, and a portable
    // install could be laid out with one folder serving as both. Reading it
    // twice would list every mod twice.
    const key = path.resolve(dir);
    if (seen.has(key) || !existsSync(dir)) continue;
    seen.add(key);

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // A directory with no manifest is not a half-broken mod, it is not a
        // mod — somebody's notes, an editor's backup folder. Reporting it as
        // broken would put permanent noise in the list.
        if (!existsSync(path.join(entryPath, "mod.yaml"))) continue;
        found.push(
          compile(entryPath, `${source}:${entry.name}`, source, false),
        );
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".zip")) {
        continue;
      }
      // An archive IS reported when it fails, unlike a nameless directory: a
      // file called `something.zip` sitting in the mods folder was put there
      // to be played, so "it is not a mod" is an answer the player needs.
      //
      // Always `portable`, whichever folder it sat in — the source answers
      // "may this be published?", and a zip never can: what is compiled is a
      // copy in the archive cache, not a folder anybody is authoring. A zip in
      // the authoring folder marked `local` would be offered a PUBLISH row
      // that the containment check then refuses, which is the worst of both.
      const unpacked = unpackArchive(entryPath);
      const key2 = `${source}:${entry.name}`;
      found.push(
        unpacked.folder
          ? compile(unpacked.folder, key2, "portable", false)
          : {
              key: key2,
              folder: entryPath,
              source: "portable",
              bundle: null,
              errors: [unpacked.error ?? "it could not be read"],
              needsUpdate: false,
            },
      );
    }
  }

  output.info(`mods: ${found.length} installed`);
  return found;
}

async function runPublish(
  request: ModsRequest,
): Promise<Omit<ModsEvent & { event: "publish" }, "requestId">> {
  const folder = request.folder ?? "";
  // The one path the page hands INWARD, so it is the one that gets checked:
  // publishing is an upload, and a folder outside the player's own mods
  // directory is not something the page has any business naming.
  if (!isLocalMod(folder)) {
    return { event: "publish", ok: false, reason: "not-a-mod" };
  }

  const { buildMod, catalog } = await tools();
  // Never publish something that does not compile. The Workshop is public, and
  // the first thing a subscriber would see is a mod that cannot load.
  const { bundle, errors } = buildMod(folder, catalog);
  if (!bundle) {
    return {
      event: "publish",
      ok: false,
      reason: "error",
      detail: errors[0] ?? "it does not compile",
    };
  }

  const meta = bundle as {
    id: string;
    name: string;
    description: string;
    kind: string;
  };
  const result = await publishMod(folder, {
    itemId: readItemId(folder),
    title: meta.name,
    description: meta.description,
    changeNote: request.changeNote ?? "",
    previewPath: path.join(folder, "preview.png"),
    tags: [meta.kind === "conversion" ? "Total Conversion" : "Addon"],
  });

  if (result.ok) {
    writeItemId(folder, result.itemId);
    return {
      event: "publish",
      ok: true,
      itemId: result.itemId,
      needsToAcceptAgreement: result.needsToAcceptAgreement,
    };
  }
  return {
    event: "publish",
    ok: false,
    reason: result.reason,
    detail: result.detail,
  };
}

/**
 * Unpack a `.zip` into the archive cache and answer the folder to compile.
 *
 * Re-extracted when the FILE changes rather than on every launch: the cache is
 * keyed by the archive's size and modification time, so replacing a zip with a
 * newer one is picked up on the next list, and a launch that changed nothing
 * pays a `statSync` instead of an unpack. The previous extraction of the same
 * archive is removed, so the cache tracks the mods folder rather than growing
 * a copy per version.
 */
function unpackArchive(zipPath: string): { folder?: string; error?: string } {
  let stamp: string;
  try {
    const stat = statSync(zipPath);
    stamp = `${stat.size}-${Math.trunc(stat.mtimeMs)}`;
  } catch (err) {
    return { error: describeError(err) };
  }

  const slug = path.basename(zipPath, path.extname(zipPath));
  const home = path.join(archiveCacheDir(), safeSlug(slug));
  const target = path.join(home, stamp);
  if (existsSync(path.join(target, "mod.yaml"))) return { folder: target };

  try {
    const entries = modEntries(readZip(readFileSync(zipPath)));
    // Replace rather than accumulate: one extraction per archive, always the
    // current one.
    rmSync(home, { recursive: true, force: true });
    for (const entry of entries) {
      const file = path.join(target, entry.name);
      // Belt and braces over `checkName`: whatever the archive said, nothing
      // is written outside the folder this extraction owns.
      if (!file.startsWith(target + path.sep)) {
        rmSync(home, { recursive: true, force: true });
        return { error: `"${entry.name}" would be written outside the mod` };
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, entry.data);
    }
    output.info(
      `mods: unpacked ${path.basename(zipPath)} (${entries.length} files)`,
    );
    return { folder: target };
  } catch (err) {
    rmSync(home, { recursive: true, force: true });
    const detail =
      err instanceof ArchiveError ? err.message : describeError(err);
    output.warn(
      `mods: ${path.basename(zipPath)} could not be unpacked — ${detail}`,
    );
    return { error: detail };
  }
}

/** A cache folder name that is a name and nothing else — the archive's own
 * stem is a filename the player chose, and it is about to be a path. */
function safeSlug(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64);
  return slug.replace(/^[.-]+/, "") || "archive";
}

const describeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Is this folder inside the player's own mods directory? Resolved and
 * compared as a path PREFIX with a separator, so `…/mods-elsewhere` cannot
 * pass for `…/mods`, and `..` cannot climb out of it. */
function isLocalMod(folder: string): boolean {
  if (!folder) return false;
  const root = path.resolve(localModsDir());
  const target = path.resolve(folder);
  return target.startsWith(root + path.sep) && existsSync(target);
}

// ---------------------------------------------------------------------------
// The Workshop item id, remembered in the mod's own folder.
//
// It lives BESIDE the mod rather than in the game's settings because it
// belongs to the mod: copy the folder to another machine and publishing from
// there still updates the same item, rather than minting a second one that
// splits the mod's subscribers and ratings in two.
// ---------------------------------------------------------------------------
const ITEM_ID_FILE = ".workshop-id";

function readItemId(folder: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const raw = readFileSync(path.join(folder, ITEM_ID_FILE), "utf8").trim();
    return /^\d+$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeItemId(folder: string, itemId: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(path.join(folder, ITEM_ID_FILE), `${itemId}\n`);
  } catch (err) {
    // Not fatal, but the next publish would create a SECOND item, so say so.
    output.warn(
      `mods: could not record the Workshop id in ${folder} — ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        "Publishing again would create a second item.",
    );
  }
}

/** A path as an ESM-importable URL. Windows paths are not valid URLs, and a
 * dynamic import of `C:\…` fails with a message about protocols. */
function toFileUrl(file: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pathToFileURL } = require("node:url") as typeof import("node:url");
  return pathToFileURL(file).href;
}
