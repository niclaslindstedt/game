// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARCADE — two screens, and the split between them is the whole design.
//
// THE SHELF (`minigames`) is nothing but cabinets. Every row comes from the
// catalog (`minigames.ts`), so a third machine appears by being added there and
// owes `content/mainmenu.yaml` nothing. No knob stands here: a knob at the foot
// of a shelf reads as a knob every machine answers to, and the two on offer do
// not even share a vocabulary — the road picks a DIRECTION, the ship picks a
// MISSION.
//
// THE CABINET (`minigame`) is one machine and the terms the next lap is played
// on: PLAY, that machine's own way-to-play row, and the rung. WHICH machine is
// a MODE rather than a place (`MenuContext.cabinet`), for the reason the
// developer WARP is one — the tree cannot carry a screen per catalog row.
//
// PLAY LEADS on it, because it is what the screen was opened for. Both knobs
// are remembered, so the common visit is a press and out; a player who wants to
// change something walks down to it.
//
// THE DEVELOPER TREE HAS BOTH SCREENS WITH THE LOCK OFF (DEVELOPER →
// PLAYGROUND → MINIGAMES): every cabinet, every rung, no campaign to beat
// first. The SAME builders rather than screens that look like these — the
// player's gate is the only difference, so it is the only thing the flag
// changes, and everything else judged there is what ships.
//
// STARTUP PATH: nothing here may reach `@game/core`. A minigame is STARTED by
// handing its id up to the app (`ctx.onMinigame`), which mounts the lazy screen
// that owns the simulation — the same rule every other play verb on this menu
// follows. THE PAGE GOES UP WITH IT, because the app cannot infer which of the
// two it was: the lap comes back to the cabinet it was launched from, and the
// player's cabinet would offer a developer lap rungs nobody has earned.

import { DIFFICULTY_ORDER, difficultyDef, type Difficulty } from "@game/menu";

import { synth } from "../audio.ts";
import {
  arcadeRungs,
  minigameDef,
  pickRung,
  pickVariant,
  MINIGAME_ORDER,
  type MinigameId,
} from "../minigames.ts";
import { getSettings, updateSettings } from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  type CabinetScreen,
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

/** The player's shelf. */
export function buildMinigamesMenu(ctx: MenuContext): MenuEntry[] {
  return shelf(ctx, "minigames", "minigame");
}

/** The developer's — same cabinets, no campaign to beat first. */
export function buildDevMinigamesMenu(ctx: MenuContext): MenuEntry[] {
  return shelf(ctx, "devminigames", "devminigame");
}

/** One cabinet's page, on the rungs a beaten campaign earned. */
export function buildMinigameMenu(
  ctx: MenuContext,
  id: MinigameId,
): MenuEntry[] {
  // THE RUNGS ARE THE CAMPAIGN'S, not the ladder's: only a difficulty this
  // roster has beaten the whole game on is offered, which is the same key that
  // put the shelf on the front door in the first place.
  return cabinet(ctx, "minigame", id, arcadeRungs(ctx.roster));
}

/** …and on every rung there is. */
export function buildDevMinigameMenu(
  ctx: MenuContext,
  id: MinigameId,
): MenuEntry[] {
  return cabinet(ctx, "devminigame", id, [...DIFFICULTY_ORDER]);
}

function shelf(
  ctx: MenuContext,
  screen: MenuScreen,
  into: CabinetScreen,
): MenuEntry[] {
  return [
    ...MINIGAME_ORDER.map((id): MenuEntry => ({
      label: minigameDef(id).name,
      aria: rowAria(screen, id),
      color: "#7ef0c8",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setCabinet(id);
        ctx.setScreen(into);
        ctx.setCursor(0);
      },
    })),
    backRow(ctx, screen),
  ];
}

