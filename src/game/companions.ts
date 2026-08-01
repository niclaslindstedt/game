// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COMPANION system: the ONE recruited ally and the SPARE-or-KILL verdict
// that creates it. A spareable unique (`EnemyDef.spareable`) beaten to 0 hp
// kneels and pauses the run in the `choice` phase (see hitEnemy in loot.ts);
// `resolveChoice` lands the player's call — KILL books the withheld blow
// through the normal kill rails, SPARE recruits the figure into the party.
// A companion follows the hero in a loose formation, fights autonomously with
// whatever is in its weapon slot (helmet and chest piece on top — never legs
// or feet), radiates its def's aura (LUCKY's +50% magic find), floats its
// kill-quote banter, and LEVELS UP on its own kills (the level/power math is
// in companion-stats.ts; the kill is credited in loot.ts on the `companionId`
// tag). Level, XP, kit and all rides the loadout between levels AND
// difficulties (see arrival.ts), so a companion levels up forever.
//
// THE PARTY IS ONE FRIEND, AND LOSING IT COSTS SOMETHING. Two rules do all
// the work, and both are the opposite of what shipped first:
//
//   • ONE (`COMPANIONS.maxParty`). Four companions is a second hero — it
//     out-damages the fight it was meant to help with, and nothing that
//     happens to any single member of it registers. Sparing a second
//     spareable RETIRES the first, D2's hire-a-new-mercenary swap.
//   • DOWN IS DOWN. At 0 hp a companion kneels with `downed` set, and NOTHING
//     in the simulation ever clears that flag — no self-revive count, no
//     out-of-combat regen, no mercy at the merchant's counter, not even the
//     walk to the next level. The player buys SMELLING SALTS from the trader
//     and breaks them over it (`spendReviveItem`), which wakes it groggy at
//     `COMPANIONS.saltsHpFraction`; the hero's own MEDKITS
//     (`healCompanionWithMedkit`) are the only thing that fills the bar back
//     up. A friend is a supply line, not a turret.
//
// Staying WITH the hero comes before clearing the horde: while he moves, a
// companion holds formation instead of peeling off after a mob (it still
// shoots one already in reach), and a companion the moving hero outruns to
// the camera's edge latches into FOLLOW mode — dropping the fight to move
// with him until he stops (config `COMPANIONS.screenEdgeMargin`).
//
// Ordering: `stepCompanions` runs right after `stepEnemies`, so the party
// acts on the tick's final enemy positions; its melee lands directly through
// `hitEnemy`, its shots ride the ordinary projectile pass (tagged with
// `companionId` for kill-quote attribution in step/).

import { clamp, direction, distance, distanceSq } from "@game/lib/vec.ts";
import {
  companionMaxHp,
  companionNovaBonusDamage,
  companionNovaRadius,
  companionProjectileBonus,
  companionXpToLevelUp,
} from "./companion-stats.ts";
import { ARMOR, COMPANIONS, MEDKIT, MELEE } from "./config/index.ts";
import { companionDef, type CompanionDef } from "./defs/companions.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { isGearDef, gearDef, weaponDef } from "./defs/equipment.ts";
import {
  armorValueOf,
  dropItem,
  isEdgedWeapon,
  weaponBurns,
  medkitTierIndex,
  meetsLevelReq,
  playerSpeed,
  qualityMult,
} from "./items/index.ts";
import { enemyKillXp, hitEnemy, killEnemy, shareXp } from "./loot.ts";
import { clearOfFog } from "./fog.ts";
import { addMapMarker } from "./map.ts";
import { heroAt, heroInPlay } from "./party.ts";
import { startJoinWords } from "./story.ts";
import { lineOfSight, resolveObstacles } from "./obstacles.ts";
import { createProjectile } from "./projectile.ts";
import type {
  Companion,
  CompanionSlot,
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Player,
} from "./types/index.ts";
import { inert, inertEnemy } from "./disposition.ts";

/** The camera rect the app hands the engine, when there is one. */
type View = NonNullable<GameInput["view"]>;

/** A companion's three equip slots, in paperdoll order. */
export const COMPANION_SLOTS: readonly CompanionSlot[] = [
  "weapon",
  "head",
  "chest",
];

/**
 * A companion's per-hit weapon damage: the weapon's catalog damage times its
 * `damagePct` affixes and make quality, held at the party damper
 * (`COMPANIONS.damageMult` — support, not a replacement hero) and grown with
 * the companion's OWN level (`COMPANIONS.damagePerLevel`). Companions carry no
 * stats of their own; the gear IS the build.
 */
export function companionWeaponDamage(companion: Companion): number {
  const weapon = companion.equipment.weapon;
  const def = weaponDef(weapon.defId);
  let multiplier = 1;
  for (const affix of weapon.affixes) {
    if (affix.kind === "damagePct") multiplier += affix.value;
  }
  const trained = 1 + COMPANIONS.damagePerLevel * (companion.level - 1);
  return (
    def.damage *
    multiplier *
    qualityMult(weapon) *
    COMPANIONS.damageMult *
    trained
  );
}

