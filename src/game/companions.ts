// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COMPANION system: recruited allies and the SPARE-or-KILL verdict that
// creates them. A spareable unique (`EnemyDef.spareable`) beaten to 0 hp
// kneels and pauses the run in the `choice` phase (see hitEnemy in loot.ts);
// `resolveChoice` lands the player's call — KILL books the withheld blow
// through the normal kill rails, SPARE recruits the figure into the party.
// Companions follow the hero in a loose formation, fight autonomously with
// whatever is in their weapon slot (helmet and chest piece on top — never
// legs or feet), radiate their def's aura (LUCKY's +50% magic find), float
// their kill-quote banter, and go DOWN instead of dying — a beaten companion
// kneels out of the fight. It stands back up on its own ONCE THE FIELD IS
// CLEAR (a foe beside it freezes the count, `COMPANIONS.downedCombatRadius`),
// so one downed in a swarm stays down until the hero speaks to a merchant
// (`reviveDownedCompanions`, wired from merchant.ts) — which works in hardcore
// too. Companions also LEVEL UP on their own kills (their level/power math is
// in companion-stats.ts; the kill is credited in loot.ts on the `companionId`
// tag), and the party — level, XP, kit and all — rides the loadout between
// levels AND difficulties (see arrival.ts), so a companion levels up forever.
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
import { ARMOR, COMPANIONS, MELEE, WEAPON } from "./config/index.ts";
import { companionDef, type CompanionDef } from "./defs/companions.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import {
  armorValueOf,
  meetsLevelReq,
  playerSpeed,
  qualityMult,
} from "./items.ts";
import { enemyKillXp, grantXp, hitEnemy, killEnemy } from "./loot.ts";
import { addMapMarker } from "./map.ts";
import { startJoinWords } from "./story.ts";
import { lineOfSight, resolveObstacles } from "./obstacles.ts";
import type {
  Companion,
  CompanionSlot,
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Projectile,
} from "./types.ts";

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

/** The ms between a companion's attacks — the catalog cadence at the global
 * baseline (companions have no speed stat to quicken it). */
export function companionWeaponCooldown(companion: Companion): number {
  return (
    weaponDef(companion.equipment.weapon.defId).cooldownMs *
    WEAPON.baseCooldownMult
  );
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
    ilvl: Math.max(1, state.player.level),
    affixes: [],
    def: structuredClone(weaponDef(weaponId)),
  };
}

/**
 * Recruit `defId` into the party at `pos`: full health at the hero's level,
 * its signature weapon in hand, helmet and chest bare (the hero dresses it
 * from his own bag — see `equipCompanionFromInventory`).
 */
