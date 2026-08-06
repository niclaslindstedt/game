// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PER-PLAYER DEATH — what a hero falling means while the party still stands.
// Diablo 2's shape, deliberately: the fallen hero
// leaves a BODY where they fell holding what they were wearing, pays their own
// DEATH TOLL, and respawns at the level's start at full health — the walk back
// is the price and recovering the corpse is the errand. One player's death is
// a setback the rest fight through, never the end of anybody else's game.
//
// **SOLO IS UNTOUCHED, STRUCTURALLY.** One hero at 0 hp IS the party wiped, so
// the step pipeline's wipe check (`partyWiped` → `enterDeathScene`) fires on
// the same tick it always has and the down sweep below never runs — no corpse,
// no per-hero toll, no respawn. Every rule in this module is an exact no-op at
// one hero, which is the property demanded of every co-op rule before it
// shipped.
//
// Three moments, three functions:
//
//   `downHero`          the fall — the step pipeline's sweep calls it for a
//                       hero at 0 hp while the party still stands.
//   `respawnHero`       the way back — a run COMMAND (`respawn`), the player's
//                       own call, never automatic.
//   `stepCorpseRecovery` the walk back — the owner standing on their body
//                       takes their gear back, piece by piece.
//
// And one seam: `foldCorpseGear` gives `extractLoadout` whatever a corpse
// still holds when the run banks, so an unrecovered body can never cost a
// player their kit — the same promise D2 keeps by restoring a corpse on the
// next game.

import { distanceSq } from "@game/lib/vec.ts";

import { CORPSE } from "./config/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { bareHands, isBareHands, isTwoHandedWeapon } from "./items/hands.ts";
import { EQUIP_SLOTS } from "./items/slots.ts";
import { applyHeroDeathToll } from "./loot.ts";
import { heroInPlay, seatOf } from "./party.ts";
import { endTradesFor } from "./trade.ts";
import type {
  Equipment,
  EquipSlot,
  GameState,
  Player,
  PlayerCorpse,
} from "./types/index.ts";

/**
 * The fall: a hero hit 0 hp while the party still stands.
 *
 * Called from the step pipeline's down sweep — after every damage pass, and
 * only when `partyWiped` is false (the wipe path owns the other case). Books
 * the hero's own DEATH TOLL now (the wipe toll later skips a hero already
 * `downed`, so a fall is never billed twice), strips the worn kit onto a
 * corpse at their feet, and leaves the body lying: `heroInPlay` reads false
 * off `hp <= 0`, so the world already stopped answering for them — not
 * chased, not counted, not stepped — exactly as a departed seat is treated.
 *
 * The weapon slot honours its never-empty contract: the real weapon goes to
 * the corpse and the hero is left with his bare hands, which is also what he
 * respawns with.
 */
export function downHero(state: GameState, hero: Player): void {
  const seat = seatOf(state, hero);
  hero.hp = 0;
  hero.downed = true;
  hero.moving = false;
  hero.hurtFlashMs = 0;
  // A body holds no screen open and blocks nobody's world — and the player
  // behind it is looking at the downed overlay now, not at their bag.
  hero.screen = undefined;
  hero.companionFocus = undefined;
  // A trade this hero was in ends with them — nothing has moved yet, so
  // nothing is undone, but a table whose other side is a corpse can never
  // settle (same rule a departure applies).
  endTradesFor(state, seat);
  const xpLost = applyHeroDeathToll(state, hero);
  const equipment = hero.equipment;
  const gear: PlayerCorpse["gear"] = [];
  // The hand first and by name, because its slot is typed never-empty: the
  // real weapon goes to the corpse and the hero is left with his hands. A hero
  // who was ALREADY bare-handed leaves no weapon behind — the empty hand is not
  // a possession, so a corpse carrying one would let a recovery hand him back
  // the nothing he was holding (and, with a full bag, fail the recovery over
  // it).
  if (!isBareHands(equipment.weapon)) {
    gear.push({ slot: "weapon", item: equipment.weapon });
    equipment.weapon = bareHands(state);
    hero.weaponCooldownMs = 0;
  }
  for (const slot of EQUIP_SLOTS) {
    if (slot === "weapon") continue;
    const piece = equipment[slot];
    if (!piece) continue;
    gear.push({ slot, item: piece });
    equipment[slot] = null;
  }
  state.corpses.push({
    id: state.nextId++,
    seat,
    pos: { x: hero.pos.x, y: hero.pos.y },
    gear,
  });
  state.events.push({
    type: "heroDown",
    seat,
    pos: { x: hero.pos.x, y: hero.pos.y },
    xpLost,
  });
}