/**
 * A companion's FROST NOVA damage per caught foe: its def's base pulse damage
 * grown with the companion's OWN level exactly as its weapon is (`COMPANIONS.
 * damagePerLevel`) — but WITHOUT the weapon damper: the nova is a signature
 * power, not a spammed strike, so it lands at full authored weight. A ranked
 * power's flat `novaDamagePerRank` bite is added on top (`companion-stats.ts`).
 * 0 for a companion with no nova.
 */
export function companionNovaDamage(companion: Companion): number {
  const def = companionDef(companion.defId);
  if (!def.nova) return 0;
  const trained = 1 + COMPANIONS.damagePerLevel * (companion.level - 1);
  return (
    def.nova.damage * trained + companionNovaBonusDamage(def, companion.level)
  );
}

/** The ms between a companion's attacks — the weapon's catalog cadence exactly
 * (companions have no speed stat to quicken it). */
export function companionWeaponCooldown(companion: Companion): number {
  return weaponDef(companion.equipment.weapon.defId).cooldownMs;
}

/** The fraction of a physical blow a companion's worn armor turns — the same
 * D2 curve the hero's plating uses, over its helmet + chest points. */
export function companionArmorReduction(
  companion: Companion,
  attackerLevel: number,
): number {
  let armor = 0;
  for (const piece of [companion.equipment.head, companion.equipment.chest]) {
    if (piece) armor += armorValueOf(piece);
  }
  if (armor <= 0) return 0;
  const k = ARMOR.kBase + ARMOR.kPerLevel * Math.max(1, attackerLevel);
  return Math.min(ARMOR.maxReduction, armor / (armor + k));
}

/** The companion carrying this id, if it is in the party. */
export function companionById(
  state: GameState,
  companionId: number,
): Companion | undefined {
  return state.companions.find((c) => c.id === companionId);
}

/** Mint a companion's own signature weapon: a plain, UNBREAKABLE instance of
 * its def's `weapon` — the piece it fought the hero with, minted at his
 * level. No durability: a companion's own kit never wears out. */
function mintCompanionWeapon(state: GameState, weaponId: string): Equipment {
  return {
    id: state.nextId++,
    defId: weaponId,
    slot: "weapon",
    tier: "regular",
    ilvl: Math.max(1, state.players[0].level),
    affixes: [],
    def: structuredClone(weaponDef(weaponId)),
  };
}

/**
 * Recruit `defId` into the party at `pos`: full health at the hero's level,
 * its signature weapon in hand, helmet and chest bare (the hero dresses it
 * from his own bag — see `equipCompanionFromInventory`).
 *
 * THE PARTY IS ONE (`COMPANIONS.maxParty`), so a recruit past the cap RETIRES
 * whoever has been there longest — D2's rule that hiring a mercenary dismisses
 * the one you had. The retirement is announced (`companionDismissed`) rather
 * than done quietly: the outgoing friend may have been carrying the hero's own
 * helmet and chest piece and a dozen of its own levels, and a party that
 * silently swapped members would read as the game losing one.
 *
 * The retired companion's WORN KIT goes back to the hero's bag where there is
 * room for it — its own signature weapon stays with it (that piece was never
 * the hero's), but the armor he lent it is his.
 */
export function recruitCompanion(
  state: GameState,
  defId: string,
  pos: { x: number; y: number },
): Companion {
  while (state.companions.length >= COMPANIONS.maxParty) {
    const outgoing = state.companions.shift() as Companion;
    for (const slot of ["head", "chest"] as const) {
      const piece = outgoing.equipment[slot];
      const free = piece ? state.players[0].inventory.indexOf(null) : -1;
      if (piece && free >= 0) state.players[0].inventory[free] = piece;
    }
    state.events.push({
      type: "companionDismissed",
      defId: outgoing.defId,
      pos: { ...outgoing.pos },
    });
  }
  const def = companionDef(defId);
  // Recruited TRAINED to the hero — it joins as an equal, then earns its own
  // levels from here (its XP bar starts fresh at that level).
  const level = Math.max(1, state.players[0].level);
  const maxHp = companionMaxHp(def, level);
  const companion: Companion = {
    id: state.nextId++,
    defId,
    pos: { ...pos },
    hp: maxHp,
    maxHp,
    level,
    xp: 0,
    xpToNext: companionXpToLevelUp(level),
    faceLeft: false,
    moving: false,
    weaponCooldownMs: 0,
    quoteCooldownMs: 0,
    equipment: {
      weapon: mintCompanionWeapon(state, def.weapon),
      head: null,
      chest: null,
    },
  };
  state.companions.push(companion);
  state.events.push({ type: "companionJoined", defId, pos: { ...pos } });
  return companion;
}

