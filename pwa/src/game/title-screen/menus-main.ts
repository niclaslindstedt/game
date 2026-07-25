// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The top of the menu tree: the MAIN menu (RESUME / PLAY / HIGH SCORES /
// ACHIEVEMENTS / HOW TO PLAY / STORE / SETTINGS) and the PLAY submenu
// (NEW GAME / LOAD GAME).

import { synth } from "../audio.ts";
import { hasCampaignScores } from "../highscores.ts";
import { getSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";

/** How long the main menu's ACHIEVEMENTS row must be held to reveal the hidden
 * DEVELOPER menu — a deliberately long, secret gesture so it never fires by
 * accident (a tap still opens the achievements browser). The row is the target
 * because it exists in every build; the moon detonates as the payoff. */
export const DEV_HOLD_MS = 7000;

/** What the main menu's shape depends on: a parked run adds RESUME at the top,
 * a store-capable build adds STORE (HIGH SCORES depends on banked scores, which
 * the module reads itself). Every "land back on row N of main" cursor resolves
 * through `mainRowIndex`, so any screen can ask for its home row with just
 * these two flags — no full MenuContext needed. */
export type MainMenuShape = Pick<
  MenuContext,
  "hasResume" | "storeOpen" | "hasVault"
>;

/** The MAIN menu's row ids, top to bottom — the ONE definition of the menu's
 * order. `buildMainMenu` emits its rows in this order and `mainRowIndex`
 * resolves every back-target cursor through it, so moving a row here moves it
 * on every screen that homes onto it. */
function mainRowIds(shape: MainMenuShape): string[] {
  return [
    // Offered only when a run is parked in memory; sits at the top so it's
    // the default highlight when the player ducked out to the menu.
    ...(shape.hasResume ? ["resume"] : []),
    "play",
    // HIGH SCORES is hardcore-only (softcore never banks a score), so the
    // row appears only once a hardcore hero has played a campaign to its
    // end — otherwise the board would be empty and the row is just noise.
    ...(hasCampaignScores() ? ["high-scores"] : []),
    "achievements",
    // The LOST & FOUND — only once a paid AUTO PILOT ride has actually thrown
    // something away; there is nothing to buy back otherwise.
    ...(shape.hasVault ? ["lost-found"] : []),
    "how-to-play",
    // The coin store — native app builds only (purchases need the platform
    // store).
    ...(shape.storeOpen ? ["store"] : []),
    // SETTINGS closes the list: it's the one row nobody comes to the title
    // screen for, so it sits below everything that is about playing.
    "settings",
  ];
}

/** Where `aria` sits in the main menu right now — the cursor a BACK row (or a
 * full-screen browser's close) hands `setCursor` so the player lands back on
 * the row they left from. Falls back to the top row for an unknown id. */
export function mainRowIndex(shape: MainMenuShape, aria: string): number {
  const at = mainRowIds(shape).indexOf(aria);
  return at < 0 ? 0 : at;
}

export function buildMainMenu(ctx: MenuContext): MenuEntry[] {
  const rows: Record<string, MenuEntry> = {
    resume: {
      label: "RESUME",
      aria: "resume",
      icon: "icon_menu_resume",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.onResume?.();
      },
    },
    play: {
      // PLAY is a menu now, not a launch: it opens the NEW GAME / LOAD GAME
      // submenu (picking a hero was the old PLAY's job — the two paths make
      // that choice explicit).
      label: "PLAY",
      aria: "play",
      icon: "icon_swords",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("play");
        ctx.setCursor(0);
      },
    },
    "high-scores": {
      label: "HIGH SCORES",
      aria: "high-scores",
      icon: "icon_trophy",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("scores");
        ctx.setCursor(0);
      },
    },
    // ACHIEVEMENTS doubles as the hidden developer gesture: hold the row for
    // DEV_HOLD_MS and the moon detonates, latching the DEVELOPER row into
    // SETTINGS (ctx.unlockDeveloper). A tap opens the browser as always, and the
    // hold is dropped once the unlock is latched — nothing about the row ever
    // advertises the secret.
    achievements: {
      label: "ACHIEVEMENTS",
      aria: "achievements",
      icon: "icon_medal",
      hold: getSettings().developerUnlocked
        ? undefined
        : { ms: DEV_HOLD_MS, onHold: ctx.unlockDeveloper },
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("achievements");
      },
    },
    // What the AUTO PILOT threw away to keep its bag workable, buyable back
    // for coins (VaultScreen). Amber like the store row — it spends coins.
    "lost-found": {
      label: "LOST & FOUND",
      aria: "lost-found",
      icon: "icon_bag",
      color: "#ffd75e",
      blurb: "BUY BACK WHAT THE AUTO PILOT THREW AWAY",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("vault");
      },
    },
    "how-to-play": {
      label: "HOW TO PLAY",
      aria: "how-to-play",
      icon: "icon_menu_help",
      action: () => {
        playUiSound(synth, "start");
        ctx.onHowToPlay();
      },
    },
    // The coin store row is meant to CATCH THE EYE: its label is struck out of
    // gold — a bevelled, glinting STORE — so the treasure row shines out of the
    // plain menu column. No coin emblem here; the row's own icon leads it.
    store: {
      label: "STORE",
      aria: "store",
      icon: "icon_coins",
      color: "#ffd75e",
      shiny: true,
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setNotice(null);
        ctx.setScreen("store");
        ctx.setCursor(0);
      },
    },
    settings: {
      label: "SETTINGS",
      aria: "settings",
      icon: "icon_menu_settings",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("settings");
        ctx.setCursor(0);
      },
    },
  };
  return mainRowIds(ctx)
    .map((id) => rows[id])
    .filter((row): row is MenuEntry => !!row);
}

export function buildPlayMenu(ctx: MenuContext): MenuEntry[] {
  // The PLAY submenu: NEW GAME mints a fresh hero, LOAD GAME picks (or
  // removes) an existing one. Both open the roster; once a hero is chosen a
  // fresh one drops into the difficulty ladder while one mid-campaign
  // resumes at the start of its current level (see App's onNewGame/onLoadGame).
  // LOAD GAME dims out when there is no saved hero to load.
  const hasRoster = ctx.roster.length > 0;
  return [
    {
      label: "NEW GAME",
      aria: "new-game",
      icon: "icon_menu_new",
      // No blurb: "CREATE A NEW HERO" only restated the label.
      action: () => {
        playUiSound(synth, "confirm");
        ctx.onNewGame();
      },
    },
    {
      label: "LOAD GAME",
      aria: "load-game",
      icon: "icon_menu_load",
      // Greyed and inert with an empty roster — there is no saved hero to
      // load, so mint one via NEW GAME first (mirrors a locked level row).
      color: hasRoster ? undefined : "#5a6068",
      locked: !hasRoster,
      // No blurb while the row works — the label says it. The locked line
      // stays: it's the only thing explaining why the row is greyed out.
      blurb: hasRoster ? undefined : "NO SAVED HEROES YET - START A NEW GAME",
      action: () => {
        if (!hasRoster) {
          playUiSound(synth, "back");
          return;
        }
        playUiSound(synth, "confirm");
        ctx.onLoadGame();
      },
    },
    // Land back on the PLAY row in the main menu.
    backTo(ctx, "main", mainRowIndex(ctx, "play")),
  ];
}
