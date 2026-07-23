// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The horde's tick: per-role AI (moveEnemy), the separation grid, dialogue
// stops, and contact damage. Part of the step pipeline (see ./index.ts).

import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  type Vec2,
} from "@game/lib/vec.ts";
import { stasisFactorAt } from "../abilities.ts";
import {
  APPARITION,
  ENEMY_AI,
  JUMP,
  LAST_STAND,
  PLAYER,
  SPAWNERS,
  STATS,
  ZONES,
} from "../config/index.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { levelDef } from "../defs/levels/index.ts";
import {
  absorbPlayerDamage,
  armorReduction,
  enemyCritChance,
  playerDodgeChance,
  wearWornArmor,
} from "../items/index.ts";
import { queueStruckProcs } from "../loot.ts";
import {
  mechDamageMult,
  mechSpeedMult,
  stepEnemyMechanics,
} from "../mechanics.ts";
import { maybePowerScale } from "../menace.ts";
import { repelFromMerchant } from "../merchant.ts";
import { lineOfSight, resolveObstacles } from "../obstacles.ts";
import { moveRangedEnemy } from "../ranged.ts";
import { raiseAlarm } from "../spawners.ts";
import { startEnemyDialogue, wantsDialogue } from "../story.ts";
import { BALANCE } from "../tuning.ts";
import type { Enemy, GameState } from "../types/index.ts";
import { stepPatrol, strollAtWork } from "../working.ts";
import { repelFromZones } from "../zones.ts";