export function recruitCompanion(
  state: GameState,
  defId: string,
  pos: { x: number; y: number },
): Companion {
  const def = companionDef(defId);
  // Recruited TRAINED to the hero — it joins as an equal, then earns its own
  // levels from here (its XP bar starts fresh at that level).
  const level = Math.max(1, state.player.level);
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
 */
export function resolveChoice(state: GameState, spare: boolean): boolean {
  if (state.phase !== "choice" || !state.choice) return false;
  const choice = state.choice;
  state.choice = null;
  state.phase = "playing";
  const enemy = state.enemies.find((e) => e.id === choice.enemyId);
  if (!enemy) return true; // already off the board — just resume
  if (!spare) {
    killEnemy(state, enemy, choice.damage, choice.crit, choice.critPower);
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
    state.items.push({
      id: state.nextId++,
      kind: "story",
      pos: { ...enemy.pos },
      defId: storyId,
    });
  }
  if (def.spareable) {
    recruitCompanion(state, def.spareable.companion, enemy.pos);
  }
  grantXp(state, Math.round(enemyKillXp(state, def, enemy)));
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
  separateCompanions(state);
}

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
  const player = state.player;
  companion.moving = false;
  companion.quoteCooldownMs = Math.max(0, companion.quoteCooldownMs - dtMs);
  companion.weaponCooldownMs = Math.max(0, companion.weaponCooldownMs - dtMs);
  companion.combatMs = Math.max(0, (companion.combatMs ?? 0) - dtMs);

  // Downed: kneel out the count, then stand back up on your own — but the
  // count only ticks while the field around IT is clear. Beaten down in the
  // middle of a swarm, a companion STAYS down until the area empties or the
  // hero speaks to a merchant (`reviveDownedCompanions`); a clean scrap still
  // lets it pop back up on its own once the mob is dead.
  if (companion.downedMs !== undefined) {
    if (!foeNear(state, companion.pos, COMPANIONS.downedCombatRadius)) {
      companion.downedMs = Math.max(0, companion.downedMs - dtMs);
    }
    if (companion.downedMs > 0) return;
    delete companion.downedMs;
    companion.hp = Math.max(
      1,
      Math.round(companion.maxHp * COMPANIONS.reviveHpFraction),
    );
    state.events.push({
      type: "companionRevived",
      defId: companion.defId,
      pos: { ...companion.pos },
    });
  }

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
  const catchUp = Math.max(def.speed, playerSpeed(state) * 1.1) * dt;

  if (playerGap > COMPANIONS.leashRadius || companion.following) {
    // Regroup at whatever it takes to keep up with a stat-built hero — the
    // hard leash catch-up, and the screen-edge follow that keeps the party on
    // the move at the hero's side.
    const spot = companion.following
      ? formationSpot(state, index, count)
      : player.pos;
    moveCompanion(state, companion, spot, catchUp);
  } else if (target) {
    // A foe in the hero's engage bubble means the party is fighting — hold
    // off regen until the field is quiet again.
    companion.combatMs = COMPANIONS.regenCalmMs;
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
    if (edef.apparition) continue;
    const reach = edef.radius + def.radius;
    if (distanceSq(enemy.pos, companion.pos) > reach * reach) continue;
    enemy.contactCooldownMs = edef.contactCooldownMs;
    // A blow lands the party in the fight — reset the calm timer either way,
    // even if armor turned it to nothing.
    companion.combatMs = COMPANIONS.regenCalmMs;
    const raw = edef.contactDamage * (enemy.contactMult ?? 1);
    const hpDamage = Math.max(
      0,
      Math.round(raw * (1 - companionArmorReduction(companion, enemy.mlvl))),
    );
    companion.hp -= hpDamage;
    if (companion.hp <= 0) {
      companion.hp = 0;
      companion.downedMs = COMPANIONS.reviveMs;
      state.events.push({
        type: "companionDowned",
        defId: companion.defId,
        pos: { ...companion.pos },
      });
      return;
    }
  }

  // Out of combat (no live target, no blow taken for `regenCalmMs`): knit the
  // party back up at `regenPerSec` of the bar each second, so a hurt companion
  // recovers between fights instead of limping the rest of the level. A downed
  // one never reaches here — it returned at the top of the tick.
  if (companion.combatMs === 0 && companion.hp < companion.maxHp) {
    companion.hp = Math.min(
      companion.maxHp,
      companion.hp + companion.maxHp * COMPANIONS.regenPerSec * dt,
    );
  }
}

/** Is any live (non-apparition) foe within `radius` of `pos`? The
 * downed-companion revive gate reads it around the fallen companion: a foe this
 * close keeps it pinned down. */
function foeNear(
  state: GameState,
  pos: { x: number; y: number },
  radius: number,
): boolean {
  const rSq = radius * radius;
  return state.enemies.some(
    (e) => !enemyDef(e.defId).apparition && distanceSq(e.pos, pos) <= rSq,
  );
}

/** The nearest fightable foe inside the hero's engagement bubble — the party
 * fights around him, it never runs off to clear the map. */