/**
 * Land the SPARE-or-KILL verdict on the kneeling spareable (see
 * `EnemyDef.spareable` and the interception in hitEnemy). KILL books the
 * withheld blow through `killEnemy` — loot, last words, the lot, exactly as
 * it would have landed. SPARE takes the figure off the board alive: the
 * fight still pays its XP and pins the map, its STORY items are handed over
 * (the plot must flow), but its equipment loot stays with it — the gear is
 * the companion's kit now — and it joins the party on the spot. Safe to call
 * from the app outside `step()`, like every other phase mutator.
 *
 * THE VERDICT IS THE KILLER'S (`ChoiceState.killer` — whoever forced the
 * kneel): while that hero is in play, any other `actor` is refused, so a
 * teammate can't spend somebody else's spare. If the killer's seat has since
 * departed the choice falls open to anyone — a quitter's kneeling victim must
 * never deadlock the run. A caller that names no actor (single-player, tests)
 * is never refused, which is exactly the old behavior.
 */
export function resolveChoice(
  state: GameState,
  spare: boolean,
  actor?: Player,
): boolean {
  if (state.phase !== "choice" || !state.choice) return false;
  const choice = state.choice;
  const killer = heroAt(state, choice.killer) ?? undefined;
  if (actor && killer && killer !== actor && heroInPlay(killer)) return false;
  state.choice = null;
  state.phase = "playing";
  const enemy = state.enemies.find((e) => e.id === choice.enemyId);
  if (!enemy) return true; // already off the board — just resume
  if (!spare) {
    // The withheld blow lands as the killer's own, so the drops and XP price
    // against the hero who actually beat the figure down.
    killEnemy(state, enemy, choice.damage, choice.crit, choice.critPower, {
      attacker: killer,
    });
    return true;
  }

  const def = enemyDef(enemy.defId);
  const index = state.enemies.indexOf(enemy);
  if (index >= 0) state.enemies.splice(index, 1);
  // The fight was won either way: the map remembers it, the XP flows.
  addMapMarker(
    state,
    def.role === "boss" ? "boss" : "elite",
    enemy.pos,
    enemy.defId,
  );
  for (const storyId of def.loot?.storyItems ?? []) {
    dropItem(
      state,
      {
        id: state.nextId++,
        kind: "story",
        pos: { ...enemy.pos },
        defId: storyId,
      },
      enemy.pos,
    );
  }
  if (def.spareable) {
    recruitCompanion(state, def.spareable.companion, enemy.pos);
  }
  // A SPARED elite is a fight the party won, so its XP is shared exactly as a
  // kill's is — through the same door, gated on the same distance from the same
  // body. Paying only the person who happened to land the last blow would make
  // sparing the one won fight in the game that shuts everybody else out.
  shareXp(state, Math.round(enemyKillXp(state, def, enemy, killer)), enemy.pos);
  // The joining scene — the thanks, the life owed — takes the stage last,
  // so a level-up earned by the fight waits its turn behind it, the same
  // ordering a death gasp gets.
  if (def.spareable) startJoinWords(state, def.spareable.companion);
  return true;
}

/**
 * Float one of the companion's kill quotes, sometimes: rolled at
 * `COMPANIONS.quoteChance` per kill, throttled by `quoteCooldownMs` so the
 * banter stays banter. Called from the companion's own melee (below) and
 * from the projectile pass in step/ for its tagged shots.
 */
export function maybeCompanionQuote(
  state: GameState,
  companion: Companion,
): void {
  const def = companionDef(companion.defId);
  if (def.killQuotes.length === 0 || companion.quoteCooldownMs > 0) return;
  if (state.rng() >= COMPANIONS.quoteChance) return;
  companion.quoteCooldownMs = COMPANIONS.quoteCooldownMs;
  const text = def.killQuotes[
    Math.floor(state.rng() * def.killQuotes.length)
  ] as string;
  state.events.push({
    type: "companionQuote",
    defId: companion.defId,
    text,
    pos: { ...companion.pos },
  });
}

// ---- The per-tick companion pass ------------------------------------------------

/**
 * Advance the party one tick: keep up with the hero, pick fights inside his
 * engagement bubble when he holds still, strike/shoot on the weapon's cadence,
 * soak the horde's contact swings, and get back up from a beating. The camera
 * rect (`input.view`) drives the screen-edge FOLLOW latch. Runs right after
 * stepEnemies, so everything is judged on this tick's final positions.
 */
export function stepCompanions(
  state: GameState,
  input: GameInput,
  dt: number,
  dtMs: number,
): void {
  const count = state.companions.length;
  if (count === 0) return;
  // The engage-bubble candidates, gathered ONCE for the whole party: every
  // companion's target pick reads the same bubble around the hero, so the old
  // per-companion full-horde scans (with a def probe per mob) repeated the
  // same work `party × horde` times a tick. Enemies don't move during this
  // pass; one slain mid-pass is skipped by hp in pickTarget.
  //
  // NOTHING IN THE FOG IS IN THE BUBBLE, the same rule the hero's own weapon
  // picks through (`clearOfFog`, step/weapon.ts): the engage radius (230) reaches
  // further than the fog lifts (`MAP.revealRadius` 160), so without it the party
  // would stand beside a hero holding his fire and shoot into the blackness he
  // is refusing to. Checked last — it is the dearest of the three tests.
  engageCandidates.length = 0;
  const radiusSq = COMPANIONS.engageRadius * COMPANIONS.engageRadius;
  for (const enemy of state.enemies) {
    if (inertEnemy(enemy)) continue;
    if (distanceSq(enemy.pos, state.players[0].pos) > radiusSq) continue;
    if (!clearOfFog(state, enemy.pos)) continue;
    engageCandidates.push(enemy);
  }
  for (let i = 0; i < count; i++) {
    stepCompanion(
      state,
      state.companions[i] as Companion,
      i,
      count,
      input.view,
      dt,
      dtMs,
    );
  }
  engageCandidates.length = 0;
  separateCompanions(state);
}

