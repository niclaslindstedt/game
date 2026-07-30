// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menu tree's front door: buildMenu dispatches a screen id to its row
// builder (menus-*.ts), and screenHeading names the sub-screen heading drawn
// under the shrunken logo. TitleScreen calls buildMenu inside its `entries`
// memo, so every rebuild reads fresh settings/roster state.

import {
  backTo,
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
} from "./menu-model.ts";
import {
  buildBotspeedMenu,
  buildDifficultyMenu,
  buildLevelsMenu,
} from "./menus-campaign.ts";
import { buildDataMenu, buildExportMenu } from "./menus-data.ts";
import {
  buildBalanceMenu,
  buildDeveloperMenu,
  buildSeedMenu,
  buildVisualsMenu,
} from "./menus-developer.ts";
import { buildMainMenu, buildPlayMenu, mainRowIndex } from "./menus-main.ts";
import { buildModOrderMenu, buildModsMenu } from "./menus-mods.ts";
import {
  buildControlsMenu,
  buildDisplayMenu,
  buildGraphicsMenu,
  buildKeybindingsMenu,
  buildSettingsMenu,
  buildSoundMenu,
} from "./menus-settings.ts";
import {
  buildStoreConfirmMenu,
  buildStoreHeroMenu,
  buildStoreMenu,
  buildStoreSendMenu,
} from "./menus-store.ts";

/** The rows for `screen`. Screens that run their own surface (scores,
 * arsenal, achievements) — and the campaign pickers without a hero — fall
 * through to a lone BACK row, so the cursor always has somewhere to land. */
export function buildMenu(screen: MenuScreen, ctx: MenuContext): MenuEntry[] {
  if (screen === "main") return buildMainMenu(ctx);
  if (screen === "play") return buildPlayMenu(ctx);
  if (screen === "store") return buildStoreMenu(ctx);
  if (screen === "storeconfirm") return buildStoreConfirmMenu(ctx);
  if (screen === "storehero") return buildStoreHeroMenu(ctx);
  if (screen === "storesend") return buildStoreSendMenu(ctx);
  if (screen === "difficulty" && ctx.character) {
    return buildDifficultyMenu(ctx, ctx.character);
  }
  if (screen === "levels" && ctx.character) {
    return buildLevelsMenu(ctx, ctx.character);
  }
  // The DEVELOPER tree exists only where the tooling ships (`__DEV_TOOLS__` —
  // every build but the production store upload). The flag is a build-time
  // literal, so an off build folds these guards to `false` and Rollup drops
  // menus-developer.ts (and the BOT VIEW step) out of the bundle entirely.
  if (__DEV_TOOLS__ && screen === "botspeed" && ctx.character) {
    return buildBotspeedMenu(ctx);
  }
  if (screen === "mods") return buildModsMenu(ctx, ctx.mods);
  if (screen === "modorder") return buildModOrderMenu(ctx, ctx.mods);
  if (screen === "settings") return buildSettingsMenu(ctx);
  if (__DEV_TOOLS__ && screen === "developer") return buildDeveloperMenu(ctx);
  if (__DEV_TOOLS__ && screen === "visuals") return buildVisualsMenu(ctx);
  if (__DEV_TOOLS__ && screen === "balance") return buildBalanceMenu(ctx);
  if (__DEV_TOOLS__ && screen === "seed") return buildSeedMenu(ctx);
  if (screen === "data") return buildDataMenu(ctx);
  // Reachable only from the DATA screen's EXPORT CHARACTER row, which exists
  // only where file transfer does (the web — see `transferOpen`).
  if (screen === "export") return buildExportMenu(ctx);
  if (screen === "sound") return buildSoundMenu(ctx);
  if (screen === "controls") return buildControlsMenu(ctx);
  if (screen === "keybindings") return buildKeybindingsMenu(ctx);
  if (screen === "display") return buildDisplayMenu(ctx);
  if (screen === "graphics") return buildGraphicsMenu(ctx);
  // A screen that runs its own surface: the lone BACK row homes on the
  // main-menu row that opened it.
  const home =
    screen === "scores"
      ? "high-scores"
      : screen === "achievements"
        ? "achievements"
        : "play";
  return [backTo(ctx, "main", mainRowIndex(ctx, home))];
}

/** Which accent family a sub-screen header wears. The tone colours the TRAIL
 * and the rule under the title (and, in the vault, the title itself) — never
 * the menu rows, whose amber belongs to the selection alone. */
