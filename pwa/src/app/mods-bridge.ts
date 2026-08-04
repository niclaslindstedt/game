// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS bridge — the WEB half of the Steam Workshop seam. Steam builds only.
//
//   web → shell   `postToShell(JSON { __gisMods })`  (./shell-bridge.ts)
//   shell → web   `window.__gisModsEvent(…)` (called from OUTSIDE, via
//                 `executeJavaScript`, exactly as the other three bridges are)
//
// The protocol (mirrored by electron/src/mods.ts — keep the two in step):
//   → { action: "list", requestId }            compile every installed mod
//   → { action: "publish", requestId, folder, changeNote }
//   ← { event: "list", requestId, ok, mods: InstalledMod[] }
//   ← { event: "publish", requestId, ok, itemId?, needsToAcceptAgreement?,
//       reason? }
//
// WHAT CROSSES IS ALWAYS COMPILED JSON. The page never receives a mod's YAML
// and never receives a file path it is expected to read — `folder` travels
// OUTWARD only, for publishing, and the shell checks it. A mod that failed to
// compile crosses as its ERRORS rather than its content, so the MODS screen can
// show a player why their subscription is not playable without the page ever
// having parsed a byte a stranger wrote.

// The import-free LEAF, never `game/mods.ts`: that one reaches `@game/core`,
// and this bridge is imported by the MODS menu builder on the startup path.
import type { ModBundle } from "../game/mod-state.ts";

import {
  postToShell,
  shellAvailable,
  shellCapability,
  shellPlatform,
} from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The shell's callback into this page (installed by `initModsBridge`). */
    __gisModsEvent?: (event: unknown) => void;
  }
}

/**
 * One mod as the MODS screen sees it. A mod that did not compile still appears
 * — with its errors — because the alternative is a player who subscribed to
 * something, sees nothing in the list, and has no way at all to find out why.
 */
export type InstalledMod = {
  /** The Workshop item id, or the folder name for a local mod. */
  key: string;
  /** Absolute path, for PUBLISH. Never read by the page. */
  folder: string;
  /**
   * Where it came from, and it decides what may be done with it:
   *
   *   workshop  a subscription — somebody else's to update
   *   local     the player's own authoring folder — the only publishable one
   *   portable  `mods/` beside the game: a folder or a `.zip` somebody was
   *             sent. Played like any other, never published, because what is
   *             published is what somebody AUTHORED.
   */
  source: "workshop" | "local" | "portable";
  /** The compiled mod, or null when it did not compile. */
  bundle: ModBundle | null;
  /** Why it did not compile. Empty when it did. */
  errors: string[];
  /** Steam has a newer version than the one on disk. */
  needsUpdate: boolean;
};

export type PublishResult =
  | { ok: true; itemId: string; needsToAcceptAgreement: boolean }
  | { ok: false; reason: "no-steam" | "not-a-mod" | "error"; detail?: string };

/** Compiling a folder of YAML is real work and a player may have a dozen mods;
 * a slow disk must not hang the menu for ever. */
const LIST_TIMEOUT_MS = 30_000;
/** An upload of a whole mod folder, over Steam's own transfer. */
const PUBLISH_TIMEOUT_MS = 10 * 60_000;

let nextRequestId = 1;
const waiters = new Map<number, (payload: unknown) => void>();

/**
 * True where mods can actually load: a shell with its channel up, on Steam.
 *
 * The mobile shells are deliberately excluded, and not for want of a
 * filesystem — Apple and Google both require every byte of executable content
 * and most downloadable content to come through review, and a Workshop is
 * exactly the thing neither store permits. So MODS is a Steam row, the way the
 * coin store is a mobile one, and each build shows only what it can honour.
 */
export function modsBridgeAvailable(): boolean {
  return (
    shellAvailable() && shellPlatform() === "steam" && shellCapability("mods")
  );
}

/** Install the shell's callback. Idempotent; safe to call on every mount. */
export function initModsBridge(): void {
  if (!modsBridgeAvailable() || window.__gisModsEvent) return;
  window.__gisModsEvent = (event: unknown) => {
    const payload = event as { requestId?: number } | null;
    if (!payload || typeof payload.requestId !== "number") return;
    const waiter = waiters.get(payload.requestId);
    if (!waiter) return;
    waiters.delete(payload.requestId);
    waiter(payload);
  };
}

/** Every installed mod, compiled. An empty list on a build with no Workshop. */
export async function listMods(): Promise<InstalledMod[]> {
  const reply = (await request({ action: "list" }, LIST_TIMEOUT_MS)) as {
    ok?: boolean;
    mods?: InstalledMod[];
  } | null;
  return reply?.ok ? (reply.mods ?? []) : [];
}

/**
 * Open the game's Steam Workshop hub — the door a joiner MISSING a mod is
 * offered (docs/multiplayer.md): the session refuses them until they have it,
 * and a refusal with nowhere to go is a dead end. Fire-and-forget: the Steam
 * client owns the page from here.
 *
 * The HUB rather than the item's own page, honestly: the wire carries the
 * mod's compiled id and the Workshop needs its published FILE id, and nothing
 * maps one to the other across the handshake yet. The per-item link is
 * a known debt (docs/multiplayer.md — What is NOT here yet).
 */
export function openWorkshop(): void {
  if (!modsBridgeAvailable()) return;
  postToShell({ __gisMods: true, action: "workshop", requestId: 0 });
}

/** Publish (or update) a mod folder on the Workshop. */
export async function publishMod(
  folder: string,
  changeNote: string,
): Promise<PublishResult> {
  const reply = (await request(
    { action: "publish", folder, changeNote },
    PUBLISH_TIMEOUT_MS,
  )) as (PublishResult & { ok?: boolean }) | null;
  return reply ?? { ok: false, reason: "error", detail: "no reply" };
}

/**
 * One round trip. A timeout resolves null rather than rejecting: every caller
 * here is drawing a menu, and a menu that throws because a disk was slow is
 * worse than one that says there are no mods.
 */
function request(
  message: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  if (!modsBridgeAvailable()) return Promise.resolve(null);
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters.delete(requestId);
      resolve(null);
    }, timeoutMs);
    waiters.set(requestId, (payload) => {
      window.clearTimeout(timer);
      resolve(payload);
    });
    postToShell({ __gisMods: true, ...message, requestId });
  });
}
