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
import { buildMainMenu, buildPlayMenu } from "./menus-main.ts";
import {
  buildControlsMenu,
  buildDisplayMenu,
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
  if (screen === "botspeed" && ctx.character) return buildBotspeedMenu(ctx);
  if (screen === "settings") return buildSettingsMenu(ctx);
  if (screen === "developer") return buildDeveloperMenu(ctx);
  if (screen === "visuals") return buildVisualsMenu(ctx);
  if (screen === "balance") return buildBalanceMenu(ctx);
  if (screen === "seed") return buildSeedMenu(ctx);
  if (screen === "data") return buildDataMenu(ctx);
  if (screen === "export") return buildExportMenu(ctx);
  if (screen === "sound") return buildSoundMenu(ctx);
  if (screen === "controls") return buildControlsMenu(ctx);
  if (screen === "keybindings") return buildKeybindingsMenu(ctx);
  if (screen === "display") return buildDisplayMenu(ctx);
  return [backTo(ctx, "main", ctx.hasResume ? 5 : 4)];
}

/** The sub-screen heading drawn under the shrunken logo (null on `main`,
 * whose logo + tagline are the heading, and on the screens that draw their
 * own — scores, arsenal, achievements). Purple marks the player-facing
 * screens; green the developer surfaces (and the warp variants). */
export function screenHeading(
  screen: MenuScreen,
  warp: boolean,
): { text: string; color: string } | null {
  switch (screen) {
    case "play":
      return { text: "PLAY", color: "#d9a0f0" };
    // The coin store wears a warm gold heading — a treasure-vault banner, not
    // the purple of the settings-style screens — over its raining-coin backdrop.
    case "store":
      return { text: "THE COIN VAULT", color: "#ffd75e" };
    case "storeconfirm":
      return { text: "STRIKE GOLD", color: "#ffd75e" };
    case "storehero":
      return { text: "DISTRIBUTE", color: "#ffd75e" };
    case "storesend":
      return { text: "DISTRIBUTE", color: "#ffd75e" };
    case "difficulty":
      return warp
        ? { text: "WARP TO ANY DIFFICULTY", color: "#7ef0c8" }
        : { text: "CHOOSE YOUR NIGHTMARE", color: "#d9a0f0" };
    case "levels":
      return warp
        ? { text: "WARP TO ANY MISSION", color: "#7ef0c8" }
        : { text: "CHOOSE YOUR MISSION", color: "#d9a0f0" };
    case "botspeed":
      return { text: "BOT VIEW - GAME SPEED", color: "#7ef0c8" };
    case "settings":
      return { text: "SETTINGS", color: "#d9a0f0" };
    case "controls":
      return { text: "SETTINGS - CONTROLS", color: "#d9a0f0" };
    case "keybindings":
      return { text: "CONTROLS - KEY BINDINGS", color: "#d9a0f0" };
    case "display":
      return { text: "SETTINGS - DISPLAY", color: "#d9a0f0" };
    case "sound":
      return { text: "SETTINGS - SOUND", color: "#d9a0f0" };
    case "data":
      return { text: "SETTINGS - DATA", color: "#d9a0f0" };
    case "export":
      return { text: "DATA - EXPORT CHARACTER", color: "#d9a0f0" };
    case "developer":
      return { text: "DEVELOPER", color: "#7ef0c8" };
    case "visuals":
      return { text: "DEVELOPER - VISUALS", color: "#7ef0c8" };
    case "balance":
      return { text: "DEVELOPER - BALANCE", color: "#7ef0c8" };
    case "seed":
      return { text: "DEVELOPER - SEED CHARACTERS", color: "#7ef0c8" };
    default:
      return null;
  }
}