export type HeadingTone = "player" | "dev" | "store";

/** A sub-screen's header: the page TITLE (the leaf, drawn large and bright)
 * and the TRAIL above it — the screens it hangs under, drawn small and dim, so
 * "SETTINGS » CONTROLS" reads as a place in a tree instead of one flat label
 * the size of a footnote. */
export type ScreenHeading = {
  /** The leaf: what this screen IS. Kept short — it is the loud line. */
  title: string;
  /** The path to it, without the leaf. Omitted on a screen that hangs
   * directly off the main menu (PLAY, SETTINGS, DEVELOPER, the vault). */
  trail?: string;
  tone: HeadingTone;
};

/** The DEVELOPER tree's own headings. Split out of `screenHeading` below so a
 * build without the developer tooling (`__DEV_TOOLS__` false — the store
 * upload) drops them along with the screens they name, instead of leaving a
 * handful of dead DEVELOPER labels in the bundle for anyone to read. */
function developerHeading(screen: MenuScreen): ScreenHeading | null {
  switch (screen) {
    case "botspeed":
      return { title: "BOT VIEW", trail: "DEVELOPER", tone: "dev" };
    case "developer":
      return { title: "DEVELOPER", tone: "dev" };
    case "visuals":
      return { title: "VISUALS", trail: "DEVELOPER", tone: "dev" };
    case "balance":
      return { title: "BALANCE", trail: "DEVELOPER", tone: "dev" };
    case "seed":
      return { title: "SEED CHARACTERS", trail: "DEVELOPER", tone: "dev" };
    default:
      return null;
  }
}

/** The sub-screen header drawn under the shrunken logo (null on `main`, whose
 * logo + tagline are the header, and on the screens that draw their own —
 * scores, arsenal, achievements). */
export function screenHeading(
  screen: MenuScreen,
  warp: boolean,
): ScreenHeading | null {
  switch (screen) {
    case "play":
      return { title: "PLAY", tone: "player" };
    // The coin store keeps its warm gold banner — a treasure-vault sign, not
    // the plain bone title of the settings-style screens.
    case "store":
      return { title: "THE COIN VAULT", tone: "store" };
    case "storeconfirm":
      return { title: "STRIKE GOLD", trail: "COIN VAULT", tone: "store" };
    case "storehero":
      return { title: "DISTRIBUTE", trail: "COIN VAULT", tone: "store" };
    case "storesend":
      return { title: "DISTRIBUTE", trail: "COIN VAULT", tone: "store" };
    // The campaign pickers keep their flavour titles and skip the trail: the
    // line is already long, and PLAY is one hop back.
    // The WARP variants belong to the developer picker, so they fold away with
    // the rest of the tooling (nothing can set `warp` without it).
    case "difficulty":
      return __DEV_TOOLS__ && warp
        ? { title: "DIFFICULTY", trail: "WARP", tone: "dev" }
        : { title: "CHOOSE YOUR NIGHTMARE", tone: "player" };
    case "levels":
      return __DEV_TOOLS__ && warp
        ? { title: "MISSION", trail: "WARP", tone: "dev" }
        : { title: "CHOOSE YOUR MISSION", tone: "player" };
    // The board draws its own surface but rides in the menu column, so it
    // takes the shared header rather than printing a title of its own.
    case "scores":
      return { title: "HIGH SCORES", tone: "player" };
    // MODS hangs directly off the main menu, so it takes no trail.
    case "mods":
      return { title: "MODS", tone: "player" };
    case "modorder":
      return { title: "LOAD ORDER", trail: "MODS", tone: "player" };
    case "settings":
      return { title: "SETTINGS", tone: "player" };
    case "controls":
      return { title: "CONTROLS", trail: "SETTINGS", tone: "player" };
    case "keybindings":
      return {
        title: "KEY BINDINGS",
        trail: "SETTINGS » CONTROLS",
        tone: "player",
      };
    case "display":
      return { title: "DISPLAY", trail: "SETTINGS", tone: "player" };
    case "graphics":
      return { title: "VISUALS", trail: "SETTINGS", tone: "player" };
    case "sound":
      return { title: "SOUND", trail: "SETTINGS", tone: "player" };
    case "data":
      return { title: "DATA", trail: "SETTINGS", tone: "player" };
    case "export":
      return {
        title: "EXPORT CHARACTER",
        trail: "SETTINGS » DATA",
        tone: "player",
      };
    default:
      return __DEV_TOOLS__ ? developerHeading(screen) : null;
  }
}
