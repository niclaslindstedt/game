// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's own tick: steering + jump physics + stamina, the powerup dock
// (`useItem`), the consumable dock, and the screen-nuke detonation. Part of
// the step pipeline (see ./index.ts).

import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
} from "@game/lib/vec.ts";
import {
  abilityPowerScale,
  discardHeldAbility,
  grantAbility,
  isSlotActive,
  moveHeldSlot,
  removeHeldSlot,
} from "../abilities.ts";
import { JUMP, KNOCKBACK, NUKE, PLAYER, STAMINA } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import {
  consumeManaPotion,
  consumeMedkit,
  consumeRepairKit,
  consumeStaminaPotion,
  effectiveStat,
  playerSpeed,
} from "../items/index.ts";
import { hitEnemy } from "../loot.ts";
import { lineOfSight, resolveObstacles } from "../obstacles.ts";
import { talentJumpMods, talentSeismic } from "../talent-effects.ts";
import { BALANCE } from "../tuning.ts";
import type { GameInput, GameState } from "../types/index.ts";

export function stepPlayer(
  state: GameState,
  input: GameInput,
  dt: number,
  dtMs: number,
): void {
  const player = state.player;
  player.hurtFlashMs = Math.max(0, player.hurtFlashMs - dtMs);
  player.moving = false;

  // KNOCKED OUT (a sand storm caught him): the hero lies prone and HELPLESS on
  // the floor. Hold him flat and still, tick the timer, and bail before any
  // input is read — no move, jump, or velocity — so every downstream pass
  // (weapon, spells, items, all gated on `knockoutMs`) sits out too. He is
  // still fully open to the horde while he's down. He gets up the instant the
  // timer lapses, emitting the "up you get" cue.
  if (player.knockoutMs > 0) {
    player.vel.x = 0;
    player.vel.y = 0;
    player.z = 0;
    player.vz = 0;
    player.knockoutMs = Math.max(0, player.knockoutMs - dtMs);
    if (player.knockoutMs === 0) {
      state.events.push({ type: "knockoutRecovered", pos: { ...player.pos } });
    }
    return;
  }

  // A gentle nudge of the dpad walks slowly; a full push runs. The throttle
  // never fully stops the walk (a held-but-centered finger still creeps) and
  // defaults to full speed for headless callers that omit it.
  const throttle = clamp(input.throttle ?? 1, 0, 1);
  // An empty stamina pool caps the top speed to a winded jog until it recovers.
  const staminaFactor = player.stamina > 0 ? 1 : STAMINA.emptySpeedFactor;
  // Standing still until proven moving — the realized velocity the smart
  // shooters lead with (stepRangedAttacks) must read zero for a parked hero.
  player.vel.x = 0;
  player.vel.y = 0;

  if (
    input.steering &&
    distance(player.pos, input.target) > PLAYER.arriveRadius
  ) {
    const before = player.pos;
    const next = moveToward(
      player.pos,
      input.target,
      playerSpeed(state) * throttle * staminaFactor * dt,
    );
    if (dt > 0) {
      player.vel.x = (next.x - before.x) / dt;
      player.vel.y = (next.y - before.y) / dt;
    }
    player.facing = direction(before, input.target);
    // The sprite flip only follows decisively horizontal movement —
    // near-vertical steering would otherwise mirror-flicker every step.
    if (Math.abs(player.facing.x) >= PLAYER.faceFlipMinX) {
      player.faceLeft = player.facing.x < 0;
    }
    // Walking stirs the horde: bank the distance for the wave spawner.
    state.moveSpawnCredit += distance(before, next);
    player.pos = next;
    player.moving = true;
  }

  // Stamina is a strict three-pace ladder. RUNNING (any throttle above the
  // walk pace) spends the pool at the FULL drain rate — easing the stick off
  // buys nothing until the pace drops to a true walk. A WALK (throttle at or
  // below walkThrottle) regains a trickle on the move (walkRegenFactor of
  // the standstill rate), and standing still takes the full breather
  // (rate = 1, by far the fastest refill). The STAMINA stat deepens the
  // reserve (computeMaxStamina) and, here, both slows the drain and quickens
  // the regen. A JUMP takeoff also spends the pool (jumpCost), and any
  // draining pace or jump that bottoms it out freezes regen until the hero
  // has stood dead still for emptyRegenLockMs uninterrupted (moving re-arms
  // the wait) — only after that stand does even the walk regain again.
  const staminaStat = effectiveStat(state, "stamina");
  // SPRING HEELS (ranged tree): higher, longer jumps, and at rank 5 a cheaper
  // takeoff. `velocityMult` lifts the launch speed; `costMult` (< 1 only at
  // rank 5) trims the stamina a hop spends. Both 1 when untrained.
  const jumpMods = talentJumpMods(state);
  const jumpCost = STAMINA.jumpCost * jumpMods.costMult;
  // A jump only fires from the ground AND only when the sprint pool can cover
  // its takeoff cost — a winded hero (too little stamina to pay `jumpCost`)
  // can't hop and must walk it off, the same way an empty pool caps him to a
  // jog. Gated on the pool as it stands at the FRAME START (before this frame's
  // run drain), so it reads the same value the caller sees. The takeoff physics
  // below share this flag.
  const jumping =
    input.jump &&
    player.z === 0 &&
    player.stamina >= jumpCost * player.maxStamina;
  let rate = 1;
  if (player.moving) {
    rate =
      throttle <= STAMINA.walkThrottle
        ? STAMINA.walkRegenFactor
        : STAMINA.runRateFactor;
  }
  const draining = rate < 0;
  if (draining) {
    // Draining — harder difficulties wind the hero a touch faster
    // (staminaDrainMult); the STAMINA stat slows the burn.
    const drain =
      (-rate *
        STAMINA.drainPerSec *
        difficultyDef(state.difficulty).staminaDrainMult) /
      (1 + staminaStat * STAMINA.drainReductionPerPoint);
    player.stamina = Math.max(0, player.stamina - drain * dt);
  }
  if (jumping) {
    // A hop costs a flat slice of the FULL pool per takeoff, independent of dt
    // (Spring Heels trims the slice at rank 5).
    player.stamina = Math.max(0, player.stamina - jumpCost * player.maxStamina);
    // Book the takeoff — the stamina-discipline stat the balance sim reports.
    state.stats.jumps++;
  }
  // A draining pace or a jump that bottoms the pool out arms the regen lockout;
  // a later run/jump that re-empties it re-arms the full window.
  if ((draining || jumping) && player.stamina <= 0) {
    state.staminaRegenLockMs = STAMINA.emptyRegenLockMs;
  }
  // Recover at the breather rate — 1 standing still, walkRegenFactor at a
  // walk pace — when no jump fired this frame and once the lockout has
  // lapsed; the STAMINA stat quickens it. A running pace keeps `rate` < 0,
  // so a runner never regains.
  if (!draining && !jumping && state.staminaRegenLockMs <= 0) {
    const regen =
      rate * STAMINA.regenPerSec * (1 + staminaStat * STAMINA.regenPerPoint);
    player.stamina = Math.min(player.maxStamina, player.stamina + regen * dt);
  }
  // The lockout is a STANDSTILL debt: it only runs down while the hero stands
  // dead still. ANY movement (even a walk) or a takeoff re-arms the full
  // window — a spent-out hero owes emptyRegenLockMs of uninterrupted stand
  // before the pool starts coming back.
  if (state.staminaRegenLockMs > 0) {
    state.staminaRegenLockMs =
      player.moving || jumping
        ? STAMINA.emptyRegenLockMs
        : Math.max(0, state.staminaRegenLockMs - dtMs);
  }

  // Track how long the pool has sat BONE-DRY so the stamina-drink mercy roll can
  // ramp its chance with time stranded (see `staminaDrinkChance`); any stamina
  // back resets it, so catching a breath drops straight back to the baseline.
  state.staminaEmptyMs = player.stamina <= 0 ? state.staminaEmptyMs + dtMs : 0;

  // Jump: only from the ground. Gravity is the level's — the moon's low g
  // turns the same takeoff into a high, floaty arc.
  if (jumping) {
    // Spring Heels lifts the takeoff speed for a higher, farther arc.
    player.vz = JUMP.velocity * jumpMods.velocityMult;
    player.z = player.vz * dt;
    state.events.push({ type: "jump" });
  } else if (player.z > 0 || player.vz !== 0) {
    player.vz -= state.level.gravity * dt;
    player.z += player.vz * dt;
    if (player.z <= 0) {
      player.z = 0;
      player.vz = 0;
      state.events.push({ type: "land" });
      // SEISMIC LANDING (melee tree): a trained warlord's touchdown slams the
      // ground — AoE damage + knockback (fired only when the talent is owned).
      applySeismicLanding(state);
    }
  }

  // Solid ground features: only jumpable ones can be cleared, and only
  // while actually high enough — landing on one pushes the player off it.
  resolveObstacles(state, player.pos, PLAYER.radius, player.z);

  // The level is finite: clamp to its bounds.
  player.pos.x = clamp(
    player.pos.x,
    PLAYER.radius,
    state.level.width - PLAYER.radius,
  );
  player.pos.y = clamp(
    player.pos.y,
    PLAYER.radius,
    state.level.height - PLAYER.radius,
  );
}

