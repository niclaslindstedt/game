// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIVE IN-GAME MENUS — the shipped catalog, plus whatever a mod merged onto
// it, and the one place that decides what "merged" means.
//
// The arrangement is the HUD's (`../hud/layout.ts`) and every other moddable
// catalog's: a module-level binding holding the ACTIVE windows, a `SHIPPED_*`
// export the mod loader starts each merge from, and a setter. Nothing
// downstream can tell a mod's window from ours, which is the whole point — a
// replaced pause menu is drawn, pressed and sounded by exactly the code that
// draws the shipped one.
//
// THE MERGE RULES, each a question the compiler cannot answer because each mod
// was compiled alone:
//
//   MENUS    merge by id, later wins — so `menus/pause.yaml` REPLACES the pause
//            menu and a new id ADDS a window (which, gated on its own
//            `visible:`, is how two windows share one screen).
//   MODALS   the same, by id.
//   ELEMENTS the same, by id — and because an element merges into a window's
//            body by id too, a mod's row with a shipped row's id replaces THAT
//            ROW and leaves the rest of the window alone. That is the WoW-addon
//            story, and it is why every shipped row has a name.
//   SCRIPTS  merge by file stem, exactly as the engine's rules do.
//
// A mod that ships no menus at all changes nothing here, which is almost every
// mod.

import {
  MENUS,
  MENU_ELEMENTS,
  MENU_MODALS,
  MENU_SCRIPTS,
} from "../../generated/ingame-menus.ts";
import type {
  MenuDef,
  MenuElementDef,
  MenuLayout,
  MenuRowDef,
} from "./types.ts";

/** The shipped windows, for the mod loader to merge onto. */
export const SHIPPED_MENUS: MenuLayout = {
  menus: MENUS,
  modals: MENU_MODALS,
  elements: MENU_ELEMENTS,
  scripts: MENU_SCRIPTS,
};

let live: MenuLayout = SHIPPED_MENUS;

/** How many times the catalog has been swapped — the Lua host keys its compiled
 * modules off this (with the HUD's), so a mod's replacement judgements are
 * picked up and `restoreMenuLayout()` genuinely puts the shipped ones back. */
let generation = 0;

export function menuLayout(): MenuLayout {
  return live;
}

export function menuGeneration(): number {
  return generation;
}

/** Install a merged catalog (the mod loader's business). */
export function setMenuLayout(layout: MenuLayout): void {
  live = layout;
  generation += 1;
}

/** Put the shipped windows back — called with the rest of `restoreBaseDefs()`
 * when a modded run ends, for the same reason: menus apply to a RUN, never to
 * an install. */
export function restoreMenuLayout(): void {
  live = SHIPPED_MENUS;
  generation += 1;
}

/**
 * Merge one mod's menus onto a catalog, returning a fresh one.
 *
 * Kept here rather than in the mod loader so the rules above have ONE
 * implementation. Every id it took over is reported back, so the MODS screen
 * can say which mod is drawing a window two of them ship.
 */
export function mergeMenus(
  base: MenuLayout,
  mod: Partial<MenuLayout>,
): { layout: MenuLayout; claimed: string[] } {
  const claimed: string[] = [];
  const byId = <T extends { id: string }>(
    ours: T[],
    theirs: T[] | undefined,
    label: string,
  ): T[] => {
    if (!theirs || theirs.length === 0) return ours;
    const map = new Map(ours.map((entry) => [entry.id, entry]));
    for (const entry of theirs) {
      map.set(entry.id, entry);
      claimed.push(`${label}:${entry.id}`);
    }
    return [...map.values()];
  };
  const menus = byId(base.menus, mod.menus, "menu").sort(order);
  const modals = byId(base.modals, mod.modals, "modal").sort(order);
  const elements = byId(base.elements, mod.elements, "menu-row").sort(order);
  const scripts = { ...base.scripts };
  for (const [id, script] of Object.entries(mod.scripts ?? {})) {
    scripts[id] = script;
    claimed.push(`script:${id}`);
  }
  return { layout: { menus, modals, elements, scripts }, claimed };
}

