// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The weapon auto-attack: target picking (nearestEnemy — shared with the
// conjured powers), the melee cone sweep, and the trigger pull that mints
// projectiles. Part of the step pipeline (see ./index.ts).

import { direction, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { AIM, JUMP } from "../config/index.ts";
import { cratesInCone, damageCrate, nearestCrate } from "../crates.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponDef } from "../defs/equipment.ts";
import {
  maxMeleeTargets,
  rollWeaponHit,
  weaponCooldownFor,
  weaponCritMult,
  weaponRangeFor,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
} from "../items/index.ts";
import { hitEnemy } from "../loot.ts";
import { lineOfSight } from "../obstacles.ts";
import {
  talentCleavingEcho,
  talentPiercing,
  talentTwinStrike,
  talentVolley,
} from "../talent-effects.ts";
import type {
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Projectile,
  WeaponClass,
} from "../types/index.ts";

/**
 * The character fights autonomously with whatever is in the weapon slot:
 * melee weapons strike the nearest monster in reach directly, the rest fire
 * a projectile at it. Only monsters inside the current view (input.view)
 * are targets — the character never shoots at enemies the player can't see.
 */
export function stepWeapon(
  state: GameState,
  input: GameInput,
  dtMs: number,
): void {
  const player = state.player;
  // Holstered on levels with a scripted opening strike: the auto-attack sits
  // out entirely until the vanguard's first swing draws the blade (story.ts).
  if (player.disarmed) return;
  // Knocked out cold: no swings from a hero flat on his back. The cooldown
  // holds where it froze, so the blade is ready the moment he stands.
  if (player.knockoutMs > 0) return;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;
  // Manual fire (input.fire === false): the trigger is up, so the attack
  // waits — past the cooldown tick above, keeping the weapon ready to fire
  // the instant the player presses.
  if (input.fire === false) return;

  const equipped = player.equipment.weapon;
  const weapon = weaponDef(equipped.defId);
  // Airborne over the fight: a melee weapon can't reach the grounded horde
  // while the hero floats above it — the same z rule (JUMP.dodgeHeight) that
  // lets enemies pass beneath him stays his blade. The cooldown keeps ticking
  // down mid-air (decremented above), so the swing is ready the instant he
  // lands. Ranged and magic still fire from height (shots leave at his z).
  if (!weapon.projectile && player.z > JUMP.dodgeHeight) return;
  // No target through a wall: the character never wastes a swing or a shot
  // on a monster it can't actually reach. INTELLIGENCE widens every weapon's
  // reach, so a high-INT build strikes from a touch further out.
  const range = weaponRangeFor(state, equipped);
  // A desktop mouse tilts the pick toward whatever the cursor points at (a unit
  // bearing from the hero); a pointer resting on the hero has no bearing, so the
  // zero vector below falls straight back to the nearest foe.
  const aim = input.aim ? direction(player.pos, input.aim) : undefined;
  const target = nearestEnemy(
    state.enemies,
    player.pos,
    range,
    input.view,
    (enemy) => lineOfSight(state, player.pos, enemy.pos),
    aim,
  );
  // With no foe in reach, the auto-attack turns on the nearest breakable CRATE
  // and smashes it open for loot. Enemies always win the pick above; a crate is
  // only chased once none are targetable, so a lone crate in a cleared room
  // still gets cracked while combat is never diverted onto a box.
  //
  // But a MANUAL trigger (input.fire === true — desktop AIM & SHOOT with
  // auto-fire off, the only scheme that sets a boolean gate) means "shoot the
  // mob I'm aiming at": a held button must never fire on a crate when no foe is
  // in reach, so a player holding down the trigger between fights doesn't burn
  // the weapon on boxes. There the pull stays inert until a mob is reachable.
  const targetPos =
    target?.pos ??
    (input.fire === true
      ? undefined
      : nearestCrate(state, player.pos, range, input.view)?.pos);
  if (!targetPos) return;

  // The speed stat quickens the cadence: DEX (melee & ranged) and INT (magic)
  // each drop the effective cooldown as they rise.
  player.weaponCooldownMs = weaponCooldownFor(state, equipped);
  const dir = direction(player.pos, targetPos);
  if (!weapon.projectile) {
    // A swing cleaves a cone: the nearest monster is the aim, and every other
    // monster within reach and inside the weapon's arc is struck in the same
    // blow — but only the nearest `maxMeleeTargets` of them (INT raises that
    // cap). A blade sweeps a wide slash; a spear thrusts a narrow cone far.
    const half = weaponSweepHalfAngle(state, equipped);
    const swingEvent = {
      type: "swing" as const,
      pos: { ...player.pos },
      dir,
      range,
      arc: half * 2,
      // Filled in by meleeSweep below with the uncapped eligible count.
      targets: 0,
    };
    state.events.push(swingEvent);
    // CLEAVING ECHO (melee tree): a chance for this swing to cleave EXTRA foes
    // past the weapon's cap. One roll per swing; untrained draws no rng.
    let cap = maxMeleeTargets(state);
    const cleave = talentCleavingEcho(state);
    if (cleave && state.rng() < cleave.chance) cap += cleave.extraTargets;
    swingEvent.targets = meleeSweep(
      state,
      dir,
      range,
      half,
      equipped,
      cap,
      weapon.class,
      weaponCritMult(state, equipped),
    );
    // The same swing smashes any breakable crate inside its cone — free
    // collateral in a fight, and the whole point of a swing aimed at a crate.
    // Each box rolls its own weapon blow, exactly like a cleaved mob.
    for (const crate of cratesInCone(state, player.pos, dir, range, half)) {
      damageCrate(state, crate, rollWeaponHit(state, equipped).damage);
    }
    // Wear AFTER the strike so the blow lands with the weapon that swung.
    wearEquippedWeapon(state);
    return;
  }

  // One trigger pull, `count` projectiles: a single shot flies straight at
  // the aim; a shotgun's volley fans its pellets evenly across `spreadDeg`
  // around it. Every pellet carries the weapon's full per-hit damage, each
  // rolled INDEPENDENTLY inside the weapon's variance band — so a volley's
  // pellets bite for a spread of numbers, not one repeated figure. The fan
  // itself is the falloff (fewer pellets connect at range).
  const spec = weapon.projectile;
  let count = Math.max(1, spec.count ?? 1);
  let spread = ((spec.spreadDeg ?? 0) * Math.PI) / 180;
  // VOLLEY (ranged tree): a chance for one trigger pull to loose EXTRA
  // projectiles in a spread — even a single-shot weapon fans them. One roll per
  // pull; untrained draws no rng.
  if (weapon.class === "ranged") {
    const vol = talentVolley(state);
    if (vol && state.rng() < vol.chance) {
      count += vol.extra;
      spread = Math.max(spread, (vol.spreadDeg * Math.PI) / 180);
    }
  }
  // PIERCING SHOT (ranged tree): the hero's shots punch through extra bodies at
  // a rank-softened falloff (applied per body in stepProjectiles).
  const pierce = weapon.class === "ranged" ? talentPiercing(state) : null;
  // One id for the whole trigger pull: every pellet shares it, so the ranged AoE
  // calibration can group a volley's hits and count the DISTINCT foes it reached
  // (see each hit's `enemyHit.fromVolley`). Marks the hero's shots only.
  const volley = state.nextId++;
  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);
    const pelletDir = {
      x: dir.x * cos - dir.y * sin,
      y: dir.x * sin + dir.y * cos,
    };
    const hit = rollWeaponHit(state, equipped);
    const projectile: Projectile = {
      id: state.nextId++,
      pos: { ...player.pos },
      dir: pelletDir,
      speed: spec.speed,
      radius: spec.radius,
      damage: hit.damage,
      damageRoll: hit.roll,
      lifetimeMs: spec.lifetimeMs,
      weaponClass: weapon.class,
      sprite: spec.sprite,
      // The shot leaves from the shooter's height and sinks back in flight.
      z: player.z,
      volley,
    };
    if (spec.pierce) projectile.pierceLeft = spec.pierce;
    if (pierce) {
      projectile.pierceLeft = (projectile.pierceLeft ?? 0) + pierce.pierce;
      projectile.pierceFalloff = pierce.retain;
    }
    if (spec.homing) projectile.homing = spec.homing;
    if (spec.chain) projectile.chain = spec.chain;
    projectile.critMult = weaponCritMult(state, equipped);
    state.projectiles.push(projectile);
  }
  state.stats.shotsFired++;
  state.events.push({
    type: "shot",
    weaponClass: weapon.class,
    pos: { ...player.pos },
    dir,
  });
  wearEquippedWeapon(state);
}