// Scratch for stepCompanions' shared engage-bubble gather (valid only within
// one companions pass; cleared on exit so no stale Enemy refs linger).
const engageCandidates: Enemy[] = [];

/**
 * Is `pos` at (or past) the camera's edge — within `screenEdgeMargin` of any
 * side of the view rect? The trigger for the screen-edge FOLLOW latch: a
 * companion this far behind the moving hero is about to slide off screen.
 */
function atScreenEdge(pos: { x: number; y: number }, view: View): boolean {
  const m = COMPANIONS.screenEdgeMargin;
  return (
    pos.x <= view.x + m ||
    pos.x >= view.x + view.width - m ||
    pos.y <= view.y + m ||
    pos.y >= view.y + view.height - m
  );
}

function stepCompanion(
  state: GameState,
  companion: Companion,
  index: number,
  count: number,
  view: View | undefined,
  dt: number,
  dtMs: number,
): void {
  const def = companionDef(companion.defId);
  const player = state.players[0];
  companion.moving = false;
  companion.quoteCooldownMs = Math.max(0, companion.quoteCooldownMs - dtMs);
  companion.weaponCooldownMs = Math.max(0, companion.weaponCooldownMs - dtMs);

  // DOWN IS DOWN. A beaten companion lies where it fell and does nothing at
  // all — it neither fights, follows, regroups, nor recovers. The ONLY thing
  // that clears the flag is the player breaking SMELLING SALTS over it
  // (`spendReviveItem`), so the whole pass simply stops here.
  if (companion.downed) return;

  // Fallen far behind (a jump chase, a teleporting fight): slip through the
  // noise and rejoin — a companion is a party member, never an escort quest.
  const playerGap = distance(companion.pos, player.pos);
  if (playerGap > COMPANIONS.catchUpDistance) {
    companion.pos = { ...formationSpot(state, index, count) };
  }

  // The party's first job is to stay WITH the hero as he ranges across the
  // map, not to plant and trade shots while he walks off. A companion left at
  // the camera's edge by a moving hero latches into FOLLOW mode: it drops the
  // fight and moves with him until he stops (config `screenEdgeMargin`). The
  // moving-hero test is his realized walk this tick; a headless run with no
  // camera (`view` absent) never latches and keeps the plain formation play.
  const heroMoving = player.moving;
  if (heroMoving && view !== undefined && atScreenEdge(companion.pos, view)) {
    companion.following = true;
  } else if (!heroMoving) {
    companion.following = false;
  }

  const weapon = weaponDef(companion.equipment.weapon.defId);
  const target =
    playerGap > COMPANIONS.leashRadius || companion.following
      ? undefined
      : pickTarget(state);
  const catchUp = Math.max(def.speed, playerSpeed(state, player) * 1.1) * dt;

  if (playerGap > COMPANIONS.leashRadius || companion.following) {
    // Regroup at whatever it takes to keep up with a stat-built hero — the
    // hard leash catch-up, and the screen-edge follow that keeps the party on
    // the move at the hero's side.
    const spot = companion.following
      ? formationSpot(state, index, count)
      : player.pos;
    moveCompanion(state, companion, spot, catchUp);
  } else if (target) {
    const gap = distance(companion.pos, target.pos);
    const hold = weapon.range * COMPANIONS.holdFraction;
    // Prioritise moving with the hero over closing on the mob: only step
    // toward the target when he is stood still. While he moves, keep pace with
    // the formation instead of peeling off (a mob already in reach is still
    // shot below — the companion just never wanders after one).
    if (heroMoving) {
      const spot = formationSpot(state, index, count);
      if (distance(companion.pos, spot) > 6) {
        moveCompanion(state, companion, spot, catchUp);
      }
    } else if (gap > hold) {
      moveCompanion(state, companion, target.pos, def.speed * dt);
    }
    companion.faceLeft = target.pos.x < companion.pos.x;
    if (
      companion.weaponCooldownMs <= 0 &&
      distance(companion.pos, target.pos) <= weapon.range &&
      lineOfSight(state, companion.pos, target.pos)
    ) {
      companionAttack(state, companion, target);
    }
  } else {
    const spot = formationSpot(state, index, count);
    if (distance(companion.pos, spot) > 6) {
      moveCompanion(state, companion, spot, catchUp);
    }
  }

  // Ground rules: solid features stop companions, the level bounds hold.
  resolveObstacles(state, companion.pos, def.radius);
  companion.pos.x = clamp(
    companion.pos.x,
    def.radius,
    state.level.width - def.radius,
  );
  companion.pos.y = clamp(
    companion.pos.y,
    def.radius,
    state.level.height - def.radius,
  );

  // The FROST NOVA pulse (a `CompanionDef.nova`): an on-cadence chilling ring
  // resolved at the companion's settled position this tick. Independent of its
  // melee — it fires whenever a foe is in the blast, holding its charge
  // otherwise, so a nova companion crowd-controls even mid-regroup.
  companionNova(state, companion, def, dtMs);

  // The horde swings at whoever it touches: a companion in the pack soaks
  // contact blows on the same cooldown the hero would have. Armor (helmet +
  // chest) turns its share; at 0 hp the companion goes DOWN, never dead.
  for (const enemy of state.enemies) {
    if (enemy.contactCooldownMs > 0) continue;
    const edef = enemyDef(enemy.defId);
    if (inert(edef, enemy)) continue;
    const reach = edef.radius + def.radius;
    if (distanceSq(enemy.pos, companion.pos) > reach * reach) continue;
    enemy.contactCooldownMs = edef.contactCooldownMs;
    const raw = edef.contactDamage * (enemy.contactMult ?? 1);
    const hpDamage = Math.max(
      0,
      Math.round(raw * (1 - companionArmorReduction(companion, enemy.mlvl))),
    );
    companion.hp -= hpDamage;
    if (companion.hp <= 0) {
      companion.hp = 0;
      // DOWN, and down for good: nothing in the simulation clears this. It
      // waits where it fell for a bottle of salts (`spendReviveItem`).
      companion.downed = true;
      state.events.push({
        type: "companionDowned",
        defId: companion.defId,
        pos: { ...companion.pos },
      });
      return;
    }
  }
}