export function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  // On the gentle rungs the plain horde loses its legs the moment the player
  // ENGAGES an elite or boss, so he can push through the swarm to the set piece
  // instead of being dog-piled at it (mobPursuitNearElite). "Engaged" means the
  // encounter has actually started — the set piece is awake (elites latch it),
  // wounded, or the player has walked inside its aggro range — not merely that
  // one sleeps somewhere on the map (which would slow the whole level and gut
  // the "idle play loses" promise). Computed once per tick; apparitions are
  // ghosts, not a fight, so they never count.
  const setPieceEngaged =
    (difficultyDef(state.difficulty).mobPursuitNearElite ?? 1) < 1 &&
    state.enemies.some((e) => {
      const d = enemyDef(e.defId);
      if (d.apparition || (d.role !== "elite" && d.role !== "boss")) {
        return false;
      }
      return (
        e.awake === true ||
        e.hp < e.maxHp ||
        distance(player.pos, e.pos) < d.ai.aggroRadius ||
        distance(player.pos, e.home) < d.ai.aggroRadius
      );
    });

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    if (enemy.critFlashMs) {
      enemy.critFlashMs = Math.max(0, enemy.critFlashMs - dtMs);
    }
    // The FROST CHILL a companion's nova stamped runs down here; its slow is
    // read live in moveEnemy while it lasts (chillFactorFor).
    if (enemy.chillMs) {
      enemy.chillMs = Math.max(0, enemy.chillMs - dtMs);
    }
    if (enemy.vanishMs !== undefined) {
      enemy.vanishMs = Math.max(0, enemy.vanishMs - dtMs);
    }
    moveEnemy(state, enemy, dt, setPieceEngaged);
  }

  // Apparitions whose linger ran out dissolve off the board.
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i] as Enemy;
    if (enemy.vanishMs === undefined || enemy.vanishMs > 0) continue;
    state.enemies.splice(i, 1);
    state.events.push({
      type: "apparitionVanished",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
  }

  separateEnemies(state);

  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Grounded monsters never clear an obstacle — even the jumpable ones.
    // Ghostly monsters drift straight through instead.
    if (!def.phasing) resolveObstacles(state, enemy.pos, def.radius);
    // The merchant's ward shoos the horde off his stall (ghosts included —
    // the ward is not a wall). Bosses are too massive, apparitions too
    // immaterial; everything else keeps its distance.
    if (def.role !== "boss" && !def.apparition) {
      repelFromMerchant(state, enemy.pos);
    }
    // SAFE ZONES keep the trash horde out of the pocket (see zones.ts): only
    // the minion swarm is ejected — set pieces (elites/bosses) hold their
    // authored posts, so a safe zone must be authored clear of them.
    if (def.role === "minion") {
      repelFromZones(
        levelDef(state.level.id).safeZones,
        enemy.pos,
        def.radius + ZONES.repelMargin,
      );
    }
    enemy.pos.x = clamp(
      enemy.pos.x,
      def.radius,
      state.level.width - def.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y,
      def.radius,
      state.level.height - def.radius,
    );

    // Speakers with an unplayed scene stop the world once they're visibly
    // close: elites at the end of their rush, bosses at the stare-down.
    if (def.role !== "minion" && wantsDialogue(state, enemy)) {
      startEnemyDialogue(state, enemy);
    }

    // An apparition's touch is cold air — no contact damage, ever.
    if (def.apparition) continue;

    // Monsters drift along the ground — a player at the top of a moon jump
    // sails clean over their grasp. The reach is pulled in a little under the
    // bodies' touching distance (contactReachMult), so a foe must press into
    // the hero to bite — a last-instant sidestep is a clean escape, not a graze.
    const touchReach = (def.radius + PLAYER.radius) * PLAYER.contactReachMult;
    const touching =
      player.z <= JUMP.dodgeHeight &&
      distanceSq(enemy.pos, player.pos) <= touchReach * touchReach;
    if (touching && enemy.contactCooldownMs <= 0) {
      // The swing is spent whether it lands or is dodged, so the same foe
      // can't re-swing next frame after a sidestep.
      enemy.contactCooldownMs = def.contactCooldownMs;
      // Pre-combat grace while the weapon is holstered: no blow lands. The
      // blade is drawn by the scripted vanguard's PROXIMITY, not its touch (see
      // stepOpeningStrike, run each tick above), so every contact in this window
      // is a harmless bump — including the vanguard's own, until it has closed
      // in and armed the hero.
      if (player.disarmed) {
        continue;
      }
      // A nimble hero sidesteps the blow entirely: no HP, no armor, no hit.
      // DEXTERITY drives it, LUCK nudges it (see `playerDodgeChance`).
      if (state.rng() < playerDodgeChance(state)) {
        state.events.push({ type: "playerDodge", pos: { ...player.pos } });
        continue;
      }
      const crit = state.rng() < enemyCritChance(state, def.critChance);
      // A boss backed into its last stand hits like a cornered animal.
      const lastStand =
        def.role === "boss" && enemy.hp <= enemy.maxHp * LAST_STAND.hpFraction;
      // A power-matched elite/boss hits harder too (contactMult, softened —
      // set once when it engaged; 1 for un-scaled mobs and every minion).
      // Its set-piece mechanics stack on top: the charge's impact while
      // dashing, the enrage's fury once turned (mechDamageMult).
      const damage = Math.round(
        def.contactDamage *
          (enemy.contactMult ?? 1) *
          mechDamageMult(enemy, def) *
          (crit ? STATS.critMultiplier : 1) *
          (lastStand ? LAST_STAND.damageMultiplier : 1) *
          BALANCE.mobDamage,
      );
      // Worn armor turns its share of the physical blow — the D2 curve
      // against THIS attacker's level (see armorReduction) — and the hit
      // wears every worn piece a point, whether or not it turned much.
      const hpDamage = Math.max(
        0,
        Math.round(damage * (1 - armorReduction(state, enemy.mlvl))),
      );
      wearWornArmor(state);
      // The magical ward soaks its share first (and every hit pauses SPIRIT
      // health regen — see `absorbPlayerDamage`).
      player.hp -= absorbPlayerDamage(state, hpDamage);
      player.hurtFlashMs = 250;
      state.stats.damageTaken += damage;
      state.events.push({ type: "playerHurt", crit, cause: enemy.defId });
      // The landed blow may cast back — the D2 "when struck" procs.
      queueStruckProcs(state, enemy);
    }
  }
}

// Spatial hash reused across steps: at horde scale (hundreds alive) the old
// all-pairs separation is the tick's hotspot, and reusing the map keeps
// per-tick allocation down to the bucket arrays.
const separationGrid = new Map<number, Enemy[]>();

/**
 * Push overlapping monsters apart so packs spread instead of collapsing
 * into a single stacked blob. Neighbors are found through a uniform grid
 * (cell = separation distance): any pair closer than one cell shares a
 * cell or sits in adjacent ones, so only those pairs are tested.
 */
