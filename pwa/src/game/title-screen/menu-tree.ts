// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MENU TREE — the compiled `content/mainmenu.yaml`, and the one way to ask
// it anything.
//
// The tree says what the menu IS: which screens exist, what each screen's rows
// are called, what they look like, which one opens which, and where BACK goes.
// The builders (menus-*.ts) say what a row DOES. They meet on the row's `id`,
// which is why nothing here takes a label as an argument and nothing there
// writes one down.
//
// THE TREE IS SHIPPED-ONLY AND A MOD CANNOT TOUCH IT. Every other catalog in
// the game arrives through `registerDefs` so a conversion can replace it; this
// one does not, and deliberately. The tree decides which screens exist at all —
// a mod that could rewrite it could hand itself the DEVELOPER tree (the warp,
// the balance knobs, the free coins) on a shipped build. Menus are app chrome,
// not content. `mod/tools/build.mjs` refuses a mod that ships a `mainmenu.yaml`
// rather than ignoring it, so the rule reaches the author.

import { MENU_TREE } from "../../generated/menu.ts";
import type { MenuScreen } from "./menu-model.ts";

/** Which accent family a sub-screen header wears. The tone colours the TRAIL
 * and the rule under the title (and, in the vault, the title itself) — never
 * the menu rows, whose amber belongs to the selection alone. */
export type HeadingTone = "player" | "dev" | "store";

/** How a screen lays its rows out. `settings` is the stable form: a fixed-width
 * column, and every row's help hoisted to one bottom line. */
export type MenuForm = "menu" | "settings";

/** A screen that draws its OWN display rather than a row list. `full` takes
 * over the viewport (the achievements shelf, the vault, the arsenal, the
 * effects gallery); `column` rides inside the menu column and keeps the shared
 * page header (the high-score board). */
export type MenuSurface = "full" | "column";

/** A row's help: one line, or a line per STATE the row can be in (`on`/`off`,
 * a steering mode, a map size). A row whose help is computed carries none and
 * words itself in the builder. */
export type MenuHelp = string | Record<string, string>;

export type MenuRowDef = {
  id: string;
  label: string;
  icon?: string;
  help?: MenuHelp;
  /** The child screen this row navigates to. */
  opens?: MenuScreen;
};

export type MenuScreenDef = {
  id: MenuScreen;
  /** The page heading. Absent on `main` (its logo is the header) and on a
   * full-surface screen that draws its own. */
  title?: string;
  /** The breadcrumb above the title, DERIVED at build time from the chain of
   * parents ("SETTINGS » CONTROLS"). */
  trail?: string;
  tone: HeadingTone;
  form?: MenuForm;
  surface?: MenuSurface;
  /** Where BACK and Escape go. Absent only on `main`. */
  parent?: MenuScreen;
  /** Which row of the parent the cursor lands on coming back. Absent where the
   * parent's rows come from a catalog (the mission list, the coin packs) and
   * the builder hands BACK its own cursor. */
  home?: string;
  /** The row list can genuinely outgrow a short viewport: cap it and let it
   * scroll (see useMenuOverflow). */
  scroll?: boolean;
  /** The import/export/purchase result line shows under this screen. */
  notice?: boolean;
  /** Part of the hidden DEVELOPER tree — absent from a store build. */
  dev?: boolean;
  rows: MenuRowDef[];
};

/** Every screen, keyed by id. */
export const MENU_SCREENS = MENU_TREE as Record<MenuScreen, MenuScreenDef>;

/**
 * A screen's definition.
 *
 * Throws rather than returning null: a screen id that is not in the tree is a
 * build that shipped a stale generated menu, and a menu drawing itself
 * label-less around the hole is far harder to diagnose than a loud failure on
 * the screen that first asks.
 */
export function screenDef(screen: MenuScreen): MenuScreenDef {
  const def = MENU_SCREENS[screen];
  if (!def) throw new Error(`menu screen "${screen}" is not in the tree`);
  return def;
}

/** One authored row. Throws for the same reason `screenDef` does — a builder
 * asking for a row the tree has no line for is a rename that only got done on
 * one side. */
export function rowDef(screen: MenuScreen, id: string): MenuRowDef {
  const row = screenDef(screen).rows.find((entry) => entry.id === id);
  if (!row) throw new Error(`menu row "${screen}.${id}" is not in the tree`);
  return row;
}

/**
 * A row's help line for the state it is currently in.
 *
 * `state` picks a line out of a keyed help block — the whole point of keying it
 * is that a settings row says what it DOES right now, never both halves of a
 * table at once. A row with a single authored line ignores the state; a row
 * with none (its help is computed) answers undefined.
 */
export function rowHelp(
  screen: MenuScreen,
  id: string,
  state?: string,
): string | undefined {
  const { help } = rowDef(screen, id);
  if (help === undefined) return undefined;
  if (typeof help === "string") return help;
  if (state === undefined) return undefined;
  return help[state];
}

/** The aria label a row answers to. Screen-qualified, so the same row id can be
 * reused on two screens (every screen has a `reset`) and a cursor can still be
 * homed onto exactly one of them. */
export function rowAria(screen: MenuScreen, id: string): string {
  return `${screen}-${id}`;
}

/** Where BACK goes from `screen`, or null on the root. */
export function parentOf(screen: MenuScreen): MenuScreen | null {
  return screenDef(screen).parent ?? null;
}

/** The SETTINGS-tree screens — the ones that render as a stable form (fixed
 * width, one bottom help line). Derived from the tree's own `form`, so a new
 * settings page joins by being authored rather than by being remembered. */
export const SETTINGS_TREE: ReadonlySet<MenuScreen> = new Set(
  (Object.keys(MENU_SCREENS) as MenuScreen[]).filter(
    (id) => MENU_SCREENS[id].form === "settings",
  ),
);

/** A sub-screen's header: the page TITLE (the leaf, drawn large and bright) and
 * the TRAIL above it — the screens it hangs under, drawn small and dim, so
 * "SETTINGS » CONTROLS" reads as a place in a tree instead of one flat label.
 * Null on `main`, whose logo and tagline ARE the header, and on a full-surface
 * screen that prints its own. */
export type ScreenHeading = {
  title: string;
  trail?: string;
  tone: HeadingTone;
};

export function screenHeading(screen: MenuScreen): ScreenHeading | null {
  const def = screenDef(screen);
  if (def.title === undefined) return null;
  return { title: def.title, trail: def.trail, tone: def.tone };
}