/**
 * Resolve a melee swing's cone: strike every monster within `range` of the
 * player and inside `halfAngle` of the aim `dir`. Each body takes its OWN
 * damage roll (crits roll per hit inside hitEnemy too), so one swing bites a
 * crowd for a spread of numbers rather than stamping the same figure on all of
 * them. The nearest monster — the aim — always sits at the cone's centre, so a
 * swing never whiffs the target it locked onto; the arc just lets it cleave
 * whatever else it faces. A monster touching the player has no meaningful
 * bearing and is always in reach. Walls still block: a monster behind cover is
 * spared even inside the cone. Iterates a snapshot because hitEnemy removes the
 * slain from state.enemies.
 */
function meleeSweep(
  state: GameState,
  dir: Vec2,
  range: number,
  halfAngle: number,
  weapon: Equipment,
  maxTargets: number,
  weaponClass: WeaponClass,
  critMult: number,
): number {
  const player = state.player;
  const rangeSq = range * range;
  const cosHalf = Math.cos(halfAngle);
  // Gather every foe the cone can reach, then strike only the `maxTargets`
  // NEAREST of them: the swing catches the crowd closest to the blade, and
  // the locked-on target (always the nearest) is guaranteed among them.
  // Collecting first — instead of hitting inside the loop — keeps the cap
  // honest even though hitEnemy mutates state.enemies as foes fall.
  const eligible: { enemy: Enemy; distSq: number }[] = [];
  for (const enemy of state.enemies) {
    const dx = enemy.pos.x - player.pos.x;
    const dy = enemy.pos.y - player.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) continue;
    const def = enemyDef(enemy.defId);
    // The blade sweeps clean through an apparition — nothing to strike.
    if (def.apparition) continue;
    const radius = def.radius;
    // Overlapping the player: no bearing to test, always struck. Otherwise the
    // enemy must fall inside the cone (compare cosines, no atan2 needed).
    if (distSq > radius * radius) {
      const dist = Math.sqrt(distSq);
      const dot = (dx * dir.x + dy * dir.y) / dist;
      if (dot < cosHalf) continue;
    }
    if (!lineOfSight(state, player.pos, enemy.pos)) continue;
    eligible.push({ enemy, distSq });
  }
  eligible.sort((a, b) => a.distSq - b.distSq);
  // One id for the whole swing: every body the cleave bites shares it, so
  // menace judges the sweep as ONE attack (see bankOverkill) however many
  // fodder it drops.
  const attack = state.nextId++;
  // TWIN STRIKE (melee tree): a chance each blow echoes for a second hit. Read
  // once for the swing; the per-hit roll is gated on it so untrained draws no rng.
  const twin = talentTwinStrike(state);
  for (let i = 0; i < eligible.length && i < maxTargets; i++) {
    // Roll each body's blow on its own so a cleave lands a spread of numbers.
    const { damage, roll } = rollWeaponHit(state, weapon);
    const target = (eligible[i] as (typeof eligible)[number]).enemy;
    hitEnemy(state, target, damage, weaponClass, {
      rollAccuracy: true,
      critMult,
      damageRoll: roll,
      attack,
    });
    // The echo lands only on a foe the primary blow left standing — a spliced
    // corpse must never be re-hit — and omits `rollAccuracy` so it never
    // re-procs or misses (a guaranteed follow-through at `echoFrac` damage).
    if (twin && target.hp > 0 && state.rng() < twin.chance) {
      hitEnemy(state, target, damage * twin.echoFrac, weaponClass, {
        critMult,
        attack,
      });
    }
  }
  // The UNCAPPED eligible count (all foes in the cone, before the maxTargets
  // trim) — the geometry × density read the AoE calibration buckets by arc.
  return eligible.length;
}

