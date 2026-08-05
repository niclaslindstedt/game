// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → the wandering merchant (stroll / the meeting —
// merchant.ts) → weapon auto-attack → abilities (orbs, storms,
// stasis) → the campaign powers (wake, barrage, wells, waves, volleys,
// turrets — ./powerups.ts) → projectiles → enemies (aggro, elite ambush/dialogue, boss guard
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

import { stepAutopilot } from "../autopilot.ts";
import { stepBossDeath } from "../boss-death.ts";
import { enterDeathScene, stepDeathScene } from "../death-scene.ts";
import { downHero, stepCorpseRecovery } from "../downed.ts";
import { stepElevators } from "../elevator.ts";
import { stepLairs } from "../lairs.ts";
import { stepCompanions } from "../companions.ts";
import { GATES, RUN } from "../config/index.ts";
import { cutsceneDef } from "../defs/cutscenes.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import {
  stepAsteroids,
  stepCraters,
  stepHayBalls,
  stepKnockback,
  stepBaits,
  stepSandstorms,
  stepScorches,
  stepStampedes,
  stepWells,
} from "../hazards.ts";
import { packsCleared, unspawnedMinions } from "../loot.ts";
import { revealAround } from "../fog.ts";
import {
  anyHeroWithin,
  heroInPlay,
  partyBlocked,
  partyWiped,
} from "../party.ts";
import { menaceStage, tickMenace } from "../menace.ts";
import { stepMerchant } from "../merchant.ts";
import { stepVehicles } from "../vehicles.ts";
import { advancePath } from "../path.ts";
import { stepQuests } from "../quests/index.ts";
import { stepRangedAttacks } from "../ranged.ts";
import { stepTimers } from "../timers.ts";
import { stepTradeRequests } from "../trade.ts";
import { stepSpawners } from "../spawners.ts";
import {
  advanceCutsceneChain,
  stepDoors,
  stepGates,
  stepOpeningStrike,
  stepPlaceThoughts,
  stepSightThoughts,
} from "../story.ts";
import type { GameInput, GameState, Player, ViewRect } from "../types/index.ts";
import { stepEnemies } from "./enemies.ts";
import { stepItems } from "./items.ts";
import { stepPacks } from "./packs.ts";
import { stepPlayer, stepUseConsumables, stepUseItem } from "./player.ts";
import {
  stepAbilities,
  stepItemSpells,
  stepMagicCritBlobs,
  stepProcs,
  stepReflectedDamage,
} from "./powers.ts";
import { stepPowerups } from "./powerups.ts";
import { stepProjectiles } from "./projectiles.ts";
import { stepSpawner } from "./spawner.ts";
import { stepWeapon } from "./weapon.ts";
import { inertEnemy } from "../disposition.ts";

/**
 * ONE TICK'S INTENT — either one hero's, or the whole party's by SEAT.
 *
 * A plain `GameInput` is the single-player (and every headless caller's) shape
 * and means seat 0; an ARRAY is index-aligned with `state.players`, so seat 3's
 * steering is `input[3]`. The two are told apart by `Array.isArray`, which is
 * exact — a `GameInput` is never an array — so no caller had to change when the
 * party arrived.
 *
 * A seat with no frame this tick contributes `IDLE_INPUT`: a hero standing
 * still, which is what a player with a screen open or a dropped packet gives.
 * It is deliberately NOT "keep last tick's input": a lost frame would otherwise
 * leave a hero walking into the horde until the next one arrived.
 */
export type PartyInput = GameInput | readonly GameInput[];

/**
 * What a seat contributes when nobody is steering it.
 *
 * Frozen, and never handed to a pass that writes input (nothing does — the
 * edges are cleared by the CALLER, on its own copy), so one shared object
 * serves every idle seat without allocating per tick.
 */
export const IDLE_INPUT: GameInput = Object.freeze({
  steering: false,
  target: Object.freeze({ x: 0, y: 0 }),
  jump: false,
  useItem: false,
}) as GameInput;

/** This seat's intent for the tick. */
function inputFor(input: PartyInput, seat: number): GameInput {
  if (!Array.isArray(input))
    return seat === 0 ? (input as GameInput) : IDLE_INPUT;
  return (input as readonly GameInput[])[seat] ?? IDLE_INPUT;
}

