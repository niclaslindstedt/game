// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIVE HUD — the shipped layout, plus whatever a mod merged onto it.
//
// The arrangement is the one every other moddable catalog in the app uses (the
// sound bank, the sprite record, the engine's own registries): a module-level
// binding holding the ACTIVE catalog, a `SHIPPED_*` export the mod loader
// starts each merge from, and a setter. Nothing downstream can tell a mod's
// element from ours, which is the whole point — a replaced bag pouch is drawn,
// pressed and sounded by exactly the code that draws the shipped one.
//
// THE MERGE RULES, and each is a question the compiler cannot answer because
// each mod was compiled alone:
//
//   ELEMENTS merge BY ID, later wins. That is what makes `hud/elements/bag_slot.yaml`
//            a REPLACEMENT of the pouch rather than a second pouch — and what
//            makes a brand-new id an ADDITION, which is the WoW-addon story.
//   REGIONS  merge by id too, so a mod restyles the portrait plate by naming it
//            and hangs a new rail off `left` by naming a new one.
//   EVENTS   merge per moment, so a mod that re-points the trade chirp keeps
//            every other HUD sound the game shipped.
//   SCRIPTS  merge by file stem, exactly as the engine's rules do.
//
// A mod that ships no HUD at all changes nothing here, which is almost every
// mod.

import {
  HUD_ELEMENTS,
  HUD_EVENT_SOUNDS,
  HUD_REGIONS,
  HUD_SCRIPTS,
} from "../../generated/hud.ts";
import type { HudEvent, HudLayout } from "./types.ts";

/** The shipped HUD, for the mod loader to merge onto. */
export const SHIPPED_HUD: HudLayout = {
  regions: HUD_REGIONS,
  elements: HUD_ELEMENTS,
  events: HUD_EVENT_SOUNDS,
  scripts: HUD_SCRIPTS,
};

let live: HudLayout = SHIPPED_HUD;

/** How many times the layout has been swapped — the HUD's scripts key their
 * compiled modules off this, so a mod's replacement Lua is picked up and
 * `restoreHudLayout()` genuinely puts the shipped judgements back. */
let generation = 0;

export function hudLayout(): HudLayout {
  return live;
}

export function hudGeneration(): number {
  return generation;
}

/** Install a merged layout (the mod loader's business). */
export function setHudLayout(layout: HudLayout): void {
  live = layout;
  generation += 1;
}

/** Put the shipped HUD back — called with the rest of `restoreBaseDefs()` when
 * a modded run ends, for the same reason: a HUD is applied to a RUN, never to
 * an install. */
export function restoreHudLayout(): void {
  live = SHIPPED_HUD;
  generation += 1;
}

/**
 * Merge one mod's HUD onto a layout, returning a fresh one.
 *
 * Kept here rather than in the mod loader so the rule above has ONE
 * implementation — the loader walks the stack, this decides what "later wins"
 * means for each of the four catalogs. Every id it took over is reported back,
 * so the MODS screen can say which mod is drawing an element two of them ship.
 */
export function mergeHud(
  base: HudLayout,
  mod: Partial<HudLayout>,
): { layout: HudLayout; claimed: string[] } {
  const claimed: string[] = [];
  const regions = { ...base.regions };
  for (const [id, region] of Object.entries(mod.regions ?? {})) {
    regions[id] = region;
    claimed.push(`region:${id}`);
  }
  const byId = new Map(base.elements.map((element) => [element.id, element]));
  for (const element of mod.elements ?? []) {
    byId.set(element.id, element);
    claimed.push(element.id);
  }
  const elements = [...byId.values()].sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : 1),
  );
  const events = { ...base.events };
  for (const [event, sound] of Object.entries(mod.events ?? {})) {
    events[event as HudEvent] = sound;
    claimed.push(`sound:${event}`);
  }
  const scripts = { ...base.scripts };
  for (const [id, script] of Object.entries(mod.scripts ?? {})) {
    scripts[id] = script;
    claimed.push(`script:${id}`);
  }
  return { layout: { regions, elements, events, scripts }, claimed };
}