/**
 * SEISMIC LANDING (melee-tree talent): the trained hero's jump touchdown slams
 * the ground for AoE damage + a knockback shove over `TALENTS.seismic.radius`.
 * The damage is a flat base × `abilityPowerScale` (like the conjurations), so a
 * landing stays a level-relevant chunk all campaign, and it's class-less — no
 * mob armor, and it heats the menace meter like the hero's own build power (no
 * `noMenace`). Victims are snapshotted before hitEnemy splices the slain. A
 * no-op when the talent isn't owned (fires only on a `land` where it's trained).
 */
function applySeismicLanding(state: GameState): void {
  const seismic = talentSeismic(state);
  if (!seismic) return;
  const player = state.player;
  state.events.push({
    type: "seismicLanding",
    pos: { ...player.pos },
    radius: seismic.radius,
  });
  const power = abilityPowerScale(state);
  const reachSq = seismic.radius * seismic.radius;
  const victims = state.enemies.filter(
    (e) =>
      !enemyDef(e.defId).apparition && distanceSq(e.pos, player.pos) <= reachSq,
  );
  // One landing = one menace ATTACK (see bankOverkill), however many it catches.
  const attack = state.nextId++;
  for (const victim of victims) {
    if (victim.hp <= 0) continue;
    // Shove the body clear of the impact (before the blow may splice it), the
    // same role-scaled displacement as the weapon knockback affix.
    const def = enemyDef(victim.defId);
    const scale = KNOCKBACK.roleScale[def.role] * BALANCE.knockback;
    const dir = direction(player.pos, victim.pos);
    if (scale > 0 && (dir.x !== 0 || dir.y !== 0)) {
      const push = seismic.knockback * scale;
      victim.pos.x = clamp(
        victim.pos.x + dir.x * push,
        def.radius,
        state.level.width - def.radius,
      );
      victim.pos.y = clamp(
        victim.pos.y + dir.y * push,
        def.radius,
        state.level.height - def.radius,
      );
      resolveObstacles(state, victim.pos, def.radius);
    }
    hitEnemy(state, victim, seismic.damage * power, undefined, { attack });
  }
}

