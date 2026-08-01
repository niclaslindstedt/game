// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE JOINER'S MOD RECONCILE (multiplayer §4.4) — the half of the server
// browser that decides what a row's mod list MEANS for this machine: a gap it
// can close (every mod installed → the host's set is applied on the way
// through the door), or a refusal with the Workshop behind it.
//
// **A LAZY CHUNK, DELIBERATELY.** `use-sessions.ts` sits on the app's startup
// path, where the 200 KB critical-path budget is measured — and this logic is
// only meaningful once the SESSIONS screen is open and a list of other
// people's games is on screen. So the browser screen imports it the way the
// run imports the net client: on demand, behind its own chunk, and the entry
// pays nothing for it. (`check-seo` tripped on exactly this code living
// inline; moving it here is the fix the budget's own rule prescribes.)

import { listMods, type InstalledMod } from "../../app/mods-bridge.ts";
import { activeMods, type ModBundle } from "../mod-state.ts";
import type { Sprites } from "../assets.ts";

/** The gap between a row's mod set and this build's (§4.4). */
export type ModsGap = {
  /** The host's mods NOT installed (or installed but broken) here. */
  missing: string[];
  /** Joining would need the active set swapped at all. */
  needsApply: boolean;
};

export type JoinModsHelper = {
  gap(target: readonly string[]): ModsGap;
};

/** Fetch the installed-mod list and hand back the gap judge the browser's
 * rows read. Compiling a dozen mods is real work — call when the screen
 * opens, never at launch. */
export async function loadJoinMods(): Promise<JoinModsHelper> {
  const mods = await listMods();
  const byId = new Map<string, InstalledMod>();
  for (const mod of mods) {
    const id = (mod.bundle as { id?: unknown } | null)?.id;
    if (typeof id === "string" && mod.bundle) byId.set(id, mod);
  }
  return {
    gap(target) {
      const mine = activeMods().map((stamp) => stamp.id);
      const same =
        target.length === mine.length &&
        target.every((id, at) => mine[at] === id);
      if (same) return { missing: [], needsApply: false };
      return {
        missing: target.filter((id) => !byId.get(id)?.bundle),
        needsApply: true,
      };
    },
  };
}

/**
 * Apply THIS EXACT mod set for a session (§4.4): the host's ids, in the
 * host's load order — an empty set restores the shipped game (a modded
 * joiner entering a stock host's session plays stock). Resolves false when it
 * could not (a bundle missing, a compile failure), and then the join is not
 * attempted.
 */
export async function applyForSession(
  modIds: string[],
  sprites: Sprites,
): Promise<boolean> {
  const mods = await import("../mods.ts");
  if (modIds.length === 0) {
    mods.restoreBaseDefs(sprites);
    return true;
  }
  const list = await listMods();
  const byId = new Map(
    list
      .filter((mod) => mod.bundle)
      .map((mod) => [mod.bundle!.id, mod.bundle!] as const),
  );
  const bundles = modIds.map((id) => byId.get(id));
  if (bundles.some((bundle) => !bundle)) return false;
  await mods.applyMods(bundles as ModBundle[], sprites);
  return true;
}