/**
 * The way back: stand a downed hero up at the level's start, at full health.
 *
 * A run COMMAND (`respawn`) rather than a timer, because when to come back is
 * the player's own call — instantly into the walk back, or after their bag of
 * crisps. Refused (false) for anybody not actually down: a standing hero, a
 * departed seat, a run not `playing` (the wipe already owns the ending).
 *
 * Full health and the authored spawn are both deliberate: the toll was paid at
 * the fall, so the respawn itself costs nothing but the walk — D2's rule, and
 * the reason dying in a party stings without ever stalling the group.
 */
export function respawnHero(state: GameState, hero: Player): boolean {
  if (state.phase !== "playing") return false;
  if (!hero.downed || hero.departed) return false;
  const spawn = runLevelDef(state).playerSpawn;
  hero.pos = { x: spawn.x, y: spawn.y };
  hero.z = 0;
  hero.vz = 0;
  hero.vel = { x: 0, y: 0 };
  hero.hp = hero.maxHp;
  hero.stamina = hero.maxStamina;
  hero.downed = false;
  hero.knockoutMs = 0;
  hero.knockMs = 0;
  hero.knockVel = { x: 0, y: 0 };
  hero.hurtFlashMs = 0;
  // NO EVENT, deliberately: a verb runs BETWEEN ticks, and the next `step()`
  // replaces `state.events` before the session collects them — an event pushed
  // here reaches nobody (the engine's standing rule: only trust events pushed
  // inside step). The respawn's own cue IS the state: the hero stands at the
  // spawn at full health with `downed` cleared, which is what the party HUD
  // and every client read; the respawning player's app cues its own button.
  return true;
}

/**
 * The walk back: an owner standing on their own corpse takes their gear back.
 *
 * OWNER ONLY — that is the whole promise, and it is enforceable
 * precisely because recovery is engine code the server runs: another hero
 * standing on the body all day takes nothing. Each piece goes back where it
 * came off when the slot is free (the respawned hero's empty hands give way to
 * the real weapon, and are never banked — they are not a possession),
 * and to a free bag cell when it is not; a piece with nowhere to go STAYS on
 * the corpse, so a full bag loses nothing — the body simply keeps holding it.
 * The corpse leaves the field only when it has been emptied.
 *
 * Runs every tick from the step pipeline and costs nothing without corpses,
 * which is every solo run there is.
 */
export function stepCorpseRecovery(state: GameState): void {
  if (state.corpses.length === 0) return;
  const reachSq = CORPSE.recoverRadius * CORPSE.recoverRadius;
  state.corpses = state.corpses.filter((corpse) => {
    const owner = state.players[corpse.seat];
    if (!owner || !heroInPlay(owner)) return true;
    if (distanceSq(owner.pos, corpse.pos) > reachSq) return true;
    corpse.gear = corpse.gear.filter(
      (entry) => !takeBack(owner, entry.slot, entry.item),
    );
    if (corpse.gear.length > 0) return true;
    state.events.push({
      type: "corpseRecovered",
      seat: corpse.seat,
      pos: { ...corpse.pos },
    });
    return false;
  });
}

/** Put one recovered piece back on its owner. True when it found a home. */
function takeBack(owner: Player, slot: EquipSlot, item: Equipment): boolean {
  const worn = owner.equipment[slot];
  if (slot === "weapon") {
    // The hand is never empty, so "free" here means "holding nothing but his
    // hands" — swap the real weapon back in over them. A two-hander waits for
    // the second arm to be clear, like any equip.
    if (
      worn &&
      isBareHands(worn) &&
      !(isTwoHandedWeapon(item) && owner.equipment.offhand)
    ) {
      owner.equipment.weapon = item;
      owner.weaponCooldownMs = 0;
      return true;
    }
  } else if (
    !worn &&
    !(slot === "offhand" && isTwoHandedWeapon(owner.equipment.weapon))
  ) {
    owner.equipment[slot] = item as never;
    return true;
  }
  const free = owner.inventory.indexOf(null);
  if (free < 0) return false;
  owner.inventory[free] = item;
  return true;
}

/**
 * What a hero's unrecovered corpses still hold, for the run's banking
 * (`extractLoadout`): the pieces are folded into the loadout's VAULT — the
 * LOST & FOUND, whose whole purpose is holding gear the player did not choose
 * to lose — so walking out of a level over your own body never costs the kit.
 * The corpse itself is left standing; the run it stands in is ending or being
 * left, and the loadout is the thing that survives.
 */
export function foldCorpseGear(state: GameState, hero: Player): Equipment[] {
  if (state.corpses.length === 0) return [];
  const seat = seatOf(state, hero);
  const held: Equipment[] = [];
  for (const corpse of state.corpses) {
    if (corpse.seat !== seat) continue;
    for (const entry of corpse.gear) held.push(entry.item);
  }
  return held;
}
