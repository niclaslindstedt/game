// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARCADE SHELF — the MINIGAMES screen: the cabinets a beaten campaign has
// earned, and the rung they are played on.
//
// The cabinets come from the catalog (`minigames.ts`), so they are concatenated
// AHEAD of the screen's one authored row — a screen opened to play something
// opens with the cursor already on the thing to play. The DIFFICULTY row is an
// adjustment to the next go rather than a destination, so it sits under them.
//
// A CABINET'S OWN KNOB TRAVELS WITH IT. Which way the road is driven is the
// ROAD's setting and nothing else's, so the row that picks it is built from the
// catalog beside its cabinet and drawn directly under it — labelled out of the
// def (`variantLabel`), and absent entirely on a machine with one way to play.
// The rung is the only thing on this screen that means the same on every
// machine, which is why it is the only knob left at the foot of the shelf.
//
// THE DEVELOPER TREE HAS THE SAME SHELF WITH ITS LOCK OFF (DEVELOPER →
// PLAYGROUND → MINIGAMES): every cabinet, every rung, no campaign to beat
// first. It is the SAME builder rather than a second screen that looks like
// this one — the player's gate is the only difference, so it is the only thing
// the flag changes, and everything else judged there is what ships.
//
// STARTUP PATH: nothing here may reach `@game/core`. A minigame is STARTED by
// handing its id up to the app (`ctx.onMinigame`), which mounts the lazy screen
// that owns the simulation — the same rule every other play verb on this menu
// follows.

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
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

/** The player's shelf: what a beaten campaign earned. */
export function buildMinigamesMenu(ctx: MenuContext): MenuEntry[] {
  // THE RUNGS ARE THE CAMPAIGN'S, not the ladder's: only a difficulty this
  // roster has beaten the whole game on is offered, which is the same key that
  // put the shelf on the front door in the first place.
  return shelf(ctx, "minigames", arcadeRungs(ctx.roster));
}

/** The developer's: every cabinet, on every rung. */
export function buildDevMinigamesMenu(ctx: MenuContext): MenuEntry[] {
  return shelf(ctx, "devminigames", [...DIFFICULTY_ORDER]);
}

function shelf(
  ctx: MenuContext,
  screen: MenuScreen,
  rungs: Difficulty[],
): MenuEntry[] {
  // `pickRung` is what the row SHOWS and what a press plays, so a saved pick
  // that is not on offer here (a deleted hero, a settings blob from another
  // install, a rung set on the developer shelf) can never launch a lap nobody
  // earned — it falls back to the easiest rung this shelf has.
  const rung = pickRung(rungs, getSettings().minigameDifficulty);
  // …AND WHICH WAY. One pick for the whole shelf, exactly as the rung is, with
  // each cabinet resolving it against its own list on the way in
  // (`pickVariant`) — so a machine that has never heard of the saved pick plays
  // its own default instead of refusing to start.
  const picked = getSettings().minigameVariant;
  return [
    ...MINIGAME_ORDER.flatMap((id) => {
      const def = minigameDef(id);
      const variant = pickVariant(def, picked);
      const cabinet = {
        label: def.name,
        aria: rowAria(screen, id),
        color: "#7ef0c8",
        action: () => {
          // Unreachable from the player's shelf — the whole screen is behind a
          // beaten campaign — but a cabinet with no rung to play must buzz
          // rather than launch a lap on a rung nobody chose.
          if (!rung || !variant) {
            playUiSound(synth, "back");
            return;
          }
          playUiSound(synth, "start");
          ctx.onMinigame(id, rung, variant.id);
        },
      } satisfies MenuEntry;
      // ONE WAY TO PLAY IS NO CHOICE, and here the row is ABSENT rather than
      // greyed: a grey DIFFICULTY says "beat the campaign higher up and this
      // opens", and there is no such sentence for a machine that goes one
      // place. Nothing is being withheld, so nothing owes an explanation.
      if (def.variants.length < 2) return [cabinet];
      return [cabinet, variantRow(ctx, screen, id)];
    }),
    ...assembleRows(screen, {
      difficulty: {
        ...actionRow(
          screen,
          "difficulty",
          () => {
            // ONE RUNG EARNED IS NO CHOICE AT ALL. The row still says which one
            // the road will be driven at, and pressing it buzzes rather than
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
    }),
    backRow(ctx, screen),
  ];
}

/**
 * A cabinet's own knob: which of ITS ways the next lap is played, cycled by
 * pressing the row. Only built for a machine with more than one.
 *
 * Not an authored row — it belongs to a cabinet rather than to the screen, so
 * its label comes from the def and it is laid out beside the cabinet rather
 * than through `assembleRows`. The value carries no `color:`, for the reason the
 * rung's row has none: a row's colour here is the colour it LIGHTS UP in, and
 * the highlight's amber belongs to the selection rather than to what the
 * selection is set to.
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
    aria: rowAria(screen, `${id}-variant`),
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
