// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The top of the menu tree: the MAIN menu (RESUME / PLAY / HIGH SCORES /
// ACHIEVEMENTS / SETTINGS / HOW TO PLAY / STORE) and the PLAY submenu
// (NEW GAME / LOAD GAME).

import { synth } from "../audio.ts";
import { hasCampaignScores } from "../highscores.ts";
import { playUiSound } from "../sfx/index.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";

export function buildMainMenu(ctx: MenuContext): MenuEntry[] {
  return [
    // Offered only when a run is parked in memory; sits at the top so it's
    // the default highlight when the player ducked out to the menu.
    ...(ctx.onResume
      ? [
          {
            label: "RESUME",
            aria: "resume",
            action: () => {
              playUiSound(synth, "confirm");
              ctx.onResume?.();
            },
          },
        ]
      : []),
    {
      // PLAY is a menu now, not a launch: it opens the NEW GAME / LOAD GAME
      // submenu (picking a hero was the old PLAY's job — the two paths make
      // that choice explicit).
      label: "PLAY",
      aria: "play",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("play");
        ctx.setCursor(0);
      },
    },
    // HIGH SCORES is hardcore-only (softcore never banks a score), so the
    // row appears only once a hardcore hero has played a campaign to its
    // end — otherwise the board would be empty and the row is just noise.
    ...(hasCampaignScores()
      ? [
          {
            label: "HIGH SCORES",
            aria: "high-scores",
            action: () => {
              playUiSound(synth, "confirm");
              ctx.setScreen("scores");
              ctx.setCursor(0);
            },
          },
        ]
      : []),
    {
      label: "ACHIEVEMENTS",
      aria: "achievements",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("achievements");
      },
    },
    {
      label: "SETTINGS",
      aria: "settings",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("settings");
        ctx.setCursor(0);
      },
    },
    {
      label: "HOW TO PLAY",
      aria: "how-to-play",
      action: () => {
        playUiSound(synth, "start");
        ctx.onHowToPlay();
      },
    },
    // The coin store — native app builds only (purchases need the
    // platform store). This one row is meant to CATCH THE EYE: it wears the
    // shiny treatment (a gold specular glint sweeping across the label, a
    // soft amber glow) and a spinning coin emblem, so the treasure row glints
    // out of the plain menu column instead of sitting there unnoticed.
    ...(ctx.storeOpen
      ? [
          {
            label: "STORE",
            aria: "store",
            color: "#ffd75e",
            shiny: true,
            coinTier: 3,
            blurb: "COINS FOR YOUR HEROES",
            action: () => {
              playUiSound(synth, "confirm");
              ctx.setNotice(null);
              ctx.setScreen("store");
              ctx.setCursor(0);
            },
          },
        ]
      : []),
  ];
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
      blurb: "CREATE A NEW HERO",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.onNewGame();
      },
    },
    {
      label: "LOAD GAME",
      aria: "load-game",
      // Greyed and inert with an empty roster — there is no saved hero to
      // load, so mint one via NEW GAME first (mirrors a locked level row).
      color: hasRoster ? undefined : "#5a6068",
      locked: !hasRoster,
      blurb: hasRoster
        ? "PLAY ON WITH A SAVED HERO - OR RETIRE ONE"
        : "NO SAVED HEROES YET - START A NEW GAME",
      action: () => {
        if (!hasRoster) {
          playUiSound(synth, "back");
          return;
        }
        playUiSound(synth, "confirm");
        ctx.onLoadGame();
      },
    },
    // Land back on the PLAY row in the main menu (one lower when RESUME
    // tops the menu).
    backTo(ctx, "main", ctx.hasResume ? 1 : 0),
  ];
}
