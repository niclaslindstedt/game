// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The top of the menu tree: the FRONT DOOR and the EXTRAS shelf.
//
// The order and the wording live in `content/mainmenu.yaml`; what a row DOES
// lives here. The two meet on the row id, and `assembleRows` lays this build's
// rows out in the tree's order — handing back `null` for a row this build does
// not offer (no parked run, no coin store, no Workshop, nothing in the vault).
//
// WHY THE PLAY BLOCK IS FLAT. NEW GAME and LOAD GAME used to sit behind a PLAY
// submenu, which is one press between the player and the only thing they came
// for and a shape no other game has: since Doom, the front door leads with the
// play verbs themselves. Folding them up cost nothing, because the material
// that made the door long in the first place was never the play block — it was
// the badges, the boards, the buy-back and the field guide, which is exactly
// what EXTRAS is for.

import { scoresBridgeAvailable } from "../../app/scores-bridge.ts";
import { synth } from "../audio.ts";
import { hasCampaignScores } from "../highscores.ts";
import { hasArcade } from "../minigames.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";

export function buildMainMenu(ctx: MenuContext): MenuEntry[] {
  return assembleRows("main", {
    // Offered only while a run sits parked in memory. It leads when it is
    // there, so ducking out to the menu and coming back is one press on the row
    // the cursor is already on.
    resume: ctx.hasResume
      ? actionRow("main", "resume", () => {
          playUiSound(synth, "confirm");
          ctx.onResume?.();
        })
      : null,
    "new-game": actionRow("main", "new-game", () => {
      playUiSound(synth, "confirm");
      ctx.onNewGame();
    }),
    // ABSENT until there is a hero to load, rather than greyed out. A dead row
    // needs a help line to explain its grey, and a help line under a front-door
    // row is a second, longer line of text hanging off a centred column — which
    // reads as the menu being ragged rather than as the row being disabled. A
    // first launch has nothing to load and NEW GAME above says what to do, so
    // the row has nothing to add until it works.
    "load-game":
      ctx.roster.length > 0
        ? actionRow("main", "load-game", () => {
            playUiSound(synth, "confirm");
            ctx.onLoadGame();
          })
        : null,
    "how-to-play": actionRow("main", "how-to-play", () => {
      playUiSound(synth, "start");
      ctx.onHowToPlay();
    }),
    // MINIGAMES — the arcade shelf, and the game's one reward for FINISHING
    // it: a cabinet appears once a hero on this roster has beaten a whole
    // campaign. ABSENT until then, for the same reason LOAD GAME is absent
    // before there is a hero — a front-door row that opens onto an empty page
    // teaches nothing, and greying it would owe the player a line of
    // explanation that this centred column has nowhere to put. It is also the
    // better secret: a row that appears the day you win says more about the win
    // than a locked row would have said for the fifty hours before it.
    minigames: hasArcade(ctx.roster) ? navRow(ctx, "main", "minigames") : null,
    // The coin store row is meant to CATCH THE EYE: its label is struck out of
    // gold — a bevelled, glinting STORE — so the treasure row shines out of the
    // plain menu column. Native app builds only.
    store: ctx.storeOpen
      ? navRow(ctx, "main", "store", {
          color: "#ffd75e",
          shiny: true,
          before: () => ctx.setNotice(null),
        })
      : null,
    // MULTIPLAYER — Steam builds only, and with the PLAY block rather than
    // under SETTINGS: hosting a game and joining one are ways to play, not
    // preferences. Absent rather than dead everywhere else — a phone has no
    // listening socket and a browser tab is not a server.
    multiplayer: ctx.netOpen ? navRow(ctx, "main", "multiplayer") : null,
    // MODS — the player's own content, and other people's. Not shiny: the
    // store row's struck gold says "spend money here", which is exactly the
    // wrong thing to say about a free Workshop.
    mods: ctx.modsOpen ? navRow(ctx, "main", "mods") : null,
    extras: navRow(ctx, "main", "extras"),
    settings: navRow(ctx, "main", "settings"),
    // Only the desktop shell can close itself. A browser tab cannot, and a
    // phone has a home button — so on every other build the row is absent
    // rather than dead.
    quit: ctx.canQuit
      ? actionRow("main", "quit", () => {
          playUiSound(synth, "back");
          ctx.onQuit?.();
        })
      : null,
  });
}

/**
 * EXTRAS — the shelf. Everything here is something to LOOK at rather than
 * something to set, which is what makes it one screen rather than four rows on
 * the front door.
 */
export function buildExtrasMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("extras", {
      achievements: navRow(ctx, "extras", "achievements"),
      // HIGH SCORES is hardcore-only (softcore never banks a score), so the row
      // appears only once a hardcore hero has played a campaign to its end —
      // otherwise the board would be empty and the row is just noise. The
      // native app is the exception: the screen also leads to the platform's
      // WORLD RANKINGS, and those rank lifetime records (the hardest blow ever
      // landed, every foe felled, the best sustained kill rate) that any player
      // has a standing on from their first run.
      "high-scores":
        hasCampaignScores() || scoresBridgeAvailable()
          ? navRow(ctx, "extras", "high-scores")
          : null,
      // The LOST & FOUND — only once a paid AUTO PILOT ride has actually thrown
      // something away; there is nothing to buy back otherwise.
      "lost-found": ctx.hasVault ? navRow(ctx, "extras", "lost-found") : null,
      // The SCREENSHOT roll — on every build, because every build can now fill
      // it: a keyboard has the SCREENSHOT bind and a thumb has the SHUTTER on
      // the gear rail (`content/hud/elements/screenshot_slot.yaml`). It was
      // gated on `hasFinePointer` for as long as the key was the only way in,
      // which made this the one EXTRAS row whose absence was about the DEVICE
      // rather than about the player not having earned it yet.
      //
      // Not gated on the roll being non-empty, unlike the two rows above: this
      // is where the feature is EXPLAINED, and a row that only appears once you
      // have found the thing it documents is a row nobody ever sees.
      screenshots: navRow(ctx, "extras", "screenshots"),
      // Leaves the app for the static reference site. A plain navigation, not a
      // screen: the library is documents, deliberately carrying none of the
      // game's JavaScript, so it cannot be a route inside the shell.
      //
      // A REAL LINK, not a click handler that assigns `location` — see
      // `MenuEntry.href`. Both take a player to the same place; only this one is
      // followed by a crawler, and it is the site's only path from `/` into the
      // ~380 reference pages under `/library/`.
      library: {
        ...actionRow("extras", "library", () => {
          playUiSound(synth, "start");
        }),
        href: `${import.meta.env.BASE_URL}library/`,
      },
      // The chat server the players keep. An `href` like LIBRARY above, but
      // pointed OFF this origin, so the two shells hand it to the player's own
      // browser rather than steering their game window onto a web page it has
      // no chrome to leave (electron/src/main.ts's `will-navigate`,
      // native/App.tsx's `onShouldStartLoadWithRequest`).
      //
      // ABSENT when the build was given no address (see `__COMMUNITY_URL__`).
      // The invite lives in a repo variable because those links expire and get
      // spammed, so it has to be rotatable without a commit — and a build that
      // was never told where the players are has nowhere to send them. Absent
      // beats a row that leads to a dead link.
      community: __COMMUNITY_URL__
        ? {
            ...actionRow("extras", "community", () => {
              playUiSound(synth, "start");
            }),
            href: __COMMUNITY_URL__,
            external: true,
          }
        : null,
    }),
    backRow(ctx, "extras"),
  ];
}