function cabinet(
  ctx: MenuContext,
  screen: CabinetScreen,
  id: MinigameId,
  rungs: Difficulty[],
): MenuEntry[] {
  const def = minigameDef(id);
  // `pickRung` is what the row SHOWS and what a press plays, so a saved pick
  // that is not on offer here (a deleted hero, a settings blob from another
  // install, a rung set on the developer shelf) can never launch a lap nobody
  // earned — it falls back to the easiest rung this shelf has.
  const rung = pickRung(rungs, getSettings().minigameDifficulty);
  // …AND WHICH WAY. One pick for the whole arcade, exactly as the rung is, with
  // each cabinet resolving it against its own list on the way in
  // (`pickVariant`) — so a machine that has never heard of the saved pick plays
  // its own default instead of refusing to start.
  const variant = pickVariant(def, getSettings().minigameVariant);
  const authored = assembleRows(screen, {
    play: actionRow(screen, "play", () => {
      // Unreachable from the player's arcade — the whole tree is behind a
      // beaten campaign — but a cabinet with no rung to play must buzz
      // rather than launch a lap on a rung nobody chose.
      if (!rung || !variant) {
        playUiSound(synth, "back");
        return;
      }
      playUiSound(synth, "start");
      // THIS PAGE travels with the press, so the lap comes back to the cabinet
      // it was started from. A developer lap landing on the player's cabinet is
      // a page offering rungs nobody earned: DIFFICULTY reads "-" and PLAY only
      // buzzes.
      ctx.onMinigame(id, rung, variant.id, screen);
    }),
    difficulty: {
      ...actionRow(
        screen,
        "difficulty",
        () => {
          // ONE RUNG EARNED IS NO CHOICE AT ALL. The row still says which one
          // the lap will be played at, and pressing it buzzes rather than
          // pretending to cycle. Greyed rather than hidden, because the grey
          // is the thing it says: beat the campaign again, higher up, and
          // this opens.
          if (!rung || rungs.length < 2) {
            playUiSound(synth, "back");
            return;
          }
          playUiSound(synth, "confirm");
          const next = rungs[(rungs.indexOf(rung) + 1) % rungs.length]!;
          updateSettings({ minigameDifficulty: next });
          ctx.bumpSettings();
        },
        { locked: rungs.length < 2 },
      ),
      // The rung's NAME as the row's value, and no `color:` with it: a row's
      // colour here is the colour it LIGHTS UP in, and the highlight's amber
      // belongs to the selection rather than to what the selection is set to.
      value: rung ? difficultyDef(rung).name : "-",
    },
  });
  // ONE WAY TO PLAY IS NO CHOICE, and the row is ABSENT rather than greyed: a
  // grey DIFFICULTY says "beat the campaign higher up and this opens", and
  // there is no such sentence for a machine that goes one place. Nothing is
  // being withheld, so nothing owes an explanation.
  const knob = def.variants.length < 2 ? [] : [variantRow(ctx, screen, id)];
  // It lands BETWEEN the two authored rows, and the seam is found by ROW ID
  // rather than counted: PLAY is what the screen was opened for and leads, and
  // the rung is the one setting on the page that is not this machine's own, so
  // it goes last.
  const at = authored.findIndex(
    (row) => row.aria === rowAria(screen, "difficulty"),
  );
  return [
    ...authored.slice(0, at),
    ...knob,
    ...authored.slice(at),
    backRow(ctx, screen, MINIGAME_ORDER.indexOf(id)),
  ];
}

/**
 * A cabinet's own knob: which of ITS ways the next lap is played, cycled by
 * pressing the row. Only built for a machine with more than one.
 *
 * Not an authored row — it belongs to the CABINET rather than to the screen, so
 * its label comes from the def and the screen's own rows say nothing about it.
 * The value carries no `color:`, for the reason the rung's row has none: a
 * row's colour here is the colour it LIGHTS UP in, and the highlight's amber
 * belongs to the selection rather than to what the selection is set to.
 */
function variantRow(
  ctx: MenuContext,
  screen: MenuScreen,
  id: MinigameId,
): MenuEntry {
  const def = minigameDef(id);
  const picked = pickVariant(def, getSettings().minigameVariant);
  return {
    label: def.variantLabel,
    aria: rowAria(screen, "variant"),
    value: picked?.name ?? "-",
    action: () => {
      playUiSound(synth, "confirm");
      const at = def.variants.findIndex((v) => v.id === picked?.id);
      const next = def.variants[(at + 1) % def.variants.length]!;
      updateSettings({ minigameVariant: next.id });
      ctx.bumpSettings();
    },
  };
}
