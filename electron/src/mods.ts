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
// TWO SOURCES, one list:
//
//   WORKSHOP  what the player subscribed to. Steam owns the download and the
//             folder; we ask where it is.
//   LOCAL     `<userData>/mods/<name>/`, for the mod the player is WRITING.
//             Without it, authoring means publishing to the Workshop to test —
//             which is a terrible loop and litters the Workshop with drafts.
//             It is also the only source PUBLISH is offered for.
//
// A mod that fails to compile is NOT dropped: it crosses with its errors, so
// the MODS screen can tell the player why their subscription is not playable.
// A silent omission would leave them with an empty list and no way to find out.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import { app, shell } from "electron";

import { STEAM_APP_ID } from "./config";
import { output } from "./output";
import { modToolsPath } from "./resources";
import { publishMod, subscribedItems } from "./workshop";

/** A message from the web side (already parsed; `__gisMods` checked). */
export type ModsRequest = {
  action?: "list" | "publish" | "workshop";
  requestId?: number;
  folder?: string;
  changeNote?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type ModsEvent =
  | { event: "list"; requestId: number; ok: boolean; mods: InstalledMod[] }
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
  source: "workshop" | "local";
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

export function createModsBridge(emit: (event: ModsEvent) => void): ModsBridge {
  return {
    handle(request) {
      const requestId = request.requestId ?? 0;
      if (request.action === "list") {
        void listInstalled().then((mods) =>
          emit({ event: "list", requestId, ok: true, mods }),
        );
        return;
      }
      if (request.action === "publish") {
        void runPublish(request).then((event) =>
          emit({ ...event, requestId } as ModsEvent),
        );
        return;
      }
      // Open the game's Workshop hub in the Steam client (§4.4) — where a
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

/** Every mod on this machine, compiled. Workshop items first, then local ones:
 * a mod the player is WRITING is the one they want at the bottom of the load
 * order, winning, because they are iterating on it. */
async function listInstalled(): Promise<InstalledMod[]> {
  const found: InstalledMod[] = [];
  const { buildMod, catalog } = await tools();

  const compile = (
    folder: string,
    key: string,
    source: "workshop" | "local",
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

  const local = localModsDir();
  if (existsSync(local)) {
    for (const entry of readdirSync(local, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(local, entry.name);
      // A directory with no manifest is not a half-broken mod, it is not a mod
      // — somebody's notes, an editor's backup folder. Reporting it as broken
      // would put permanent noise in the list.
      if (!existsSync(path.join(folder, "mod.yaml"))) continue;
      found.push(compile(folder, `local:${entry.name}`, "local", false));
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
