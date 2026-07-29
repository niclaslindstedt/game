// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STEAM WORKSHOP — where a player's mods come from, and where an author's goes.
//
// The seam's third file, in the same shape as cloud save's and the
// achievements': a bridge above it moves JSON, and this is the only module that
// knows Steam exists. That is what keeps the web side from ever learning which
// platform answered — and why the day a second storefront grows a mod portal,
// it is one new file here rather than a change to the protocol.
//
// Two directions, and they are asymmetric on purpose:
//
//   SUBSCRIBE  Steam does all of it. The client downloads a subscribed item
//              into its own folder and we ask where that folder is. There is
//              no install step of ours to get wrong, and no unpacking — which
//              also means no archive parser pointed at a stranger's file.
//   PUBLISH    We hand Steam a FOLDER and it uploads the contents. So a mod is
//              published exactly as authored: the YAML a human wrote, not the
//              compiled bundle. The subscriber's game compiles it locally, and
//              a mod on the Workshop stays readable, forkable and diffable the
//              way the game's own content is.
//
// The whole module degrades to "no Workshop" without Steam: `steamClient()`
// answers null on a developer machine, in CI, and on a build launched outside
// the client, and every function here returns an empty list or a refusal
// rather than throwing. A game with no mods is the game.

import { existsSync } from "node:fs";
import path from "node:path";

import { output } from "./output";
import {
  ITEM_STATE_INSTALLED,
  ITEM_STATE_NEEDS_UPDATE,
  steamClient,
} from "./steam";

/** A mod as Steam knows it: an id and a folder on disk. Nothing is read or
 * validated here — that is the compiler's job, one layer up. */
export type WorkshopItem = {
  /** The published file id, as a string: it is a uint64 and JSON has no such
   * number, so it travels as text the whole way to the page and back. */
  itemId: string;
  folder: string;
  needsUpdate: boolean;
};

/** Every installed, subscribed Workshop item. */
export function subscribedItems(): WorkshopItem[] {
  const client = steamClient();
  if (!client) return [];

  const items: WorkshopItem[] = [];
  let ids: bigint[];
  try {
    ids = client.workshop.getSubscribedItems();
  } catch (err) {
    output.warn(`workshop: could not list subscriptions — ${describe(err)}`);
    return [];
  }

  for (const id of ids) {
    let state = 0;
    try {
      state = client.workshop.state(id);
    } catch {
      continue;
    }
    // A subscription the client has not finished downloading yet is not a
    // failure and not a mod — it is a download in progress. Kick it along and
    // leave it out of this pass; the next launch (or the next refresh) sees it.
    if ((state & ITEM_STATE_INSTALLED) === 0) {
      try {
        client.workshop.download(id, false);
      } catch {
        /* the client will get to it */
      }
      continue;
    }
    const info = safeInstallInfo(client, id);
    if (!info || !existsSync(info.folder)) continue;
    items.push({
      itemId: id.toString(),
      folder: info.folder,
      needsUpdate: (state & ITEM_STATE_NEEDS_UPDATE) !== 0,
    });
  }
  return items;
}

/** What a publish attempt answers with. `agreement` is its own outcome because
 * it is the one failure the player must go and DO something about: Steam
 * refuses to show an item until its author has accepted the Workshop terms in
 * a browser, and the item exists in the meantime, invisible. */
export type PublishResult =
  | { ok: true; itemId: string; needsToAcceptAgreement: boolean }
  | { ok: false; reason: "no-steam" | "not-a-mod" | "error"; detail?: string };

/**
 * Publish a mod folder, creating the Workshop item on the first call.
 *
 * `itemId` is null the first time and the returned id every time after — the
 * game remembers it in the mod's own folder (`.workshop-id`), so "publish an
 * update" is the same command as "publish", and a mod cannot accidentally
 * become two Workshop entries.
 */
export async function publishMod(
  folder: string,
  meta: {
    itemId: string | null;
    title: string;
    description: string;
    changeNote: string;
    previewPath?: string;
    tags?: string[];
  },
): Promise<PublishResult> {
  const client = steamClient();
  if (!client) return { ok: false, reason: "no-steam" };
  if (!existsSync(path.join(folder, "mod.yaml"))) {
    return { ok: false, reason: "not-a-mod" };
  }

  try {
    const itemId =
      meta.itemId !== null
        ? BigInt(meta.itemId)
        : (await client.workshop.createItem()).itemId;

    const result = await client.workshop.updateItem(itemId, {
      title: meta.title,
      description: meta.description,
      changeNote: meta.changeNote,
      // The AUTHORED folder, not a compiled bundle — see the header.
      contentPath: folder,
      ...(meta.previewPath && existsSync(meta.previewPath)
        ? { previewPath: meta.previewPath }
        : {}),
      ...(meta.tags?.length ? { tags: meta.tags } : {}),
    });
    output.info(`workshop: published ${meta.title} as ${result.itemId}`);
    return {
      ok: true,
      itemId: result.itemId.toString(),
      needsToAcceptAgreement: result.needsToAcceptAgreement,
    };
  } catch (err) {
    output.warn(`workshop: publish failed — ${describe(err)}`);
    return { ok: false, reason: "error", detail: describe(err) };
  }
}

function safeInstallInfo(
  client: NonNullable<ReturnType<typeof steamClient>>,
  id: bigint,
): { folder: string } | null {
  try {
    return client.workshop.installInfo(id);
  } catch {
    return null;
  }
}

const describe = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