/** The nearest fightable foe inside the hero's engagement bubble — the party
 * fights around him, it never runs off to clear the map. Reads the shared
 * per-pass candidate gather (see stepCompanions); a foe a companion slew
 * earlier in the same pass is skipped by hp. */
function pickTarget(state: GameState): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const enemy of engageCandidates) {
    if (enemy.hp <= 0) continue;
    // A kneeling spareable awaiting its verdict is out of the fight.
    if (state.choice !== null && state.choice.enemyId === enemy.id) continue;
    const d = distanceSq(enemy.pos, state.players[0].pos);
    if (d < bestD) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

/** This companion's slot in the follow formation: a rank behind the hero,
 * fanned sideways so the party never stacks into one sprite. */
function formationSpot(
  state: GameState,
  index: number,
  count: number,
): { x: number; y: number } {
  const player = state.players[0];
  const facing = player.facing;
  const perp = { x: -facing.y, y: facing.x };
  const offset = (index - (count - 1) / 2) * COMPANIONS.spacing;
  return {
    x: player.pos.x - facing.x * COMPANIONS.followDistance + perp.x * offset,
    y: player.pos.y - facing.y * COMPANIONS.followDistance + perp.y * offset,
  };
}

/** Walk a companion toward `target`, updating facing and the walk flag. */
function moveCompanion(
  state: GameState,
  companion: Companion,
  target: { x: number; y: number },
  step: number,
): void {
  const gap = distance(companion.pos, target);
  if (gap <= 0.01) return;
  const t = Math.min(1, step / gap);
  const before = companion.pos;
  const next = {
    x: before.x + (target.x - before.x) * t,
    y: before.y + (target.y - before.y) * t,
  };
  if (Math.abs(target.x - before.x) > 1) {
    companion.faceLeft = target.x < before.x;
  }
  companion.pos = next;
  companion.moving = true;
}

/**
 * One attack on the weapon's cadence. Melee cleaves a small cone through the
 * pack (`COMPANIONS.meleeTargets` foes at most); anything else fires the
 * weapon's ordinary projectile volley, tagged with the companion's id so a
 * kill downstream can float its quote. Companion blows never miss and never
 * crit — no stats to roll them off — and the shared `swing`/`shot` events
 * drive the app's slashes and muzzle flashes exactly as the hero's do.
 */
function companionAttack(
  state: GameState,
  companion: Companion,
  target: Enemy,
): void {
  const weapon = weaponDef(companion.equipment.weapon.defId);
  const dir = direction(companion.pos, target.pos);
  companion.weaponCooldownMs = companionWeaponCooldown(companion);
  const damage = companionWeaponDamage(companion);

  if (!weapon.projectile) {
    const half = ((weapon.sweepDeg ?? MELEE.defaultSweepDeg) * Math.PI) / 360;
    const swingEvent = {
      type: "swing" as const,
      pos: { ...companion.pos },
      dir,
      range: weapon.range,
      arc: half * 2,
      ...(weapon.sfx ? { sfx: weapon.sfx } : {}),
      // A recruit works its signature weapon the way the weapon is worked, so
      // the motion travels off ITS def exactly as the hero's does.
      ...(weapon.motion ? { motion: weapon.motion } : {}),
      // And whether that weapon is FIRE, so a recruit handed a flamethrower
      // pours a gout of its own instead of swinging in silence.
      ...(weapon.burn ? { burn: true as const } : {}),
      // Set below once the eligible cone is gathered (uncapped count).
      targets: 0,
    };
    state.events.push(swingEvent);
    const rangeSq = weapon.range * weapon.range;
    const cosHalf = Math.cos(half);
    const eligible: { enemy: Enemy; distSq: number }[] = [];
    for (const enemy of state.enemies) {
      const edef = enemyDef(enemy.defId);
      if (inert(edef, enemy)) continue;
      if (state.choice !== null && state.choice.enemyId === enemy.id) continue;
      const dx = enemy.pos.x - companion.pos.x;
      const dy = enemy.pos.y - companion.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq) continue;
      if (distSq > edef.radius * edef.radius) {
        const dist = Math.sqrt(distSq);
        const dot = (dx * dir.x + dy * dir.y) / dist;
        if (dot < cosHalf) continue;
      }
      if (!lineOfSight(state, companion.pos, enemy.pos)) continue;
      eligible.push({ enemy, distSq });
    }
    eligible.sort((a, b) => a.distSq - b.distSq);
    swingEvent.targets = eligible.length;
    const killsBefore = state.stats.kills;
    for (let i = 0; i < eligible.length && i < COMPANIONS.meleeTargets; i++) {
      hitEnemy(
        state,
        (eligible[i] as (typeof eligible)[number]).enemy,
        damage,
        weapon.class,
        // A companion's blow is booked for the run but kept OUT of the menace
        // meter: menace answers an overpowered HERO, and a party carrying the
        // fight is not the hero being too strong (see `noMenace` in hitEnemy).
        // `companionId` credits the kill's XP to this companion (loot.ts).
        // `edged` says whether ITS signature weapon cuts — a recruit swinging a
        // blade opens a body exactly as the hero's does (items/edge.ts) — and
        // `incinerated` whether that weapon is FIRE, so a recruit handed a
        // flamethrower burns what it drops exactly as the hero does
        // (items/burn.ts). Both are the weapon's, not the wielder's.
        {
          noMenace: true,
          companionId: companion.id,
          edged: isEdgedWeapon(companion.equipment.weapon.defId),
          incinerated:
            weaponBurns(companion.equipment.weapon.defId) || undefined,
        },
      );
    }
    if (state.stats.kills > killsBefore) {
      maybeCompanionQuote(state, companion);
    }
    return;
  }

  const spec = weapon.projectile;
  // The companion's signature POWER augments the volley: extra pellets, extra
  // chain arcs, extra pierce, each growing a rank at a time as it levels
  // (`companion-stats.ts`) — a coil with no base chain still learns to arc.
  const bonus = companionProjectileBonus(
    companionDef(companion.defId),
    companion.level,
  );
  const pellets = Math.max(1, (spec.count ?? 1) + bonus.pellets);
  const pierce = (spec.pierce ?? 0) + bonus.pierce;
  const chain = (spec.chain ?? 0) + bonus.chain;
  const spread = ((spec.spreadDeg ?? 0) * Math.PI) / 180;
  for (let i = 0; i < pellets; i++) {
    const offset = pellets > 1 ? (i / (pellets - 1) - 0.5) * spread : 0;
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);
    const projectile = createProjectile({
      id: state.nextId++,
      pos: { ...companion.pos },
      dir: { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos },
      speed: spec.speed,
      radius: spec.radius,
      damage,
      lifetimeMs: spec.lifetimeMs,
      weaponClass: weapon.class,
      sprite: spec.sprite,
      companionId: companion.id,
      z: 0,
      pierceLeft: pierce > 0 ? pierce : undefined,
      homing: spec.homing || undefined,
      chain: chain > 0 ? chain : undefined,
    });
    state.projectiles.push(projectile);
  }
  state.events.push({
    type: "shot",
    weaponClass: weapon.class,
    pos: { ...companion.pos },
    dir,
    ...(weapon.sfx ? { sfx: weapon.sfx } : {}),
  });
}

