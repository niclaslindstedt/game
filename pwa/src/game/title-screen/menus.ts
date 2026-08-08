// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menu tree's front door: buildMenu dispatches a screen id to its row
// builder (menus-*.ts). TitleScreen calls it inside its `entries` memo, so
// every rebuild reads fresh settings/roster state.
//
// The SHAPE of every screen — its rows, their order, their words, where BACK
// goes — is `content/mainmenu.yaml`, read through menu-tree.ts. This file only
// says which builder owns which screen.

import {
  backRow,
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
  type ModsMenuState,
} from "./menu-model.ts";
import { screenHeading, type ScreenHeading } from "./menu-tree.ts";
import {
  buildBotspeedMenu,
  buildDifficultyMenu,
  buildLevelsMenu,
} from "./menus-campaign.ts";
import { buildDataMenu, buildExportMenu } from "./menus-data.ts";
import {
  buildBalanceMenu,
  buildCheatsMenu,
  buildDeveloperMenu,
  buildGalleriesMenu,
  buildPlaygroundMenu,
  buildSeedMenu,
  buildVisualsMenu,
} from "./menus-developer.ts";
import { buildExtrasMenu, buildMainMenu } from "./menus-main.ts";
import {
  buildDevMinigamesMenu,
  buildMinigamesMenu,
} from "./menus-minigames.ts";
import {
  buildModInfoMenu,
  buildModOrderMenu,
  buildModsMenu,
} from "./menus-mods.ts";
import {
  buildAddressMenu,
  buildHostMenu,
  buildMultiplayerMenu,
  buildSessionsMenu,
} from "./menus-net.ts";
import {
  buildAudioMenu,
  buildControlsMenu,
  buildGameplayMenu,
  buildGoreMenu,
  buildInterfaceMenu,
  buildKeybindingsMenu,
  buildSettingsMenu,
  buildVoiceMenu,
} from "./menus-settings.ts";
import {
  buildStoreConfirmMenu,
  buildStoreHeroMenu,
  buildStoreMenu,
  buildStoreSendMenu,
} from "./menus-store.ts";

/** The rows for `screen`. A screen that draws its own surface (the scores
 * board, the arsenal, the achievements shelf, the vault, the effects gallery) —
 * and a campaign picker with no hero — falls through to a lone BACK row, so the
 * cursor always has somewhere to land and the tree still says where that is. */
export function buildMenu(screen: MenuScreen, ctx: MenuContext): MenuEntry[] {
  if (screen === "main") return buildMainMenu(ctx);
  if (screen === "extras") return buildExtrasMenu(ctx);
  if (screen === "minigames") return buildMinigamesMenu(ctx);
  // The same shelf with its lock off, under DEVELOPER → PLAYGROUND. Gated on
  // `__DEV_TOOLS__` like every other developer screen, so the store build folds
  // the branch (and the row that opens it) away.
  if (__DEV_TOOLS__ && screen === "devminigames") {
    return buildDevMinigamesMenu(ctx);
  }
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
  if (screen === "multiplayer") return buildMultiplayerMenu(ctx);
  if (screen === "host") return buildHostMenu(ctx, ctx.net);
  if (screen === "sessions") return buildSessionsMenu(ctx, ctx.net);
  if (screen === "address") return buildAddressMenu(ctx, ctx.net);
  if (screen === "mods") return buildModsMenu(ctx, ctx.mods);
  if (screen === "modinfo") return buildModInfoMenu(ctx, ctx.mods);
  if (screen === "modorder") return buildModOrderMenu(ctx, ctx.mods);
  if (screen === "settings") return buildSettingsMenu(ctx);
  if (__DEV_TOOLS__ && screen === "developer") return buildDeveloperMenu(ctx);
  if (__DEV_TOOLS__ && screen === "playground") return buildPlaygroundMenu(ctx);
  if (__DEV_TOOLS__ && screen === "cheats") return buildCheatsMenu(ctx);
  if (__DEV_TOOLS__ && screen === "galleries") return buildGalleriesMenu(ctx);
  if (__DEV_TOOLS__ && screen === "visuals") return buildVisualsMenu(ctx);
  if (__DEV_TOOLS__ && screen === "balance") return buildBalanceMenu(ctx);
  if (__DEV_TOOLS__ && screen === "seed") return buildSeedMenu(ctx);
  if (screen === "data") return buildDataMenu(ctx);
  // Reachable only from the DATA screen's EXPORT CHARACTER row, which exists
  // only where file transfer does (the web — see `transferOpen`).
  if (screen === "export") return buildExportMenu(ctx);
  if (screen === "gameplay") return buildGameplayMenu(ctx);
  if (screen === "controls") return buildControlsMenu(ctx);
  if (screen === "keybindings") return buildKeybindingsMenu(ctx);
  if (screen === "interface") return buildInterfaceMenu(ctx);
  if (screen === "gore") return buildGoreMenu(ctx);
  if (screen === "audio") return buildAudioMenu(ctx);
  if (screen === "voice") return buildVoiceMenu(ctx);
  return [backRow(ctx, screen)];
}

/**
 * A sub-screen's header, with the two variants the tree cannot carry: MOD INFO
 * is titled by the mod it is showing (a name that arrives over a bridge, so no
 * compiled tree could hold it), and the campaign pickers say something
 * different when they were opened by the developer WARP, which is a mode rather
 * than a place. The warp variant folds away with the rest of the tooling —
 * nothing can set `warp` without it.
 */
export function headingFor(
  screen: MenuScreen,
  warp: boolean,
  mods?: ModsMenuState,
): ScreenHeading | null {
  // MOD INFO is a page ABOUT one mod, so the mod names it — the tree's own
  // title is the fallback for a page opened with nothing on it, which the UI
  // cannot do. A mod that did not compile has no compiled name, so its folder
  // stands in, exactly as it does on the row that opened this.
  if (screen === "modinfo" && mods?.selected) {
    const mod = mods.selected;
    const title =
      mod.bundle?.name ??
      mod.folder.split(/[/\\]/).filter(Boolean).pop() ??
      mod.key;
    return { title: title.toUpperCase(), trail: "MODS", tone: "player" };
  }
  if (__DEV_TOOLS__ && warp && screen === "difficulty") {
    return { title: "DIFFICULTY", trail: "WARP", tone: "dev" };
  }
  if (__DEV_TOOLS__ && warp && screen === "levels") {
    return { title: "MISSION", trail: "WARP", tone: "dev" };
  }
  return screenHeading(screen);
}

export type { HeadingTone, ScreenHeading } from "./menu-tree.ts";