/**
 * Spend one banked ability pickup on the `useItem` input edge. By default the
 * oldest still-banked slot kicks in; `useItemIndex` names a specific dock slot.
 * A slot whose power is already running is skipped (it counts down in place),
 * and an index landing on one — or out of range — falls back to the oldest
 * banked slot; with none banked the input is a quiet no-op.
 *
 * A spent power does NOT leave its slot: it keeps counting down there (linked
 * via ActiveAbility.slot) and only frees the slot when it lapses, so the dock
 * stays full while it runs. The instant NUKE is the exception — it fires and
 * vacates its slot at once. grantAbility emits the abilityStarted event; a
 * non-stackable power already running refuses to re-activate (grantAbility
 * returns false), leaving its pickup banked rather than wasted.
 */
export function stepUseItem(state: GameState, input: GameInput): void {
  // Dock housekeeping first, so a spend in the same step names the dock as it
  // stands AFTER the move/drop: reorder (`moveItem`), then discard
  // (`dropItemIndex` — a banked pickup is destroyed, a running slot merely
  // unlinks and frees), then the spend below.
  if (input.moveItem) {
    moveHeldSlot(state, input.moveItem.from, input.moveItem.to);
  }
  if (input.dropItemIndex !== undefined) {
    discardHeldAbility(state, input.dropItemIndex);
  }
  if (!input.useItem) return;
  const held = state.player.heldAbilities;
  const wanted = input.useItemIndex;
  const usable =
    wanted !== undefined &&
    wanted >= 0 &&
    wanted < held.length &&
    !isSlotActive(state, wanted);
  const index = usable
    ? wanted
    : held.findIndex((_, i) => !isSlotActive(state, i));
  if (index < 0) return;
  const defId = held[index];
  if (!defId) return;
  const def = abilityDef(defId);
  if (def.nuke) {
    removeHeldSlot(state, index);
    detonateNuke(state, def.nuke.radius);
    return;
  }
  // The slot keeps its powerup while the copy runs; grantAbility links the copy
  // to `index`. A refused re-activation (a running non-stackable power) starts
  // nothing and leaves the slot as it was.
  grantAbility(state, defId, index);
}

