// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the app does with a sim tick's EVENTS once the step has landed: play
// their sounds, buzz the motor for the ones you should feel, and book them on
// the achievement ledger. Three consumers of one list, pulled out of the
// GameScreen loop so the orchestrator reads as wiring rather than rules.
//
// The event list is cleared by the NEXT step, so this runs immediately after
// `step()` — before render, before anything else can consume it.

import { localHero } from "../local-seat.ts";
import { isPartyRun, type Difficulty, type GameState } from "@game/core";

import {
  recordAchievementEvents,
  recordKillRate,
  recordWornEquipment,
} from "../achievements.ts";
import { synth } from "../audio.ts";
import { createKillRateWindow } from "../kill-rate.ts";
import {
  playDamageHaptic,
  playLevelUpHaptic,
  playLightningHaptic,
  playNukeHaptic,
} from "../haptics.ts";
import { levelUpIntensity } from "../levelup-intensity.ts";
import { playEventSounds, setListener } from "../sfx/index.ts";
import { makeWornEquipmentGate, wornEquipment } from "./run-progress.ts";

export type TickReactions = {
  /** React to the events `step()` just produced. `hpBeforeStep` is the hp the
   * hero had going in, so the damage buzz can weigh itself by the true loss. */
  consume: (hpBeforeStep: number) => void;
};

/**
 * Build the per-run event consumers. `transient` skips the achievement ledger
 * entirely — the HOW TO PLAY viewer and a session's SPECTATOR are both watching
 * rather than playing, so the trophy shelf and the lifetime totals stay the
 * player's own.
 */
export function createTickReactions(deps: {
  state: GameState;
  /** This run banks nothing: the HOW TO PLAY demo, or somebody else's session
   * being watched. */
  transient: boolean;
  difficulty: Difficulty;
  celebrateAchievements: (ids: string[]) => void;
}): TickReactions {
  const { state, transient, difficulty, celebrateAchievements } = deps;
  const wornChanged = makeWornEquipmentGate();
  // The run's rolling KILL RATE window (kill-rate.ts) — per run, because the
  // combat clock it reads is per run. Built here rather than in the ledger:
  // the window is live run state, while the ledger only keeps the high-water
  // mark it produces.
  const killRate = createKillRateWindow();
  const consume = (hpBeforeStep: number) => {
    // WHERE THIS PLAYER IS LISTENING FROM, stamped before the events are
    // sounded. The LOCAL hero's own camera, never seat 0's — a joiner hearing
    // the host's screen would have every sound panned by somebody else's
    // position. Absent on the first tick (the seat's view arrives with its
    // first input), which `place()` answers as "centred" rather than as
    // silence.
    setListener(localHero(state).view);
    playEventSounds(synth, state.events);
    // Buzz back when the hero was bitten this tick, scaled to the share of his
    // max hp the blow cost. Gated on the playerHurt event (not a bare hp drop)
    // so only real hits buzz; the magnitude is the true hp delta so a
    // shield-softened blow reads lighter than the damage the engine rolled.
    if (
      localHero(state).maxHp > 0 &&
      state.events.some((e) => e.type === "playerHurt")
    ) {
      playDamageHaptic(
        (hpBeforeStep - localHero(state).hp) / localHero(state).maxHp,
      );
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
    if (transient) return;
    // Book the tick's events on the achievement ledger (kills, loot, clears,
    // …) and celebrate whatever unlocked — the toast + chime, sized a notch
    // below the ding and the unique card.
    celebrateAchievements(
      recordAchievementEvents(state.events, {
        levelId: state.level.id,
        difficulty,
        stats: state.stats,
        // A PARTY KILL COUNTS FOR EVERYONE PRESENT — so the badges book a
        // co-op run exactly as they book a solo one — but nothing it produces
        // may reach a ranking (docs/multiplayer.md). The ledger keeps both,
        // off this one
        // flag; see `LifetimeTotals.solo`.
        party: isPartyRun(state),
      }),
    );
    // …and the hero's outfit for the wardrobe feats. The identity gate checks
    // every frame (equips made while a panel freezes the sim are still caught —
    // the loop keeps running under paused phases) but the report itself only
    // runs on the ticks where the worn set actually changed.
    if (wornChanged(state)) {
      celebrateAchievements(recordWornEquipment(wornEquipment(state)));
    }
    // …and the SUSTAINED kill rate (the leaderboard metric). Booked every tick
    // — including the ones with no kills, since the window's clock advances
    // whether or not anything died, and a lull is exactly what a sustained
    // rate has to survive. The window reports 0 until it has ten minutes of
    // combat clock behind it, and the ledger keeps only the high-water mark.
    let killsThisTick = 0;
    for (const event of state.events) {
      if (event.type === "enemyKilled") killsThisTick++;
    }
    recordKillRate(
      killRate.note(state.stats.combatMs, killsThisTick),
      isPartyRun(state),
    );
  };
  return { consume };
}