function separateEnemies(state: GameState): void {
  // Packs may overlap a bit (ENEMY_AI.overlapFraction) so a kited horde
  // bunches into one clump instead of a rigid crystal.
  const cell = ENEMY_AI.separation * (1 - ENEMY_AI.overlapFraction);
  // Level width caps near a few thousand px, so cell columns stay < 2¹⁶
  // and this key never collides.
  const keyOf = (x: number, y: number) =>
    Math.floor(x / cell) * 65536 + Math.floor(y / cell);

  separationGrid.clear();
  for (const enemy of state.enemies) {
    const key = keyOf(enemy.pos.x, enemy.pos.y);
    const bucket = separationGrid.get(key);
    if (bucket) bucket.push(enemy);
    else separationGrid.set(key, [enemy]);
  }

  for (const a of state.enemies) {
    const kx = Math.floor(a.pos.x / cell);
    const ky = Math.floor(a.pos.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = separationGrid.get((kx + dx) * 65536 + (ky + dy));
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.id <= a.id) continue; // handle each pair once
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const dSq = dx * dx + dy * dy;
          if (dSq >= cell * cell || dSq === 0) continue;
          const d = Math.sqrt(dSq);
          // Push strength divided by d folds the direction normalization in.
          const push = (cell - d) / 2 / d;
          a.pos.x -= dx * push;
          a.pos.y -= dy * push;
          b.pos.x += dx * push;
          b.pos.y += dy * push;
        }
      }
    }
  }
}

/**
 * Enemy AI: haunt the spawn point, chase when the player wanders close,
 * drift home when they escape. Waking on proximity needs line of sight —
 * a wall the player can't jump over also hides them (ghostly monsters
 * sense straight through; wounds wake anything). Bosses guard their post
 * instead — they wake when the player nears it (or once wounded) but never
 * stray past their leash. Elites sleep at their post until the player comes
 * close (or hurts them), then rush into view for their scene and hunt
 * forever after.
 */
/** The frost-chill slow a companion's nova stamped on `enemy`: its
 * `chillFactor` while `chillMs` runs, 1 otherwise. Multiplies onto the stasis
 * factor at every move site, so a chilled mob inside a stasis field crawls. */
function chillFactorFor(enemy: Enemy): number {
  return (enemy.chillMs ?? 0) > 0 ? (enemy.chillFactor ?? 1) : 1;
}