/**
 * Pulse a companion's FROST NOVA (a `CompanionDef.nova`), if it is due: a
 * chilling ring bursting around the companion that damages and SLOWS every
 * non-apparition foe inside `nova.radius`. The cooldown counts down every tick
 * but the ring only fires — and only then re-arms the `everyMs` cadence —
 * when a foe is actually in reach, so the charge waits at the ready instead of
 * detonating into empty space. Each caught foe is chilled (`chillMs` /
 * `chillFactor`, read by `moveEnemy`) and struck for `companionNovaDamage`,
 * kept OUT of the menace meter like every companion blow. A downed companion
 * never reaches here (it returned at the top of the tick).
 */
function companionNova(
  state: GameState,
  companion: Companion,
  def: CompanionDef,
  dtMs: number,
): void {
  const nova = def.nova;
  if (!nova) return;
  companion.novaCooldownMs = Math.max(
    0,
    (companion.novaCooldownMs ?? 0) - dtMs,
  );
  if (companion.novaCooldownMs > 0) return;

  // The ring WIDENS as the companion ranks up (`power.novaRadiusPerRank`).
  const radius = companionNovaRadius(def, companion.level);
  const reachSq = radius * radius;
  // Snapshot the victims first — hitEnemy splices the slain from the list.
  const victims = state.enemies.filter((enemy) => {
    if (inertEnemy(enemy)) return false;
    // A kneeling spareable awaiting its verdict is out of the fight.
    if (state.choice !== null && state.choice.enemyId === enemy.id)
      return false;
    return distanceSq(enemy.pos, companion.pos) <= reachSq;
  });
  if (victims.length === 0) return; // hold the charge until a foe is in reach

  companion.novaCooldownMs = nova.everyMs;
  state.events.push({
    type: "nova",
    pos: { ...companion.pos },
    radius,
    frost: true,
  });
  const damage = companionNovaDamage(companion);
  for (const victim of victims) {
    victim.chillMs = nova.chillMs;
    victim.chillFactor = nova.chillFactor;
    // Credit a nova kill to the companion too (loot.ts reads `companionId`).
    hitEnemy(state, victim, damage, "magic", {
      noMenace: true,
      companionId: companion.id,
    });
  }
}

