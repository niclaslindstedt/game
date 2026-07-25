// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the app does with a sim tick's EVENTS once the step has landed: play
// their sounds, buzz the motor for the ones you should feel, and book them on
// the achievement ledger. Three consumers of one list, pulled out of the
// GameScreen loop so the orchestrator reads as wiring rather than rules.
//
// The event list is cleared by the NEXT step, so this runs immediately after
// `step()` — before render, before anything else can consume it.

import type { Difficulty, GameState } from "@game/core";

import {
  recordAchievementEvents,
  recordWornEquipment,
} from "../achievements.ts";
import { synth } from "../audio.ts";
import {
  playDamageHaptic,
  playLevelUpHaptic,
  playLightningHaptic,
  playNukeHaptic,
} from "../haptics.ts";
import { levelUpIntensity } from "../levelup-intensity.ts";
import { playEventSounds } from "../sfx/index.ts";
import { makeWornEquipmentGate, wornEquipment } from "./run-progress.ts";

export type TickReactions = {
  /** React to the events `step()` just produced. `hpBeforeStep` is the hp the
   * hero had going in, so the damage buzz can weigh itself by the true loss. */
  consume: (hpBeforeStep: number) => void;
};

/**
 * Build the per-run event consumers. `demo` skips the achievement ledger
 * entirely — the HOW TO PLAY viewer is watching, not playing, so the trophy
 * shelf stays the player's.
 */
export function createTickReactions(deps: {
  state: GameState;
  demo: boolean;
  difficulty: Difficulty;
  celebrateAchievements: (ids: string[]) => void;
}): TickReactions {
  const { state, demo, difficulty, celebrateAchievements } = deps;
  const wornChanged = makeWornEquipmentGate();
  const consume = (hpBeforeStep: number) => {
    playEventSounds(synth, state.events);
    // Buzz back when the hero was bitten this tick, scaled to the share of his
    // max hp the blow cost. Gated on the playerHurt event (not a bare hp drop)
    // so only real hits buzz; the magnitude is the true hp delta so a
    // shield-softened blow reads lighter than the damage the engine rolled.
    if (
      state.player.maxHp > 0 &&
      state.events.some((e) => e.type === "playerHurt")
    ) {
      playDamageHaptic((hpBeforeStep - state.player.hp) / state.player.maxHp);
    }
    // Feel the field FX too: a nuke HAMMERS the motor (once, even if it clears
    // a crowd), and a lightning strike flicks it — paired with the camera kick
    // and the crack/boom SFX. Kills stay silent (a busy field would drone), so
    // these are the only field events that buzz.
    if (state.events.some((e) => e.type === "nuke")) {
      playNukeHaptic();
    } else if (state.events.some((e) => e.type === "levelUp")) {
      // The ding's light explosion HAMMERS the motor — a heavy jolt then a
      // celebratory roll, paired with the flash and the fanfare. A tier under
      // the nuke at a full-strength ding; weighed down with the light for the
      // early ones, so a level-2 ding taps rather than pounds.
      const ding = state.events.find((e) => e.type === "levelUp");
      playLevelUpHaptic(
        levelUpIntensity(ding?.type === "levelUp" ? ding.level : 2),
      );
    } else if (state.events.some((e) => e.type === "lightning")) {
      playLightningHaptic();
    }
    if (demo) return;
    // Book the tick's events on the achievement ledger (kills, loot, clears,
    // …) and celebrate whatever unlocked — the toast + chime, sized a notch
    // below the ding and the unique card.
    celebrateAchievements(
      recordAchievementEvents(state.events, {
        levelId: state.level.id,
        difficulty,
        stats: state.stats,
      }),
    );
    // …and the hero's outfit for the wardrobe feats. The identity gate checks
    // every frame (equips made while a panel freezes the sim are still caught —
    // the loop keeps running under paused phases) but the report itself only
    // runs on the ticks where the worn set actually changed.
    if (wornChanged(state)) {
      celebrateAchievements(recordWornEquipment(wornEquipment(state)));
    }
  };
  return { consume };
}