function moveEnemy(
  state: GameState,
  enemy: Enemy,
  dt: number,
  setPieceEngaged: boolean,
): void {
  const player = state.player;
  const def = enemyDef(enemy.defId);
  // A meteor blast flung this mob: while the launch coasts (stepKnockback owns
  // the movement) the AI sits out, so the fling reads as a fling instead of the
  // chase immediately fighting it back.
  if (enemy.knockMs && enemy.knockMs > 0) return;
  // Set-piece mechanics first (mechanics.ts): a mob rooted in a telegraph
  // windup or riding a charge dash is owned by the mechanic this tick.
  if (stepEnemyMechanics(state, enemy, dt, dt * 1000)) return;
  // Stasis fields (and a companion's frost chill) slow whatever crawls inside
  // them — bosses included. An enraged set piece runs hot (mechSpeedMult).
  const speed =
    enemy.speed *
    stasisFactorAt(state, enemy.pos) *
    chillFactorFor(enemy) *
    mechSpeedMult(enemy, def);
  const senses = () =>
    def.phasing === true || lineOfSight(state, enemy.pos, player.pos);

  // SUMMONED reinforcements (spawners.ts) RUN IN from off-screen at a sprint —
  // straight at the hero, ignoring line of sight, since they were called to him —
  // until they cross the APPROACH CIRCLE stamped at summon time (the shorter
  // viewport dimension). On crossing it they shed the marker and fall through to
  // their normal role AI at their own pace; they were summoned awake, so a minion
  // engages at once instead of dozing at the post it never had.
  if (enemy.approachRadius !== undefined) {
    if (
      distanceSq(enemy.pos, player.pos) >
      enemy.approachRadius * enemy.approachRadius
    ) {
      enemy.pos = moveToward(
        enemy.pos,
        player.pos,
        speed * SPAWNERS.runInSpeedMult * dt,
      );
      return;
    }
    enemy.approachRadius = undefined;
    enemy.awake = true;
  }

  if (def.role === "boss") {
    const awake =
      enemy.hp < enemy.maxHp ||
      ((distance(player.pos, enemy.home) < def.ai.aggroRadius ||
        distance(player.pos, enemy.pos) < def.ai.aggroRadius) &&
        senses());
    // The stare-down is the fight starting: match the player's power now, so
    // the boss is worthy whether the player opens with a shot or a charge.
    if (awake) maybePowerScale(state, enemy);
    // A SHOOTER boss (the zAI controllers) fights at range once woken: hold
    // distance, peek for the shot, hide behind the rocks between shots. Its
    // cover dance replaces the leash — cover-seeking keeps it near its post.
    // An unplayed speaker still closes in first (the stare-down needs the
    // speak radius), exactly like an elite's rush.
    const speechPending = !enemy.spoke && (def.dialogue?.length ?? 0) > 0;
    if (awake && def.ranged && !speechPending) {
      moveRangedEnemy(state, enemy, speed, dt);
      return;
    }
    const leashed =
      def.ai.leashRadius !== undefined &&
      distance(enemy.pos, enemy.home) > def.ai.leashRadius;
    const target = awake && !leashed ? player.pos : enemy.home;
    enemy.pos = moveToward(enemy.pos, target, speed * dt);
    return;
  }

  if (def.role === "elite") {
    // An apparition that has had its scene walks off into the noise and
    // dissolves — the vanish countdown arms here, on the first playing tick
    // after the dialogue closed, and stepEnemies removes it at zero.
    if (def.apparition && enemy.spoke) {
      enemy.vanishMs ??= APPARITION.lingerMs;
      const away = direction(player.pos, enemy.pos);
      enemy.pos.x += away.x * speed * dt;
      enemy.pos.y += away.y * speed * dt;
      return;
    }
    if (!enemy.awake) {
      enemy.awake =
        enemy.hp < enemy.maxHp ||
        (distance(player.pos, enemy.pos) < def.ai.aggroRadius && senses());
      if (!enemy.awake) {
        // A patrolling elite (the manager pacing his floor) walks its route;
        // a working one (the janitor mopping his patch) potters around its
        // post — either way the wake check above reads its live pos, so the
        // dormant motion never blunts the ambush.
        if (enemy.patrol) {
          stepPatrol(state, enemy, speed, dt);
        } else if (def.ai.idle === "work") {
          strollAtWork(state, enemy, def.radius, speed, dt);
        }
        return;
      }
      // Just woke: power-match the player before the ambush rush lands —
      // unless it is an apparition, which never fights anything. An
      // alarm-linked speaker calls its spawn point as the scene springs.
      if (!def.apparition) maybePowerScale(state, enemy);
      raiseAlarm(state, enemy);
    }
    // The rush: an unplayed speaker closes in far faster than it fights,
    // so the scene starts seconds after the ambush springs. Once it has
    // spoken (or never had lines) it settles into its fighting speed.
    const rushing = !enemy.spoke && (def.dialogue?.length ?? 0) > 0;
    // A SHOOTER that has said its piece fights at range instead of charging:
    // hold distance, peek for the shot, and (takesCover) hide behind the
    // rocks between shots — see moveRangedEnemy in ranged.ts.
    if (!rushing && def.ranged) {
      moveRangedEnemy(state, enemy, speed, dt);
      return;
    }
    const rushSpeed =
      (def.ai.rushSpeed ?? def.speed) *
      stasisFactorAt(state, enemy.pos) *
      chillFactorFor(enemy);
    enemy.pos = moveToward(
      enemy.pos,
      player.pos,
      (rushing ? rushSpeed : speed) * dt,
    );
    return;
  }

  // The scripted vanguard (openingStrike): it HOLDS at its post until the
  // opening survey beat has played, then breaks from the pack and sprints the
  // still-holstered hero down, STOPPING the instant it's next to him — its
  // harmless swing is what draws the blade (story.ts). Holding until the beat
  // means the scene always reads in order: the "look at this place" monologue
  // first, THEN the lone scientist rushing in and striking — never a rusher
  // that beats the hero's first read to him and sits glued while the gate is
  // shut. Parking at contact (instead of charging on) means it can't clip
  // through the hero and shove him around while it waits to strike. Once the
  // blade is out (`!disarmed`) it drops the sprint and falls through to the
  // normal minion chase at its plain `speed`, a lab scientist the armed hero
  // cuts down.
  if (enemy.vanguard && player.disarmed) {
    const opening = levelDef(state.level.id).openingStrike;
    // Hold at the post while the strike's ordering gate is still shut — the
    // rush waits on the hero's opening read, so he isn't rushed before he has
    // even looked around.
    if (opening?.after && !state.thoughtsSeen.includes(opening.after)) {
      return;
    }
    const rushSpeed =
      (def.ai.rushSpeed ?? def.speed) *
      stasisFactorAt(state, enemy.pos) *
      chillFactorFor(enemy);
    // Close to the same tightened contact distance the damage test uses, so a
    // rusher settles exactly where it can actually bite (not a hair short of it).
    const gap =
      distance(enemy.pos, player.pos) -
      (def.radius + PLAYER.radius) * PLAYER.contactReachMult;
    if (gap > 0) {
      enemy.pos = moveToward(
        enemy.pos,
        player.pos,
        Math.min(rushSpeed * dt, gap),
      );
    }
    return;
  }

  // Minions aggro on RANGE *and* a clear LINE. Waking needs the hero in range
  // and in sight; and the chase now needs that sight to HOLD — a wall between
  // the monster and the hero breaks the aggro, so it drifts back home instead of
  // grinding into the wall toward a hero it can't see. A hero who rounds a shelf
  // out of view leaves the patch quiet; step back into the lane and it re-locks.
  // (In the open, sight is always clear, so the horde chases as relentlessly as
  // before — only walls change anything.)
  const inRange =
    distanceSq(player.pos, enemy.pos) < def.ai.aggroRadius * def.ai.aggroRadius;
  const sees = senses();
  if (!inRange) {
    enemy.awake = false;
  } else if (!enemy.awake) {
    enemy.awake = enemy.hp < enemy.maxHp || sees;
    // An alarm-linked mob (a stationed foreman, a patrolling sentry) calls
    // its spawn point the moment it wakes — see raiseAlarm in spawners.ts.
    if (enemy.awake) raiseAlarm(state, enemy);
  }

  if (inRange && enemy.awake && sees) {
    // Gentle-rung mercy: once the player has engaged an elite/boss the plain
    // horde crawls (easy 10%, medium 50%) so he can break for the set piece.
    const pursuit = setPieceEngaged
      ? (difficultyDef(state.difficulty).mobPursuitNearElite ?? 1)
      : 1;
    enemy.pos = moveToward(
      enemy.pos,
      flankTarget(state, enemy),
      speed * pursuit * dt,
    );
  } else if (enemy.patrol) {
    // A PATROLLER walks its authored route while dormant (and resumes it
    // when a chase breaks) — the WoW-style wandering sentry.
    stepPatrol(state, enemy, speed, dt);
  } else if (def.ai.idle === "work") {
    // Off the clock — back to work: the dormant stroll around `home` replaces
    // the frozen stand-still (and the beeline home after a broken chase), so
    // the night shift reads as a crew working the floor.
    strollAtWork(state, enemy, def.radius, speed, dt);
  } else if (distanceSq(enemy.pos, enemy.home) > 16) {
    enemy.pos = moveToward(
      enemy.pos,
      enemy.home,
      speed * (def.ai.returnSpeedFactor ?? 0.5) * dt,
    );
  }
}

