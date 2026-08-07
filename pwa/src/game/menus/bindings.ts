// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE `menu.*` BINDINGS — every live value a window may read about the windows.
//
// The same rule the HUD's bindings obey: a binding is a READ, never a
// computation. "Is the hero carrying a clean slate" is a read; "does that row
// say THE BIBLE or THE BIBLE (2)" is a judgement, and lives in
// `content/menus/scripts/`.
//
// They are published on the HUD's own table rather than a second one, so a HUD
// element can gate on `menu.modalOpen` and a menu row can read `hud.hpFrac`
// without either catalog knowing about the other. The names are the schema's
// (`scripts/asset-tools/hud-schema.mjs`), and
// `tests/content/ingame_menu_catalog_test.ts` pins the two together.

import type { HudValues } from "../hud/bindings.ts";
import type { OpenModal } from "./modals.ts";

/** What the app knows about the windows this instant. Small on purpose: every
 * entry is something a shipped window genuinely gates on, and each one a mod
 * can read. */
export type MenuUiState = {
  /** The run's own screen the local hero is parked behind (`PlayerScreen`), or
   * undefined when he is on the field. */
  screen: string | undefined;
  /** Which face of the character screen is showing. */
  charTab: "bag" | "stats";
  /** Clean slates the hero is carrying (`Player.cleanSlates`). */
  cleanSlates: number;
  /** This run may be handed to the AUTO PILOT at all — not the demo, not BOT
   * VIEW (a bot is already flying it), not a hardcore hero (a permadeath the
   * player did not watch). */
  autopilotOffered: boolean;
  /** …and the meter is running. */
  autopilotActive: boolean;
  /** This run is HOW TO PLAY — a showcase the player only watches. */
  demo: boolean;
  hardcore: boolean;
  /** There is a multiplayer session behind this run. */
  session: boolean;
};

export function menuBindings(
  ui: MenuUiState,
  stack: readonly OpenModal[],
): HudValues {
  // THE TOP OF THE STACK is what `menu.modal` answers, because that is the
  // window the player is actually looking at — the one under it is furniture.
  const top = stack[stack.length - 1];
  return {
    "menu.screen": ui.screen ?? "",
    "menu.open": ui.screen !== undefined,
    "menu.modal": top?.id ?? "",
    "menu.modalOpen": top !== undefined,
    "menu.modalArg": top?.arg === undefined ? "" : String(top.arg),
    "menu.charTab": ui.charTab,
    "menu.charBag": ui.charTab === "bag",
    "menu.charStats": ui.charTab === "stats",
    "menu.cleanSlates": ui.cleanSlates,
    "menu.hasCleanSlate": ui.cleanSlates > 0,
    "menu.autopilotOffered": ui.autopilotOffered,
    "menu.autopilotActive": ui.autopilotActive,
    "menu.demo": ui.demo,
    "menu.hardcore": ui.hardcore,
    "menu.session": ui.session,
  };
}