function pickTarget(state: GameState): Enemy | undefined {
  const radiusSq = COMPANIONS.engageRadius * COMPANIONS.engageRadius;
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    // A kneeling spareable awaiting its verdict is out of the fight.
    if (state.choice !== null && state.choice.enemyId === enemy.id) continue;
    if (distanceSq(enemy.pos, state.player.pos) > radiusSq) continue;
    const d = distanceSq(enemy.pos, state.player.pos);
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
  const player = state.player;
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
      // Set below once the eligible cone is gathered (uncapped count).
      targets: 0,
    };
    state.events.push(swingEvent);
    const rangeSq = weapon.range * weapon.range;
    const cosHalf = Math.cos(half);
    const eligible: { enemy: Enemy; distSq: number }[] = [];
    for (const enemy of state.enemies) {
      const edef = enemyDef(enemy.defId);
      if (edef.apparition) continue;
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
        { noMenace: true, companionId: companion.id },
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
    const projectile: Projectile = {
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
    };
    if (pierce > 0) projectile.pierceLeft = pierce;
    if (spec.homing) projectile.homing = spec.homing;
    if (chain > 0) projectile.chain = chain;
    state.projectiles.push(projectile);
  }
  state.events.push({
    type: "shot",
    weaponClass: weapon.class,
    pos: { ...companion.pos },
    dir,
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
    if (enemyDef(enemy.defId).apparition) return false;
    // A kneeling spareable awaiting its verdict is out of the fight.
    if (state.choice !== null && state.choice.enemyId === enemy.id)
      return false;
    return distanceSq(enemy.pos, companion.pos) <= reachSq;
  });
  if (victims.length === 0) return; // hold the charge until a foe is in reach

  companion.novaCooldownMs = nova.everyMs;
  // A pulse is combat: hold off out-of-combat regen the same as a swing does.
  companion.combatMs = COMPANIONS.regenCalmMs;
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
 * Equip the item in the hero's bag cell `index` onto this companion,
 * swapping whatever occupied the slot back into that cell. Companions only
 * dress in a weapon, a helmet, and a chest piece — legs, feet, charms and
 * bags are refused — and the hero's own level gates the piece exactly as it
 * gates his own hands.
 */
export function equipCompanionFromInventory(
  state: GameState,
  companionId: number,
  index: number,
): boolean {
  const companion = companionById(state, companionId);
  if (!companion) return false;
  const item = state.player.inventory[index];
  if (!item) return false;
  if (item.slot !== "weapon" && item.slot !== "head" && item.slot !== "chest") {
    return false;
  }
  if (!meetsLevelReq(state, item)) return false;
  const slot = item.slot as CompanionSlot;
  const previous = companion.equipment[slot];
  state.player.inventory[index] = previous ?? null;
  companion.equipment[slot] = item;
  if (slot === "weapon") companion.weaponCooldownMs = 0;
  return true;
}

/**
 * Move a companion's worn piece back into the hero's first free bag cell.
 * The weapon slot is never emptied — a companion always fights with
 * something — so weapons only leave via an `equipCompanionFromInventory`
 * swap.
 */
export function unequipCompanionToInventory(
  state: GameState,
  companionId: number,
  slot: CompanionSlot,
): boolean {
  if (slot === "weapon") return false;
  const companion = companionById(state, companionId);
  if (!companion) return false;
  const item = companion.equipment[slot];
  if (!item) return false;
  const free = state.player.inventory.indexOf(null);
  if (free === -1) return false;
  state.player.inventory[free] = item;
  companion.equipment[slot] = null;
  return true;
}

// ---- Merchant revival --------------------------------------------------------------

/**
 * Stand the whole party back up and mend it — the WANDERING MERCHANT's mercy,
 * paid the moment the hero speaks to him (see `merchant.ts`). Every DOWNED
 * companion returns to its feet at FULL health (a beaten one that stayed down
 * through a long fight is brought back), and every hurt-but-standing companion
 * is topped off too. Emits a `companionRevived` per companion stood up so the
 * app can float the cue. Works no matter the mode — hardcore heroes get their
 * party back from the counter exactly like softcore ones. Returns how many were
 * revived/mended (0 if the party is already whole), so the app can stay quiet
 * when nothing changed. Safe to call from the app outside `step()`.
 */
export function reviveDownedCompanions(state: GameState): number {
  let touched = 0;
  for (const companion of state.companions) {
    const wasDown = companion.downedMs !== undefined;
    const hurt = companion.hp < companion.maxHp;
    if (!wasDown && !hurt) continue;
    delete companion.downedMs;
    companion.hp = companion.maxHp;
    touched++;
    if (wasDown) {
      state.events.push({
        type: "companionRevived",
        defId: companion.defId,
        pos: { ...companion.pos },
      });
    }
  }
  return touched;
}

// ---- Phase toggles (called by the app's UI) --------------------------------------

/** Pause into a companion's equip screen. Only possible mid-run. */
export function openCompanionPanel(
  state: GameState,
  companionId: number,
): void {
  if (state.phase !== "playing") return;
  if (!companionById(state, companionId)) return;
  state.companionFocus = companionId;
  state.phase = "companion";
}

/** Close the companion screen and resume (pending level-ups take priority). */
export function closeCompanionPanel(state: GameState): void {
  if (state.phase !== "companion") return;
  state.companionFocus = null;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}
