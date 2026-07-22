// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → the wandering merchant (stroll / the meeting —
// merchant.ts) → weapon auto-attack → abilities (orbs, storms,
// stasis) → projectiles → enemies (aggro, elite ambush/dialogue, boss guard
// AI, contact damage) → hazards (gravity wells, asteroids — hazards.ts) →
// menace decay → wave spawner (the escalating horde) →
// item pickups → locked doors → objective check → win/lose. Kill resolution,
// loot rolls, and the menace meter live in loot.ts + menace.ts; dialogue and
// door rules in story.ts. Level-ups pause the
// run in the `levelup` phase until `allocateStat` spends the point(s);
// dialogue pauses it in `dialogue` until tapped through.
//
// This module is the orchestrator; each pass lives in its own sibling module
// (one per subsystem — ./player.ts, ./weapon.ts, ./powers.ts,
// ./projectiles.ts, ./enemies.ts, ./spawner.ts, ./packs.ts, ./items.ts).

import { stepCutscene } from "@game/lib/cutscene.ts";
import { distance } from "@game/lib/vec.ts";
import { stepAutopilot } from "../autopilot.ts";
import { stepCompanions } from "../companions.ts";
import { GATES, RUN } from "../config/index.ts";
import { cutsceneDef } from "../defs/cutscenes.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { levelDef } from "../defs/levels/index.ts";
import {
  stepAsteroids,
  stepCraters,
  stepHayBalls,
  stepKnockback,
  stepSandstorms,
  stepStampedes,
  stepWells,
} from "../hazards.ts";
import { packsCleared, unspawnedMinions } from "../loot.ts";
import { revealAround } from "../map.ts";
import { menaceStage, tickMenace } from "../menace.ts";
import { stepMerchant } from "../merchant.ts";
import { advancePath } from "../path.ts";
import { stepRangedAttacks } from "../ranged.ts";
import { enqueueSpell, stepRegen, stepSpellQueue } from "../sorcery.ts";
import { stepSpawners } from "../spawners.ts";
import {
  advanceCutsceneChain,
  stepDoors,
  stepGates,
  stepOpeningStrike,
  stepSightThoughts,
} from "../story.ts";
import type { GameInput, GameState } from "../types.ts";
import { stepEnemies } from "./enemies.ts";
import { stepItems } from "./items.ts";
import { stepPacks } from "./packs.ts";
import { stepPlayer, stepUseConsumables, stepUseItem } from "./player.ts";
import {
  stepAbilities,
  stepItemSpells,
  stepMagicCritBlobs,
  stepProcs,
} from "./powers.ts";
import { stepProjectiles } from "./projectiles.ts";
import { stepSpawner } from "./spawner.ts";
import { stepWeapon } from "./weapon.ts";

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: GameInput, dtMs: number): void {
  state.events = [];
  // Remember the camera rect the app reported, so state-readers (the
  // autopilot's wall-end sense) know what the player can currently see.
  // Copied, never aliased — the app reuses its input object across frames.
  if (input.view) state.view = { ...input.view };

  // The prelude scenes run on the same clock as the sim (deterministic,
  // headless-testable); the world stays frozen until the chain plays out.
  if (state.phase === "cutscene") {
    if (state.cutscene && !state.cutscene.done) {
      stepCutscene(state.cutscene, cutsceneDef(state.cutscene.defId), dtMs);
    }
    if (!state.cutscene || state.cutscene.done) {
      advanceCutsceneChain(state);
    }
    return;
  }

  if (state.phase !== "playing") return;

  const dt = dtMs / 1000;
  state.stats.timeMs += dtMs;
  // The ding celebration: a fresh level-up burns on the hero for a beat
  // (golden pillar + fanfare) before the stat chooser pauses the run. The
  // window only ticks while `playing`, so a dialogue or pause that cuts in
  // merely postpones the chooser rather than racing it.
  if (state.levelUpFxMs > 0) {
    state.levelUpFxMs = Math.max(0, state.levelUpFxMs - dtMs);
    if (state.levelUpFxMs === 0 && state.player.pendingStatPoints > 0) {
      state.phase = "levelup";
    }
  }
  // Cool down the "bags are full" nudge so a player parked on uncarriable loot
  // gets one cue, not one per frame (see stepItems).
  if (state.bagFullHintCooldownMs > 0) {
    state.bagFullHintCooldownMs = Math.max(
      0,
      state.bagFullHintCooldownMs - dtMs,
    );
  }
  // Cool down the recurring "these enemies are pathetic" cap-farm mutter so it
  // recurs every so often on an out-levelled map, not on every kill (see
  // maybeCapThought).
  if (state.capThoughtMs > 0) {
    state.capThoughtMs = Math.max(0, state.capThoughtMs - dtMs);
  }
  // The victory quake burns down alongside the countdown that armed it (the
  // renderer jitters the camera off this — see GameState.quakeMs).
  if (state.quakeMs > 0) {
    state.quakeMs = Math.max(0, state.quakeMs - dtMs);
  }
  // The AUTO PILOT meter bills on game time — only while `playing`, so paused
  // phases, dialogues and the shop never drain the purse (see autopilot.ts).
  stepAutopilot(state, dtMs);

  // Snapshot cumulative output so the menace tick can read this step's damage
  // and kills as rates (see tickMenace) — the meter heats from what the HERO is
  // actually putting out, not from any single blow. The menace-exempt counters
  // are snapshotted alongside so non-hero output is subtracted out: neither a
  // screen-nuke/damage powerup nor a COMPANION's attacks escalate the horde.
  const damageBefore = state.stats.damageDealt;
  const killsBefore = state.stats.kills;
  const exemptDamageBefore = state.menaceExemptDamage;
  const exemptKillsBefore = state.menaceExemptKills;

  stepPlayer(state, input, dt, dtMs);
  // Mark off the intended-path waypoints the hero just reached, so the autopilot
  // and the guidance arrow both target the next leg (harmless with no path).
  advancePath(state);
  // Playing lifts the fog of war as a CIRCLE sweeping the hero's path
  // (Warcraft-style, no re-fogging): a `MAP.revealRadius` disc around him is
  // uncovered every tick, so the map (and minimap) show exactly where he has
  // walked, not the whole camera view. Everything uncovered reads fully clear
  // in the main view; only the exploration frontier stipples (see render.ts /
  // MAP.fogBand).
  revealAround(state, state.player.pos);
  // The wandering merchant strolls (and may be MET) on this tick's player
  // position — right after the hero moves, so the meeting judges what the
  // player actually sees. A scenario FREEZE (state.freeze — the developer
  // pose switch) holds the world's actors entirely: the merchant stops
  // wandering (and can't be discovered mid-pose), the horde neither moves,
  // strikes, nor fires — while the hero stays fully playable.
  if (!state.freeze) stepMerchant(state, dt, dtMs);
  // A KNOCKED-OUT hero (a sand storm downed him) can take no action: no
  // spending a held power, no potions/kits, no casting. His pools still regen
  // and his already-running powers still tick below — only the player-DRIVEN
  // passes sit out. `stepPlayer` (above) has already frozen his movement and
  // ticked the timer; the flag it reads is the same `knockoutMs`.
  const incapacitated = state.player.knockoutMs > 0;
  if (!incapacitated) {
    stepUseItem(state, input);
    stepUseConsumables(state, input);
    // A spell-bar press ENQUEUES its slot; the queue then drains one cast per
    // global cooldown while mana lasts (mana/cooldown/unlock gated in
    // sorcery.ts), so a press casts ONCE and a chain of presses fires in order
    // — never a spell held "on" until the pool empties.
    if (input.castSpell) enqueueSpell(state, input.castSpellIndex ?? 0);
    stepSpellQueue(state);
  }
  // SPIRIT-driven mana/health regen, the shield timer, and spell cooldowns all
  // tick here — every playing frame, before the combat passes read the pools.
  stepRegen(state, dt, dtMs);
  stepWeapon(state, input, dtMs);
  stepAbilities(state, dt, dtMs);
  // The forever spells worn gear grants (the `spell` affix) tick beside the
  // timed powers — same rails, no expiry.
  stepItemSpells(state, dt, dtMs);
  stepProjectiles(state, dt, dtMs);
  if (!state.freeze) {
    stepEnemies(state, dt, dtMs);
    // Shooters pull their triggers on the tick's final positions — after the
    // horde has moved, so the aim is judged on what the player actually sees.
    stepRangedAttacks(state, dtMs);
  }
  // The party acts on the tick's final enemy positions: regroup, fight,
  // soak contact blows, stand back up (see companions.ts). A freeze poses
  // the party with the rest of the world's actors.
  if (!state.freeze) stepCompanions(state, input, dt, dtMs);
  // Procs queued by this tick's combat — the hero's weapon blows (melee
  // sweep, his projectiles) AND the blows that landed ON him (contact,
  // mechanic slams, hostile shots — the "when struck" trigger) — resolve
  // HERE, after every pass that iterates the enemy list has finished: a
  // nova's kills must never splice that list out from under a sweep.
  stepProcs(state);
  // Magic crit BLOBS queued by this tick's magic crits burst here, on the same
  // rails and for the same reason as procs — after every enemy-list pass.
  stepMagicCritBlobs(state);
  // Environmental hazards act on this tick's positions, after everyone has
  // moved: the wells drag (and devour), the asteroids fly (and strike).
  stepWells(state, dt);
  stepAsteroids(state, dt, dtMs);
  stepHayBalls(state, dt, dtMs);
  stepSandstorms(state, dt, dtMs);
  stepStampedes(state, dt, dtMs);
  // Meteor-blast knockback settles after the hazards fire, so an impulse armed
  // by an impact this tick lands its first shove the same frame; a flung mob's
  // AI (moveEnemy) sat the fling out. Crater scars age down alongside.
  stepKnockback(state, dt, dtMs);
  stepCraters(state, dtMs);
  // Sight-pinned inner monologues fire on this tick's positions — after the
  // horde has moved, so "the hero sees one" means it is actually on screen.
  stepSightThoughts(state, levelDef(state.level.id).firstSightThoughts);
  // The scripted vanguard's proximity draws the blade (SpaceZ HQ's
  // `openingStrike`) — judged after the horde has moved and after the sighting
  // beat above, so the "look at this place" read always lands first.
  stepOpeningStrike(state);
  tickMenace(
    state,
    dtMs,
    state.stats.damageDealt -
      damageBefore -
      (state.menaceExemptDamage - exemptDamageBefore),
    state.stats.kills -
      killsBefore -
      (state.menaceExemptKills - exemptKillsBefore),
  );
  // The farm-proof survival clock. The wall clock (stats.timeMs, ticked at the
  // top) still runs every frame for the sub-systems; this one only advances
  // while a fight is LIVE — a foe on the field, or within the post-kill grace
  // tail (refreshed on every kill in killEnemy). A cleared field bleeds the
  // tail down and then stops the clock, so survival time can't be milked by
  // loitering. It is what the high-score board banks.
  if (state.combatGraceMs > 0) {
    state.combatGraceMs = Math.max(0, state.combatGraceMs - dtMs);
  }
  if (state.enemies.length > 0 || state.combatGraceMs > 0) {
    state.stats.combatMs += dtMs;
  }
  // The run's high-water menace, banked for the score board (read after this
  // tick's tickMenace has settled the meter).
  const stage = menaceStage(state);
  if (stage > state.stats.peakMenace) state.stats.peakMenace = stage;
  stepPacks(state);
  // The camera rect sizes the approach circle and the off-screen summon distance
  // so mobs run into view instead of popping on screen; headless callers have no
  // view and fall back to the phone baseline (see summonGeometry).
  stepSpawners(state, input.view);
  stepSpawner(state, dtMs);
  stepItems(state, dtMs);
  stepDoors(state);
  stepGates(state);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "defeat";
    state.events.push({ type: "defeat" });
    return;
  }

  // The level ends a beat after the objective clears, leaving time to grab
  // the loot. Once the player has chosen to STAY (the win already banked),
  // the countdown never re-arms — the still-cleared objective must not yank
  // the victory menu back up; the boss-corpse tap re-opens it instead.
  if (
    !state.staying &&
    state.victoryCountdownMs === null &&
    objectiveCleared(state)
  ) {
    state.victoryCountdownMs = RUN.victoryDelayMs;
    // A level with an epilogue goes out with a bang: the world quakes
    // through the whole loot-grab window, and the black-screen outro takes
    // the stage when the countdown runs out.
    if ((levelDef(state.level.id).outro?.length ?? 0) > 0) {
      state.quakeMs = RUN.victoryDelayMs;
    }
  }
  if (state.victoryCountdownMs !== null) {
    state.victoryCountdownMs -= dtMs;
    if (state.victoryCountdownMs <= 0) {
      state.victoryCountdownMs = 0;
      // The quake ends with the countdown — the black-screen outro (and the
      // splash behind it) sit on steady ground.
      state.quakeMs = 0;
      state.events.push({ type: "victory" });
      // A level that ships an outro reads its epilogue before the splash:
      // the `outro` phase mirrors the intro's black-screen pages
      // (advanceOutro turns them; past the last page comes `victory`).
      const outro = levelDef(state.level.id).outro;
      state.phase = outro && outro.length > 0 ? "outro" : "victory";
    }
  }
}

/** Has the level's objective been met? */
function objectiveCleared(state: GameState): boolean {
  const objective = levelDef(state.level.id).objective;
  if (objective.type === "reachExit") {
    // The bossless form: standing at the exit door ends the level. Deliberate
    // contact — the radius is a doorstep, not a drive-by.
    return (
      distance(state.player.pos, objective.at) <=
      (objective.radius ?? GATES.exitRadius)
    );
  }
  if (objective.type === "clearAll") {
    // Apparitions never count as foes — an unvisited (hence unvanished)
    // dialogue figure must not hold a cleared field hostage. Every placed
    // pack must also be reached and wiped: a dormant cluster is unspawned
    // foes the player still owes.
    return (
      !state.enemies.some((e) => !enemyDef(e.defId).apparition) &&
      unspawnedMinions(state) === 0 &&
      packsCleared(state)
    );
  }
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
}