export function nearestEnemy(
  enemies: Enemy[],
  from: Vec2,
  range: number,
  view?: GameInput["view"],
  clear?: (enemy: Enemy) => boolean,
  aim?: Vec2,
): Enemy | undefined {
  const rangeSq = range * range;
  // With a pointer bearing (desktop mouse) the pick is scored by distance
  // AND alignment with the cursor, so the aimed-at foe wins over a closer one
  // off to the side; without it (or a zero bearing) it's the plain nearest.
  const aimed = aim !== undefined && (aim.x !== 0 || aim.y !== 0);
  let best: Enemy | undefined;
  let bestScore = aimed ? Infinity : rangeSq;
  for (const enemy of enemies) {
    if (view && !insideView(enemy.pos, view)) continue;
    // Apparitions are never targets — the weapon (and the storm) look
    // straight through them at the real crowd.
    if (enemyDef(enemy.defId).apparition) continue;
    const dSq = distanceSq(from, enemy.pos);
    if (dSq > rangeSq) continue;
    let score = dSq;
    if (aimed) {
      const dist = Math.sqrt(dSq);
      // Alignment of the foe's bearing with the cursor's: 1 dead ahead of the
      // pointer, −1 directly behind the hero from it. A foe on top of the hero
      // has no bearing — count it perfectly aligned so a point-blank threat is
      // never pushed away by the bias.
      const dot =
        dist === 0
          ? 1
          : ((enemy.pos.x - from.x) * aim.x + (enemy.pos.y - from.y) * aim.y) /
            dist;
      score = dist * (1 + AIM.biasStrength * (1 - dot) * 0.5);
    }
    // `clear` (line of sight) is checked lazily — only for candidates that
    // would actually win — so its cost scales with improvements, not with
    // the whole horde.
    if (score <= bestScore && (!clear || clear(enemy))) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/** Is a world position on screen (inside the camera rect)? */
function insideView(pos: Vec2, view: NonNullable<GameInput["view"]>): boolean {
  return (
    pos.x >= view.x &&
    pos.x <= view.x + view.width &&
    pos.y >= view.y &&
    pos.y <= view.y + view.height
  );
}