/**
 * Where a chasing minion actually steers: the player, or — from
 * `ENEMY_AI.flankFromIndex` up the difficulty ladder — a point rotated off
 * the direct bearing by up to `flankAngleDeg`, each mob to its own
 * deterministic side (its id's parity), the angle easing out as it closes so
 * the pack fans into an envelope at range and still converges for the bite.
 * The gentle rungs keep the honest straight-line conga.
 */
function flankTarget(state: GameState, enemy: Enemy): Vec2 {
  const player = state.player;
  if (difficultyDef(state.difficulty).index < ENEMY_AI.flankFromIndex) {
    return player.pos;
  }
  const dx = enemy.pos.x - player.pos.x;
  const dy = enemy.pos.y - player.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 24) return player.pos; // at the bite — go straight in
  // Ease the rotation off as the mob closes (full at ~3 screens, none at
  // contact), and alternate sides by id parity so the pack splits pincer-like.
  const ease = Math.min(1, dist / 360);
  const side = enemy.id % 2 === 0 ? 1 : -1;
  const angle = ((ENEMY_AI.flankAngleDeg * Math.PI) / 180) * ease * side;
  // Rotate the player-to-enemy bearing and aim at the point the same
  // distance out along it — walking that ray closes distance while drifting
  // around the flank.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: player.pos.x + (dx * cos - dy * sin) * 0.5,
    y: player.pos.y + (dx * sin + dy * cos) * 0.5,
  };
}