/**
 * Spend a stacked consumable on the player's input edge: `useMedkit` heals with
 * the best-quality kit held, `useStaminaPotion` refills the sprint pool, and
 * `useRepairKit` mends the whole kit (and re-equips durability-booted weapons).
 * All three are quiet no-ops when nothing is held or there is nothing to top up
 * (see consumeMedkit / consumeStaminaPotion / consumeRepairKit), so a mistap
 * never wastes a kit.
 */
export function stepUseConsumables(state: GameState, input: GameInput): void {
  if (input.useMedkit) consumeMedkit(state);
  if (input.useStaminaPotion) consumeStaminaPotion(state);
  if (input.useManaPotion) consumeManaPotion(state);
  if (input.useRepairKit) consumeRepairKit(state);
}

/**
 * The screen-nuke pickup: a blast over the radius that hits EVERY monster it
 * reaches — minion, elite, or boss, no one exempt — for 200% of the mean health
 * of the mobs on screen (`NUKE.meanHpDamageMult`). That mean is low against a
 * horde of rank and file, so the blast wipes them outright, while the far
 * heavier elites and bosses are only chunked — the set-piece fights still have
 * to be finished by hand. A tall obstacle stops the blast the same way it stops
 * a shot — a mob sheltered behind the stone rides it out. Damage flows through
 * hitEnemy, so the blow can CRIT like any other and XP, loot rolls, the pity
 * rule, and the all-clear trophy all behave exactly as if the player had done
 * it the hard way — except the screen-nuke slices themselves (`noNukeDrop`): a
 * bomb's kills never chain into another bomb.
 */
/**
 * ?debug only: set off a screen-nuke at the hero without spending a pickup,
 * at the shipped NUKE ability's radius — drives the app's `window.__nuke()`
 * FX preview hook (the flash/fire/smoke overlay plus the incinerated-skeleton
 * kills). Not reachable in normal play.
 */
export function debugDetonateNuke(state: GameState): void {
  detonateNuke(state, abilityDef("screen_nuke").nuke?.radius ?? 240);
}

function detonateNuke(state: GameState, radius: number): void {
  state.events.push({ type: "nuke", pos: { ...state.player.pos } });
  const radiusSq = radius * radius;
  const caught = state.enemies.filter((enemy) => {
    const def = enemyDef(enemy.defId);
    return (
      !def.apparition &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq &&
      lineOfSight(state, state.player.pos, enemy.pos)
    );
  });
  // Flat blast damage: NUKE.meanHpDamageMult (200%) of the MEAN current hp of
  // everything caught. Snapshot the mean BEFORE any blow lands so a lone
  // heavyweight can't be measured against its own already-chunked bar, and so
  // every mob in the blast takes the same size hit.
  const meanHp =
    caught.length > 0
      ? caught.reduce((sum, enemy) => sum + enemy.hp, 0) / caught.length
      : 0;
  const blast = meanHp * NUKE.meanHpDamageMult;
  for (const enemy of caught) {
    hitEnemy(state, enemy, blast, undefined, {
      noNukeDrop: true,
      noMenace: true,
      incinerated: true,
    });
  }
  // THE AFTERMATH (config NUKE): a screen-nuke is a panic button, so it buys
  // real breathing room. Open the calm window — stepSpawner holds every refill
  // while it runs, so the ring can't instantly repopulate the screen the blast
  // just cleared — and cool the transient menace heat down to the earned
  // permanent floor (the ratchet the player's own overkill locked in still
  // stands), dumping the banked walk-credit lure too. Together the pack the
  // player fled from stays gone long enough to lose, and the horde that does
  // return is no denser or more evolved than the run's baseline — the bomb
  // helps instead of dooming the run. The recovery window arms alongside the
  // calm and only starts counting once the calm burns off: it eases the near-
  // floor back from empty to full so the swarm WALKS back in at the ordinary
  // rate rather than the whole floor snapping onto the player the instant the
  // hold releases ("they respawn more than I killed").
  state.nukeCalmMs = NUKE.calmMs;
  state.nukeRecoverMs = NUKE.recoverMs;
  state.menace = state.menaceFloor;
  state.moveSpawnCredit = 0;
}