function order(
  a: { order?: number; id: string },
  b: { order?: number; id: string },
) {
  return (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : 1);
}

/**
 * WHICH WINDOW A SCREEN GETS — the first one that answers it and holds.
 *
 * Several windows may name the same screen (the demo's exit confirm and the
 * ordinary pause menu both answer `paused`); they are checked in `order` and
 * the first whose `visible:` holds is drawn. First-match rather than
 * draw-them-all, because two windows over one screen is two boxes stacked on
 * each other — which is a modal, and modals have their own door.
 */
export function menuForScreen(
  menus: MenuDef[],
  screen: string,
  holds: (menu: MenuDef) => boolean,
): MenuDef | undefined {
  return menus.find((menu) => menu.screen === screen && holds(menu));
}

/**
 * THE ROWS ONE WINDOW ACTUALLY DRAWS: its own body, with every free-standing
 * element aimed at it merged in.
 *
 * Two merges, and the second is the one that matters. Rows aimed at the WINDOW
 * merge into its body; rows aimed at a CONTAINER inside it (`into:`) merge into
 * that row's children — which is the difference between adding a button to the
 * pause menu and adding a button NEXT TO the pause menu. Both merge by id, so a
 * mod that reuses a shipped row's id replaces it instead of doubling it.
 *
 * A row aimed at a container this build no longer has lands in the window's
 * body rather than vanishing: a mod compiled against an older game should look
 * wrong, not be silently dropped.
 */
export function windowRows(
  def: MenuDef,
  elements: MenuElementDef[],
): MenuRowDef[] {
  const mine = elements.filter((element) => element.menu === def.id);
  if (mine.length === 0) return def.body;
  const containers = new Set(
    def.body.filter((row) => row.children !== undefined).map((row) => row.id),
  );
  const top = mine.filter(
    (element) => element.into === undefined || !containers.has(element.into),
  );
  const nested = mine.filter(
    (element) => element.into !== undefined && containers.has(element.into),
  );
  const body = merge(def.body, top);
  if (nested.length === 0) return body;
  return body.map((row) => {
    const added = nested.filter((element) => element.into === row.id);
    if (added.length === 0) return row;
    return { ...row, children: merge(childRows(row), added) };
  });
}

/**
 * A container's children, as rows.
 *
 * The compiler stamps an order onto every child (ten times its place) but not
 * an id — a nameless child is legitimate, it just cannot be replaced. This is
 * where the two are reconciled for the merge: a child with no name gets one
 * nothing can collide with.
 */
function childRows(row: MenuRowDef): MenuRowDef[] {
  return (row.children ?? []).map((child, index) => ({
    ...child,
    id: child.id ?? `${row.id}#${index}`,
    order: child.order ?? index * 10,
  }));
}

/**
 * One id-keyed merge, later wins, sorted by order — the rule both halves of
 * `windowRows` use.
 *
 * TWO DEFAULTS CARRY THE WHOLE ADDON STORY, and both are about a row that
 * states no order of its own. A row REPLACING one keeps the replaced row's
 * place, because a mod that re-words RESUME means the button at the top and not
 * a button at the bottom. A NEW row goes to the end, because that is the only
 * answer that cannot push a shipped row somewhere its author did not put it.
 * An `order:` overrides both, which is how a mod lands between two of ours.
 */
function merge(
  ours: readonly MenuRowDef[],
  theirs: readonly MenuElementDef[],
): MenuRowDef[] {
  const out: MenuRowDef[] = ours.map((row, index) => ({
    ...row,
    order: row.order ?? index * 10,
  }));
  let tail = out.reduce((most, row) => Math.max(most, row.order), 0);
  for (const row of theirs) {
    const at = out.findIndex((mine) => mine.id === row.id);
    if (at >= 0) out[at] = { ...row, order: row.order ?? out[at]!.order };
    else out.push({ ...row, order: row.order ?? (tail += 10) });
  }
  // A stable sort, so two rows claiming one order keep the order they arrived
  // in rather than swapping about between renders.
  return out.sort((a, b) => a.order - b.order);
}