/** Push overlapping companions apart so the formation never stacks. The
 * party caps at a handful, so plain pairwise is fine. */
function separateCompanions(state: GameState): void {
  const companions = state.companions;
  for (let i = 0; i < companions.length; i++) {
    for (let j = i + 1; j < companions.length; j++) {
      const a = companions[i] as Companion;
      const b = companions[j] as Companion;
      const minGap =
        companionDef(a.defId).radius + companionDef(b.defId).radius;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dSq = dx * dx + dy * dy;
      if (dSq >= minGap * minGap || dSq === 0) continue;
      const d = Math.sqrt(dSq);
      const push = (minGap - d) / 2 / d;
      a.pos.x -= dx * push;
      a.pos.y -= dy * push;
      b.pos.x += dx * push;
      b.pos.y += dy * push;
    }
  }
}

// ---- Companion equipment (called by the app's UI) --------------------------------

/**
 * Equip the item in the ACTING hero's bag cell `index` onto this companion,
 * swapping whatever occupied the slot back into that cell. Companions only
 * dress in a weapon, a helmet, and a chest piece — legs, feet, charms and
 * bags are refused — and the hero's own level gates the piece exactly as it
 * gates his own hands. The bag is the actor's (a private read): a
 * joiner dressing a companion spends from their own kit, never the host's.
 */
export function equipCompanionFromInventory(
  state: GameState,
  hero: Player,
  companionId: number,
  index: number,
): boolean {
  const companion = companionById(state, companionId);
  if (!companion) return false;
  const item = hero.inventory[index];
  if (!item) return false;
  if (item.slot !== "weapon" && item.slot !== "head" && item.slot !== "chest") {
    return false;
  }
  if (!meetsLevelReq(state, hero, item)) return false;
  const slot = item.slot as CompanionSlot;
  const previous = companion.equipment[slot];
  hero.inventory[index] = previous ?? null;
  companion.equipment[slot] = item;
  if (slot === "weapon") companion.weaponCooldownMs = 0;
  return true;
}

/**
 * Move a companion's worn piece back into the ACTING hero's first free bag
 * cell. The weapon slot is never emptied — a companion always fights with
 * something — so weapons only leave via an `equipCompanionFromInventory`
 * swap.
 */
export function unequipCompanionToInventory(
  state: GameState,
  hero: Player,
  companionId: number,
  slot: CompanionSlot,
): boolean {
  if (slot === "weapon") return false;
  const companion = companionById(state, companionId);
  if (!companion) return false;
  const item = companion.equipment[slot];
  if (!item) return false;
  const free = hero.inventory.indexOf(null);
  if (free === -1) return false;
  hero.inventory[free] = item;
  companion.equipment[slot] = null;
  return true;
}

// ---- Waking and mending the fallen ------------------------------------------------
//
// The two verbs that replaced the free revive the merchant used to hand out at
// his counter. Both are things the PLAYER SPENDS: a bottle of SMELLING SALTS
// bought off the stall, and a medkit out of his own pouch. Neither is a timer
// and neither happens on its own — which is the whole point of a friend who can
// actually be lost.

/**
 * The downed companion this bag piece would WAKE — the USE-affordance probe the
 * inventory card asks per item, shaped exactly like `gateKeyTarget` beside it.
 * Non-null only when the piece is a REVIVE item (`GearDef.revive` — the
 * SMELLING SALTS, and whatever a mod authors with the same marker) and the
 * party actually holds someone face-down. Everywhere else the bottle is inert,
 * so the card offers no USE row on a run whose friend is on its feet.
 */