/**
 * Take a copy of a reported camera rect INTO the slot that already holds one,
 * minting a rect only the first time. The app hands the same mutable input
 * object back every frame, so the rect has to be copied rather than aliased —
 * but it is four numbers arriving sixty times a second per seat, and spreading
 * a fresh object each time is allocation for nothing.
 */
function copyView(into: ViewRect | undefined, from: ViewRect): ViewRect {
  const slot = into ?? { x: 0, y: 0, width: 0, height: 0 };
  slot.x = from.x;
  slot.y = from.y;
  slot.width = from.width;
  slot.height = from.height;
  return slot;
}

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: PartyInput, dtMs: number): void {
  state.events = [];
  // THE VIEW IS SEAT 0's, and it is the one place the party model keeps a
  // single answer to a per-client question. Eight clients have eight cameras;
  // what reads `state.view` is the summon geometry (mobs must run in from off
  // screen) and the autopilot's wall-end sense, and both want "a screenful",
  // not a specific screen. The passes that genuinely care WHOSE screen — every
  // pick the game aims on a hero's behalf — read that hero's own `Player.view`
  // instead, stamped in the seat loop below and asked through `sight.ts`.
  // Copied, never aliased — the app reuses its input object across frames —
  // and copied FIELDWISE, because a fresh rect per tick is 60 objects a second
  // of pure garbage for four numbers that never change shape.
  const hostInput = inputFor(input, 0);
  if (hostInput.view) state.view = copyView(state.view, hostInput.view);

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

  // The DEATH SCENE runs on its own reduced pass ahead of the `playing` gate:
  // the horde rings the fallen hero and clouds roll in for a beat before the
  // modal (see death-scene.ts). Its own `defeat` transition ends it.
  if (state.phase === "dying") {
    stepDeathScene(state, dtMs);
    return;
  }

  // The BOSS DEATH RITE — the scripted send-off over a felled boss
  // (boss-death.ts). Sits beside the death scene for the same reason: it is a
  // REDUCED pass rather than a halted one (the horde is choreographed, the hero
  // is moved, the clock runs), so it has to be stepped ahead of the `playing`
  // gate below rather than be caught by it.
  if (state.phase === "bossDeath") {
    stepBossDeath(state, dtMs);
    return;
  }

  if (state.phase !== "playing") return;

  // THE PARTY'S OWN FREEZE. The screens are
  // per-player — a hero in their bag stands on the field, steers nothing, and
  // can still be killed — so the world only halts when EVERY hero in play has
  // one up. With one hero that is exactly the freeze the bag, the map and the
  // pause menu always were; with eight it is "everybody stepped out at once".
  // A departed or downed hero's abandoned screen holds nothing shut, which is
  // the structural version of the fix `releaseStuckLevelup` used to bolt on.
  if (partyBlocked(state)) return;

  const dt = dtMs / 1000;
  state.stats.timeMs += dtMs;
  // A standing TRADE REQUEST that nobody answered lapses (trade.ts rule 5).
  // Straight after the clock it ages on, and free of charge without requests —
  // which is every single-player run.
  stepTradeRequests(state);
  // The ding celebration: a fresh level-up burns on the hero for a beat
  // (golden pillar + fanfare). The points BANK (`Player.pendingStatPoints`)
  // rather than forcing the chooser open — the chooser is a non-blocking
  // screen the player opens when they want (`promptPendingPoints`), and the
  // HUD shows a pip while points wait.
  if (state.levelUpFxMs > 0) {
    state.levelUpFxMs = Math.max(0, state.levelUpFxMs - dtMs);
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

  // ── THE PARTY'S OWN TICK ────────────────────────────────────────────────
  //
  // Every pass in this block is about ONE hero, so it runs once per SEAT with
  // that seat's own intent. The order WITHIN a hero is the order it always was
  // — steer, then act, then fight — and the order BETWEEN heroes is seat order,
  // which is what keeps the simulation deterministic with eight of them: two
  // heroes reaching the same dropped item on the same tick must resolve the
  // same way on every machine, and seat order is the only tiebreak that
  // survives the wire.
  //
  // A DOWNED hero is skipped whole. Nothing of his ticks — he is not steering,
  // shooting, casting or picking anything up — but he is still on the field and
  // still in `state.players`, because the horde walking over a corpse is what
  // makes a party death mean something (downed.ts owns the corpse and the
  // respawn; it waits on the per-player `dying` screen).
  //
  // A DEPARTED hero is skipped for the same reason and a different one: nobody
  // is behind him at all (`Player.departed`), so a body that kept regenerating,
  // kept its powers running and kept lifting the fog would be a ghost player
  // still contributing to a run he left.
  for (let seat = 0; seat < state.players.length; seat++) {
    const player = state.players[seat] as Player;
    if (!heroInPlay(player)) continue;
    // WHAT THIS HERO CAN SEE, onto the hero — from the SEAT's own input, and
    // ahead of both the ride and the screen substitutions below, because
    // neither takes the camera away: a hero at the wheel is being driven across
    // a field he is watching, and a bag held open still has the field behind
    // it. Everything that aims for him reads it back through `sight.ts`.
    const reported = inputFor(input, seat).view;
    if (reported) player.view = copyView(player.view, reported);
    // A hero AT THE WHEEL rides instead of walking: his body travels with
    // the car (so the camera, the fog sweep and everything party-geometric
    // follow the drive), and every on-foot pass sits out — his held pointer
    // is steering the CAR this tick (stepVehicles reads it), not him.
    const ride = state.vehicles.find(
      (v) => v.kind === "car" && v.driver === seat,
    );
    if (ride) {
      player.pos.x = ride.pos.x;
      player.pos.y = ride.pos.y;
      revealAround(state, player.pos);
      continue;
    }
    // A hero with a SCREEN up steers nothing: their pointer is on
    // a menu, not the field. Everything else about them still ticks — the
    // weapon auto-fires at whatever comes close (the character acts
    // autonomously; standing in the horde with the bag open is survivable,
    // not safe), regen runs, and the horde still reaches them.
    const seatInput =
      player.screen === undefined ? inputFor(input, seat) : IDLE_INPUT;
    stepPlayer(state, player, seatInput, dt, dtMs);
    // Playing lifts the fog of war as a CIRCLE sweeping the hero's path
    // (Warcraft-style, no re-fogging): a `MAP.revealRadius` disc around him is
    // uncovered every tick, so the map (and minimap) show exactly where he has
    // walked, not the whole camera view. Everything uncovered reads fully clear
    // in the main view; only the exploration frontier stipples (see render.ts /
    // MAP.fogBand).
    //
    // THE FOG IS SHARED — one grid on the run, lifted by whoever walks. The
    // party is meant to explore together, and per-player fog would cost a grid
    // and a minimap per player for something Diablo 2 never had.
    revealAround(state, player.pos);
    // A KNOCKED-OUT hero (a sand storm downed him) can take no action: no
    // spending a held power, no potions/kits. His health still regens and his
    // already-running powers still tick below — only the player-DRIVEN passes
    // sit out. `stepPlayer` (above) has already frozen his movement and ticked
    // the timer; the flag it reads is the same `knockoutMs`.
    if (player.knockoutMs <= 0) {
      stepUseItem(state, player, seatInput);
      stepUseConsumables(state, player, seatInput);
    }
    // The talent timers (Frost Nova's cooldown, Evasion's speed-burst) tick
    // here — every playing frame, before the combat passes read them.
    stepTimers(state, player, dtMs);
    stepWeapon(state, player, seatInput, dtMs);
    stepAbilities(state, player, dt, dtMs);
    // The powers the later maps introduce (the wake, the barrage, the wells,
    // the wave, the volleys, the gun grid) tick on the same frame as the
    // classics — see ./powerups.ts. The purely passive ones (barrier, ward,
    // phase, surge) have no tick: they are read where they bite.
    stepPowerups(state, player, dt, dtMs);
    // The forever spells worn gear grants (the `spell` affix) tick beside the
    // timed powers — same rails, no expiry.
    stepItemSpells(state, player, dt, dtMs);
  }
  // Mark off the intended-path waypoints the hero just reached, so the autopilot
  // and the guidance arrow both target the next leg (harmless with no path).
  advancePath(state);
  // The wandering merchant strolls (and may be MET) on this tick's player
  // position — right after the hero moves, so the meeting judges what the
  // player actually sees. A scenario FREEZE (state.freeze — the developer
  // pose switch) holds the world's actors entirely: the merchant stops
  // wandering (and can't be discovered mid-pose), the horde neither moves,
  // strikes, nor fires — while the hero stays fully playable.
  if (!state.freeze) stepMerchant(state, dt, dtMs);
  // The machines: the car's springs settle, its wheels roll from its speed,
  // and a seated driver's held pointer steers it (the garage drive-out). A
  // no-op loop on every map without a vehicle.
  if (!state.freeze) {
    stepVehicles(state, dtMs, (seat) => inputFor(input, seat));
  }
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
  if (!state.freeze) stepCompanions(state, hostInput, dt, dtMs);
  // Procs queued by this tick's combat — the hero's weapon blows (melee
  // sweep, his projectiles) AND the blows that landed ON him (contact,
  // mechanic slams, hostile shots — the "when struck" trigger) — resolve
  // HERE, after every pass that iterates the enemy list has finished: a
  // nova's kills must never splice that list out from under a sweep.
  stepProcs(state);
  // Magic crit BLOBS queued by this tick's magic crits burst here, on the same
  // rails and for the same reason as procs — after every enemy-list pass.
  stepMagicCritBlobs(state);
  // ARCANE RETRIBUTION reflects queued by the blows that landed on the hero
  // this tick pay back here, on the same rails and for the same reason.
  stepReflectedDamage(state);
  // Environmental hazards act on this tick's positions, after everyone has
  // moved: the wells drag (and devour), the asteroids fly (and strike).
  stepWells(state, dt);
  stepAsteroids(state, dt, dtMs);
  stepHayBalls(state, dt, dtMs);
  stepSandstorms(state, dt, dtMs);
  stepStampedes(state, dt, dtMs);
  // Burning floor a boss's beam laid — a hazard the FIGHT brings, not the map.
  stepScorches(state, dtMs);
  // BAIT a boss threw down — armed, aged, and set off by a hero who went for it.
  stepBaits(state, dtMs);
  // Meteor-blast knockback settles after the hazards fire, so an impulse armed
  // by an impact this tick lands its first shove the same frame; a flung mob's
  // AI (moveEnemy) sat the fling out. Crater scars age down alongside.
  stepKnockback(state, dt, dtMs);
  stepCraters(state, dtMs);
  // Sight-pinned inner monologues fire on this tick's positions — after the
  // horde has moved, so "the hero sees one" means it is actually on screen.
  stepSightThoughts(state, runLevelDef(state).firstSightThoughts);
  // The venue's PLACE-pinned beats — the hub's "take the car to GOODCO", and
  // its "you are walking out of here" when he leaves the bay on foot instead.
  // Behind the sightings so a map that pins both lets the monster have the first
  // word, and gated on `playing` by the phase check at the top of this step, so
  // neither ever lands over the doorstep intro or the prelude.
  stepPlaceThoughts(state, runLevelDef(state).placeThoughts);
  // The scripted vanguard's proximity draws the blade (GOODCO HQ's
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
  stepSpawners(state, hostInput.view);
  stepSpawner(state, dtMs);
  stepItems(state, dtMs);
  stepDoors(state);
  // A house the hero has walked up to opens and its occupant comes out to greet
  // him (lairs.ts) — a proximity pass, like the packs above it.
  stepLairs(state);
  // The lift rides LAST of the movement-shaped passes and before the objective
  // check, so a hero the car sets down beside an exit clears the level on the
  // same frame he arrives rather than a tick later.
  stepElevators(state, dtMs);
  stepGates(state);
  // THE ERRAND-GIVERS RUN LAST OF THE SCENE-RAISING PASSES, and the order is
  // load-bearing rather than tidy. A quest conversation takes the stage by
  // setting `phase = "quest"`; every other pass that can raise a scene in the
  // same tick — a sight-pinned thought (`stepSightThoughts`), the opening
  // strike, a lair's occupant coming out — takes it by setting
  // `phase = "dialogue"`. Whichever runs LAST wins, and when the thought won it
  // left `questOffer` set behind a `dialogue` the player then tapped away: the
  // offer never appeared, and the giver was left mid-conversation for the rest
  // of the run. Running last means a scene raised this tick is already on the
  // phase, so the conversation politely waits for the next approach instead.
  // (The reverse cannot happen: a run frozen in `quest` is not stepped at all.)
  //
  // The escorts and the map pins ride along here for free — later still means
  // they judge the tick's FINAL positions, which is what they wanted anyway.
  // A scenario FREEZE holds the whole pass, like the merchant's stroll.
  if (!state.freeze) stepQuests(state, dt, dtMs);

  // THE RUN ENDS WHEN THE PARTY FALLS, NOT WHEN A HERO DOES — and a hero who
  // falls while the party still stands goes DOWN instead (downed.ts): a
  // corpse holding their kit, their own XP toll, and the `respawn` verb back.
  // The sweep runs AFTER every damage pass so it judges the tick's final hp,
  // and only when the party is NOT wiped — the wipe path below owns that case
  // whole, which is exactly what keeps solo byte-identical: one hero at 0 hp
  // is `partyWiped` on the same tick it always was, and no corpse is minted.
  if (!partyWiped(state)) {
    for (const hero of state.players) {
      if (hero.hp <= 0 && !hero.downed && !hero.departed) {
        downHero(state, hero);
      }
    }
    // The walk back: an owner standing on their own corpse takes their gear
    // back. Free when there are no corpses, which is every solo run.
    stepCorpseRecovery(state);
  }

  // In single player this fires on the same tick it always did — one hero
  // down IS the party down.
  if (partyWiped(state)) {
    // The party fell: drop into the DEATH SCENE (the dramatic tableau — the
    // horde rings the corpse, clouds roll in) rather than straight to the
    // modal. It books the DEATH TOLL (the `deathXpLoss` XP forfeit) and emits
    // `playerDeath` now; the `defeat` event that raises the splash fires when
    // the scene times out (see death-scene.ts).
    enterDeathScene(state);
    return;
  }

  // The level ends a beat after the objective clears, leaving time to grab
  // the loot. Once the player has chosen to STAY (the win already banked),
  // the countdown never re-arms — the still-cleared objective must not yank
  // the victory menu back up; the boss-corpse tap re-opens it instead.
  // The `playing` gate at the top of this function passed BEFORE the combat
  // passes ran, so a boss felled this very tick has already flipped the phase
  // to `bossDeath` underneath us. Without this guard the countdown arms and the
  // outro's quake starts UNDERNEATH the finisher — the five-second loot window
  // running out while the player is still watching the blow land.
  if (
    state.phase === "playing" &&
    !state.staying &&
    state.victoryCountdownMs === null &&
    objectiveCleared(state)
  ) {
    state.victoryCountdownMs = RUN.victoryDelayMs;
    // A level with an epilogue goes out with a bang: the world quakes
    // through the whole loot-grab window, and the black-screen outro takes
    // the stage when the countdown runs out.
    if ((runLevelDef(state).outro?.length ?? 0) > 0) {
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
      // (advanceOutro turns them; past the last page comes `victory`). A
      // DIALOGUE-muted run skips the epilogue the same way it skips the intro
      // monologue — straight to the victory splash.
      const outro = runLevelDef(state).outro;
      state.phase =
        !state.dialogueMuted && outro && outro.length > 0 ? "outro" : "victory";
    }
  }
}

/** Has the level's objective been met? */
function objectiveCleared(state: GameState): boolean {
  const objective = runLevelDef(state).objective;
  // A HUB never clears: no victory, no outro, no bank — the run ends only by
  // leaving through a door. Checked FIRST because the last return below is
  // the killBoss fallthrough, and a hub with no boss on the board would
  // otherwise read as "cleared" on tick one and end the run in the one place
  // the player is meant to idle.
  if (objective.type === "hub") return false;
  if (objective.type === "reachExit") {
    // The bossless form: standing at the exit door ends the level. Deliberate
    // contact — the radius is a doorstep, not a drive-by.
    // ANY hero on the doorstep clears it — a party does not have to file
    // through the exit one at a time to finish a mission together.
    return anyHeroWithin(
      state,
      objective.at,
      objective.radius ?? GATES.exitRadius,
    );
  }
  if (objective.type === "clearAll") {
    // Apparitions never count as foes — an unvisited (hence unvanished)
    // dialogue figure must not hold a cleared field hostage. Every placed
    // pack must also be reached and wiped: a dormant cluster is unspawned
    // foes the player still owes.
    return (
      !state.enemies.some((e) => !inertEnemy(e)) &&
      unspawnedMinions(state) === 0 &&
      packsCleared(state)
    );
  }
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
}
