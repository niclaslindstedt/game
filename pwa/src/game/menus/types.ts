// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE IN-GAME MENUS AS DATA — the shape `content/menus/**` compiles to, and the
// shape a mod's own menus arrive in.
//
// Types only, for the reason the HUD's are: this file is imported by the
// GENERATED catalog (`pwa/src/generated/ingame-menus.ts`), by the renderer, by
// the mod loader and by the tests, and any value in it would be a value all
// four carry.
//
// A ROW IS A HUD NODE. Every kind, binding, press, judgement and style property
// a menu row may carry is the HUD's own (`../hud/types.ts`), because they are
// one grammar drawn by one renderer — the only difference is that a HUD element
// names the REGION it sits in and a menu row names the WINDOW. The vocabulary
// those windows are validated against lives in
// `scripts/asset-tools/ingame-menu-schema.mjs`.

import type {
  HudCondition,
  HudNodeDef,
  HudPress,
  HudScriptSource,
  HudStyle,
} from "../hud/types.ts";

/**
 * One row of a window: a HUD node that knows its place in the window's order.
 *
 * The `id` is not decoration — it is how a mod REPLACES this row. Every
 * top-level row of every shipped window has one, and the schema refuses a row
 * without one.
 */
export type MenuRowDef = HudNodeDef & { id: string; order: number };

/**
 * A row shipped on its own (`content/menus/elements/<id>.yaml`), naming the
 * window it merges into. The addon seam: one file adds one button.
 *
 * `into` names a CONTAINER row inside that window — the pause menu's action
 * stack — which is the difference between adding a button TO the pause menu and
 * adding one NEXT TO it. `order` is optional here and its absence means
 * something: a row replacing one of ours keeps that row's place, and a new one
 * goes to the end (see `windowRows`).
 */
export type MenuElementDef = HudNodeDef & {
  id: string;
  menu: string;
  into?: string;
  order?: number;
};

/**
 * A WINDOW — one of the run's screens drawn, or a modal stacked over it.
 *
 * `screen` is set on a MENU and names the `PlayerScreen` the engine parks the
 * hero behind; a MODAL has none and is raised by a press (`openModal`) or by
 * its own `when:`.
 */
export type MenuDef = {
  id: string;
  /** The run's own screen this window draws (menus only). */
  screen?: string;
  /** Among the windows answering the same screen — first visible one wins. */
  order: number;
  /** `window` draws the backdrop and the box; `none` draws neither, for a body
   * whose widget already paints its own full-screen furniture. */
  wrap: "window" | "none";
  /** The class the full-screen backdrop wears. */
  backdrop?: string;
  /** …and the class of the box the rows sit in. */
  class?: string;
  /** A sprite drawn as the box's 9-slice border. */
  frame?: string;
  style?: HudStyle;
  /** What a press on the BACKDROP does. Absent means the backdrop is inert —
   * which is how a window that must be answered refuses to be waved away. */
  dismiss?: HudPress;
  /** What it sounds like when this window opens. */
  sound?: string;
  visible?: HudCondition;
  /**
   * A MODAL's own moment: the condition that RAISES it, edge-triggered — the
   * modal goes up on the publish where the answer turns yes, and not again
   * until it has turned no. A flag, a list of flags, or a Lua judgement, which
   * is the whole of "a mod draws a modal from a script".
   */
  when?: HudCondition;
  /** …and this one is raised at most once per run. */
  once?: boolean;
  body: MenuRowDef[];
};

/** The whole catalog, as the renderer reads it — shipped, or shipped with a
 * stack of mods merged on top. */
export type MenuLayout = {
  menus: MenuDef[];
  modals: MenuDef[];
  elements: MenuElementDef[];
  scripts: Record<string, HudScriptSource>;
};