export function reviveTarget(
  state: GameState,
  item: Equipment,
): Companion | null {
  if (!isGearDef(item.defId) || !gearDef(item.defId).revive) return null;
  return state.companions.find((c) => c.downed) ?? null;
}

/**
 * USE a REVIVE item from bag cell `index`: the bottle is consumed and the
 * downed companion wakes at `COMPANIONS.saltsHpFraction` of its bar, back on
 * its feet AT THE HERO'S SIDE rather than wherever it happened to fall — the
 * same formation snap `catchUpDistance` already makes, and the reason a friend
 * beaten down three rooms back is not an errand to walk. Returns false (and
 * consumes nothing) when the cell holds no such piece or nobody is down, so a
 * mistap can never cost the player a bottle.
 *
 * **`hero` IS WHOSE BOTTLE IT IS, and it is a parameter rather than a lookup.**
 * A bag is PRIVATE, so the cell index only means anything against
 * the hero who sent it: this used to read `state.players[0].inventory[index]`,
 * which is a seat-0 read on a verb the command channel hands an ACTING HERO —
 * a joiner cracking a bottle would have consumed the host's cell, and the
 * simulator's own party already ran every seat's care through it.
 */
export function spendReviveItem(
  state: GameState,
  hero: Player,
  index: number,
): boolean {
  const item = hero.inventory[index] ?? null;
  if (!item) return false;
  const companion = reviveTarget(state, item);
  if (!companion) return false;
  hero.inventory[index] = null;
  const seat = state.companions.indexOf(companion);
  delete companion.downed;
  companion.hp = Math.max(
    1,
    Math.round(companion.maxHp * COMPANIONS.saltsHpFraction),
  );
  companion.pos = {
    ...formationSpot(state, Math.max(0, seat), state.companions.length),
  };
  state.events.push({
    type: "companionRevived",
    defId: companion.defId,
    pos: { ...companion.pos },
  });
  return true;
}

/**
 * Can one of the hero's medkits do this companion any good right now? The
 * affordance the HUD's party portrait reads to decide whether a press MENDS or
 * opens the equip screen — and to show the medkit badge that says which, before
 * the press rather than after it. False for a DOWNED companion: a corpse does
 * not want a bandage, it wants the salts.
 *
 * The POUCH it answers about is `hero`'s — a private read, so it is a parameter
 * (the same seat-0 correction {@link spendReviveItem} carries).
 */
export function canHealCompanion(
  state: GameState,
  hero: Player,
  companionId: number,
): number {
  const companion = companionById(state, companionId);
  if (!companion || companion.downed) return -1;
  if (companion.hp >= companion.maxHp) return -1;
  return hero.medkits.findIndex((count) => (count ?? 0) > 0);
}

/**
 * Spend ONE of the hero's medkits on the companion — the party portrait's
 * press. It mends `COMPANIONS.medkitHealFraction` of the companion's own bar
 * scaled by the kit's quality, so a LIGHT kit is a patch and a SUPERIOR one
 * nearly whole; there is no other way to heal a companion at all.
 *
 * The LIGHTEST kit in the pouch is the one spent, deliberately: the hero's own
 * emergencies want his best bandages, and a portrait tap that quietly burned a
 * SUPERIOR to top a friend up by a sliver would be a tap players learn to fear.
 * Refuses (spending nothing) on a full companion, a downed one, or an empty
 * pouch. Safe to call from the app outside `step()`.
 */
export function healCompanionWithMedkit(
  state: GameState,
  hero: Player,
  companionId: number,
): boolean {
  const tier = canHealCompanion(state, hero, companionId);
  if (tier < 0) return false;
  const companion = companionById(state, companionId) as Companion;
  const medkits = hero.medkits;
  medkits[tier] = (medkits[tier] ?? 0) - 1;
  const quality = MEDKIT.tiers[medkitTierIndex(tier)];
  const healed = Math.min(
    companion.maxHp - companion.hp,
    Math.max(
      1,
      Math.round(
        companion.maxHp *
          COMPANIONS.medkitHealFraction *
          (quality?.healPct ?? 1),
      ),
    ),
  );
  companion.hp += healed;
  state.events.push({
    type: "companionHealed",
    defId: companion.defId,
    amount: healed,
    pos: { ...companion.pos },
  });
  return true;
}

// ---- Screen toggles (called by the app's UI) -------------------------------------

/** Open a companion's equip screen for this hero. Only possible mid-run with
 * no other screen up. The focus is the OPENER's own, so two
 * heroes can tend two companions at once. */
export function openCompanionPanel(
  state: GameState,
  hero: Player,
  companionId: number,
): void {
  if (state.phase !== "playing" || hero.screen !== undefined) return;
  if (!companionById(state, companionId)) return;
  hero.companionFocus = companionId;
  hero.screen = "companion";
}

/** Close this hero's companion screen. */
export function closeCompanionPanel(hero: Player): void {
  if (hero.screen !== "companion") return;
  delete hero.companionFocus;
  delete hero.screen;
}
